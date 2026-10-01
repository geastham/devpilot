import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadBridgeCredentials, saveBridgeCredentials } from '@devpilot.sh/bridge-client';
import {
  LAUNCHD_LABEL,
  bridgePaths,
  bridgeStatus,
  failureLines,
  installService,
  launchdPlist,
  readState,
  realSystem,
  rotateLog,
  servicePathEnv,
  splitConnectArgs,
  startBridge,
  stopBridge,
  systemdUnit,
  tailLog,
  uninstallService,
  type BridgePaths,
  type BridgeSystem,
  type RunResult,
  type ServiceSpec,
} from '../../src/commands/bridge/service';

/**
 * The bridge as a background process and as a login service.
 *
 * Start and stop are exercised for real: a detached child is spawned, found
 * again through `ps`, signalled, and waited for. What stands in for the bridge
 * is a stub script launched exactly as the CLI would be — `node <script>
 * bridge connect <args>` — which records how it was launched and prints the
 * lines `connect` prints (`✓ Registered`, `✗ Registration failed`).
 *
 * `launchctl` and `systemctl` are never run. Every test's system has `run`
 * replaced by a recorder, so what is checked for the login service is what
 * would be written and which commands would be issued, in which order — not
 * what launchd or systemd then do with them. Everything lives under a temp
 * home; the real `~/.devpilot` and `~/Library/LaunchAgents` are not touched.
 */

// The shape of a real machine token. If this string turns up anywhere but the
// credentials file, something wrote a secret where it can be read.
const TOKEN = 'dp_orch_test_3f6c1f0e9a1b4c2d8e7f';
const URL = 'https://bridge.example.test';

/** Short waits: a stub answers in the time it takes node to start. */
const WAIT = { waitMs: 8_000, pollMs: 25, settleMs: 200 };

let home: string;
let paths: BridgePaths;
/** Every process a test started, so none outlives it. */
let started: number[];

beforeEach(() => {
  // realpath: on macOS the temp directory is a symlink, and `ps` reports the
  // resolved path.
  home = realpathSync(mkdtempSync(join(tmpdir(), 'dp-bridge-service-')));
  paths = bridgePaths(home, { DEVPILOT_BRIDGE_STATE_DIR: join(home, 'state') });
  started = [];
});

afterEach(() => {
  for (const pid of started) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, which is what most tests leave behind.
    }
  }
});

type Behaviour = 'registers' | 'rejects' | 'silent' | 'ignores-sigterm' | 'dies-after-registering';

/**
 * A stand-in for the CLI's bin script. It writes down the arguments and the
 * credential environment it was given, then behaves like `connect` does in
 * one of the ways that matter to `start`.
 */
function stubBridge(behaviour: Behaviour): { script: string; launch: () => any } {
  const script = join(home, `devpilot-${behaviour}.js`);
  const record = join(home, `launch-${behaviour}.json`);
  const body: Record<Behaviour, string> = {
    registers: `
console.log('✓ Registered');
console.log('   orchestrator: orch_stub');
process.on('SIGTERM', () => { console.log('✓ Disconnected'); process.exit(0); });
setInterval(() => {}, 1000);`,
    rejects: `
console.error('✗ Registration failed');
console.error('   401 Unauthorized');
process.exit(1);`,
    silent: `
setInterval(() => {}, 1000);`,
    'ignores-sigterm': `
console.log('✓ Registered');
process.on('SIGTERM', () => { console.log('still finishing a run…'); });
setInterval(() => {}, 1000);`,
    'dies-after-registering': `
console.log('✓ Registered');
setTimeout(() => { console.error('TypeError: fetch failed'); process.exit(1); }, 50);`,
  };
  writeFileSync(
    script,
    `#!/usr/bin/env node
const fs = require('fs');
fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  url: process.env.DEVPILOT_BRIDGE_URL ?? null,
  token: process.env.DEVPILOT_BRIDGE_TOKEN ?? null,
  sessionKey: process.env.DEVPILOT_SESSION_API_KEY ?? null,
}));
console.log('🌉 DevPilot bridge');
${body[behaviour]}
`,
    'utf8',
  );
  chmodSync(script, 0o755);
  return { script, launch: () => JSON.parse(readFileSync(record, 'utf8')) };
}

interface TestSystem extends BridgeSystem {
  /** Every `launchctl` / `systemctl` invocation, as `[command, ...args]`. */
  calls: string[][];
  /** Every signal sent. */
  signals: Array<[number, string]>;
  /** Every process spawned, with the argv it was given. */
  spawns: Array<{ command: string; args: string[] }>;
}

/**
 * The real system for processes; a recorder for the service managers.
 *
 * `respond` decides what `launchctl` / `systemctl` answer. The default is the
 * answer of a machine where nothing is loaded and every request succeeds.
 */
function system(
  options: {
    platform?: NodeJS.Platform;
    respond?: (call: string[]) => Partial<RunResult> | undefined;
    /**
     * What a scan for `bridge connect` processes finds. Empty unless a test
     * says otherwise — the real scan would find whatever bridge the person
     * running the tests has going, and the tests must not depend on that.
     */
    bridges?: () => number[];
  } = {},
): TestSystem {
  const real = realSystem();
  const sys: TestSystem = {
    ...real,
    platform: options.platform ?? 'darwin',
    uid: 501,
    calls: [],
    signals: [],
    spawns: [],
    bridgeProcesses: () => options.bridges?.() ?? [],
    spawnDetached(command, args, spawnOptions) {
      sys.spawns.push({ command, args });
      const pid = real.spawnDetached(command, args, spawnOptions);
      if (pid !== null) started.push(pid);
      return pid;
    },
    kill(pid, signal) {
      sys.signals.push([pid, signal]);
      return real.kill(pid, signal);
    },
    run(command, args) {
      const call = [command, ...args];
      sys.calls.push(call);
      const answer = options.respond?.(call);
      if (answer) return { status: 0, stdout: '', stderr: '', ...answer };
      const asksIfLoaded = args[0] === 'print' || args.includes('show');
      return { status: asksIfLoaded ? 1 : 0, stdout: '', stderr: '' };
    },
  };
  return sys;
}

function launch(script: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return { paths, args, node: process.execPath, script, env: { PATH: process.env.PATH, ...env }, cliVersion: '0.0.0-test', wait: WAIT };
}

/** Every file under `dir` whose contents include `needle`. */
function filesContaining(dir: string, needle: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...filesContaining(path, needle));
    else if (readFileSync(path, 'utf8').includes(needle)) found.push(path);
  }
  return found;
}

const isAlive = (pid: number) => realSystem().isAlive(pid);

describe('what is forwarded to the bridge', () => {
  /**
   * A command line is readable by every process on the machine. The token is
   * taken out in every form commander would have accepted it in.
   */
  it('takes the token and URL out, however they were written, and keeps the rest in order', () => {
    for (const form of [
      ['--token', TOKEN, '--url', URL],
      [`--token=${TOKEN}`, `--url=${URL}`],
      ['-t', TOKEN, '-u', URL],
      [`-t${TOKEN}`, `-u${URL}`],
    ]) {
      const split = splitConnectArgs(['--repos', 'acme/widget', ...form, '--plan', '--name', 'build box']);
      expect(split).toMatchObject({ url: URL, token: TOKEN, noSave: false });
      expect(split.forwarded).toEqual(['--repos', 'acme/widget', '--plan', '--name', 'build box']);
    }
  });

  it('treats the session runner’s key as a secret too', () => {
    const split = splitConnectArgs(['--mode', 'claude-session', '--session-api-key', 'runner-secret', '--session-api-url', 'http://127.0.0.1:3900']);
    expect(split.sessionApiKey).toBe('runner-secret');
    expect(split.forwarded).toEqual(['--mode', 'claude-session', '--session-api-url', 'http://127.0.0.1:3900']);
  });

  /** `--tokn dp_orch_…` is not `--token`, so it would be forwarded like any other flag. */
  it('forwards nothing token-shaped, whatever flag it came under', async () => {
    const split = splitConnectArgs(['--repos', 'acme/widget', '--tokn', TOKEN]);
    expect(split.invalid).toMatch(/other than --token/);
    expect(split.forwarded).toEqual([]);

    const sys = system();
    expect((await startBridge(launch(stubBridge('registers').script, ['--tokn', TOKEN]), sys)).status).toBe('invalid-args');
    expect(sys.spawns).toEqual([]);
    expect(filesContaining(home, TOKEN)).toEqual([]);
  });

  it('says so when a flag that needs a value has none, rather than swallowing the next flag', () => {
    expect(splitConnectArgs(['--token']).invalid).toBe('--token needs a value.');
    expect(splitConnectArgs(['--token', '--plan']).invalid).toBe('--token needs a value.');
  });
});

describe('the service files', () => {
  const spec: ServiceSpec = {
    home: '/Users/someone',
    node: '/opt/homebrew/bin/node',
    script: '/opt/homebrew/lib/node_modules/@devpilot.sh/cli/bin/devpilot.js',
    args: ['--repos', 'acme/widget,acme/gadget', '--name', 'R&D <build> box', '--plan'],
    logPath: '/Users/someone/.devpilot/bridge/bridge.log',
    path: servicePathEnv({
      node: '/opt/homebrew/bin/node',
      claude: '/Users/someone/.local/bin/claude',
      envPath: '/usr/bin:/opt/homebrew/bin:/Users/someone/bin',
    }),
  };

  /**
   * A service is not started from a shell and does not get a shell's PATH.
   * Node is usually wherever a version manager put it, `claude` under the
   * home directory, and the bridge runs both.
   */
  it('builds a PATH with node’s directory first, then claude’s, then the caller’s, without repeats', () => {
    expect(spec.path).toBe(
      '/opt/homebrew/bin:/Users/someone/.local/bin:/usr/bin:/Users/someone/bin:/usr/local/bin:/bin:/usr/sbin:/sbin',
    );
    // No claude on the machine is ordinary, and leaves no empty entry behind.
    expect(servicePathEnv({ node: '/usr/bin/node', claude: null, envPath: '' })).toBe(
      '/usr/bin:/usr/local/bin:/opt/homebrew/bin:/bin:/usr/sbin:/sbin',
    );
  });

  it('writes a LaunchAgent that runs `bridge connect` with the arguments, at login, and keeps it alive', () => {
    const plist = launchdPlist(spec);
    expect(plist).toContain(`<key>Label</key>\n  <string>${LAUNCHD_LABEL}</string>`);

    const strings = [...plist.split('<key>ProgramArguments</key>')[1].split('</array>')[0].matchAll(/<string>(.*)<\/string>/g)].map((m) => m[1]);
    expect(strings).toEqual([
      '/opt/homebrew/bin/node',
      '/opt/homebrew/lib/node_modules/@devpilot.sh/cli/bin/devpilot.js',
      'bridge',
      'connect',
      '--repos',
      'acme/widget,acme/gadget',
      '--name',
      // An argument is text inside XML. Unescaped, this one ends the plist.
      'R&amp;D &lt;build&gt; box',
      '--plan',
    ]);

    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).toContain(`<key>PATH</key>\n    <string>${spec.path}</string>`);
    expect(plist).toContain(`<key>StandardOutPath</key>\n  <string>${spec.logPath}</string>`);
    expect(plist).toContain(`<key>StandardErrorPath</key>\n  <string>${spec.logPath}</string>`);
    expect(plist).not.toContain('R&D');
    expect(plist).not.toContain('<build>');
  });

  /**
   * The assertions above read the plist as text. This hands it to macOS's own
   * property-list parser, which is the closest thing to launchd reading it
   * that does not involve loading anything: `plutil` only parses a file.
   */
  it.runIf(process.platform === 'darwin')('produces a plist macOS parses, with every argument read back exactly', () => {
    const awkward = ['--name', `R&D <build> "box" 'one' 100%`, '--cockpit-url', 'http://127.0.0.1:3000/?a=1&b=2', '--repos', 'acme/widget'];
    const file = join(home, 'lint.plist');
    writeFileSync(file, launchdPlist({ ...spec, home: '/Users/some one', args: awkward }));

    const parsed = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
    expect(parsed.ProgramArguments).toEqual([spec.node, spec.script, 'bridge', 'connect', ...awkward]);
    expect(parsed).toMatchObject({
      Label: LAUNCHD_LABEL,
      RunAtLoad: true,
      KeepAlive: true,
      WorkingDirectory: '/Users/some one',
      EnvironmentVariables: { PATH: spec.path },
      StandardOutPath: spec.logPath,
      StandardErrorPath: spec.logPath,
    });
  });

  it('writes a systemd user unit that restarts, starts at login, and quotes what needs quoting', () => {
    const unit = systemdUnit({ ...spec, args: ['--name', 'R&D <build> box', '--repos', 'acme/100%-widget', '--cockpit-url', 'http://127.0.0.1:3000'] });
    expect(unit).toContain(
      'ExecStart=/opt/homebrew/bin/node /opt/homebrew/lib/node_modules/@devpilot.sh/cli/bin/devpilot.js bridge connect ' +
        // `%` is a specifier to systemd; a bare one would be expanded or rejected.
        '--name "R&D <build> box" --repos acme/100%%-widget --cockpit-url http://127.0.0.1:3000\n',
    );
    expect(unit).toContain('Restart=always\n');
    expect(unit).toContain(`Environment=PATH=${spec.path}\n`);
    expect(unit).toContain(`StandardOutput=append:${spec.logPath}\n`);
    expect(unit).toContain('[Install]\nWantedBy=default.target\n');
  });

  it('keeps state under DEVPILOT_BRIDGE_STATE_DIR when it is set, and under ~/.devpilot/bridge when it is not', () => {
    expect(paths.statePath).toBe(join(home, 'state', 'state.json'));
    expect(paths.logPath).toBe(join(home, 'state', 'bridge.log'));

    const defaults = bridgePaths('/Users/someone', {});
    expect(defaults.statePath).toBe('/Users/someone/.devpilot/bridge/state.json');
    expect(defaults.logPath).toBe('/Users/someone/.devpilot/bridge/bridge.log');
    expect(defaults.plistPath).toBe('/Users/someone/Library/LaunchAgents/sh.devpilot.bridge.plist');
    expect(defaults.unitPath).toBe('/Users/someone/.config/systemd/user/devpilot-bridge.service');
    expect(defaults.credentialsPath).toBe('/Users/someone/.devpilot/bridge.json');
  });
});

describe('the log', () => {
  it('moves a log past the cap aside and starts a new one in place', () => {
    mkdirSync(paths.stateDir, { recursive: true });
    writeFileSync(paths.logPath, 'x'.repeat(2_000));
    expect(rotateLog(paths.logPath, 5_000)).toBe(false);
    expect(rotateLog(paths.logPath, 1_000)).toBe(true);
    expect(statSync(`${paths.logPath}.1`).size).toBe(2_000);
    // Truncated, not replaced: a service holding the file open keeps writing to it.
    expect(statSync(paths.logPath).size).toBe(0);
  });

  it('shows the lines from the first error on, and the last lines when there was no error line', () => {
    expect(failureLines('🌉 DevPilot bridge\n   https://x\n\n✗ Registration failed\n   401 Unauthorized\n')).toEqual([
      '✗ Registration failed',
      '   401 Unauthorized',
    ]);
    expect(failureLines("error: unknown option '--nope'\n")).toEqual(["error: unknown option '--nope'"]);
    expect(failureLines('one\ntwo\nthree\n', 2)).toEqual(['two', 'three']);
  });

  it('tails the last lines as written, and without the blank ones for status', () => {
    mkdirSync(paths.stateDir, { recursive: true });
    writeFileSync(paths.logPath, 'one\n\ntwo\n\n✓ Listening (poll)\n   Ctrl+C to disconnect.\n\n');
    expect(tailLog(paths.logPath, 3)).toEqual(['', '✓ Listening (poll)', '   Ctrl+C to disconnect.']);
    expect(tailLog(paths.logPath, 3, { skipBlank: true })).toEqual(['two', '✓ Listening (poll)', '   Ctrl+C to disconnect.']);
    expect(tailLog(join(home, 'no-such.log'), 3)).toEqual([]);
  });

  it('never shows a token that found its way into the log', () => {
    mkdirSync(paths.stateDir, { recursive: true });
    writeFileSync(paths.logPath, `connecting with ${TOKEN}\n✗ rejected ${TOKEN}\n`);
    expect(tailLog(paths.logPath, 5).join('\n')).not.toContain(TOKEN);
    expect(failureLines(readFileSync(paths.logPath, 'utf8')).join('\n')).not.toContain(TOKEN);
  });
});

describe('start', () => {
  it('refuses when no token is saved and none was given, and starts nothing', async () => {
    const sys = system();
    const outcome = await startBridge(launch(stubBridge('registers').script, ['--repos', 'acme/widget']), sys);
    expect(outcome).toEqual({ status: 'no-credentials', url: undefined });
    expect(sys.spawns).toEqual([]);
    expect(existsSync(paths.statePath)).toBe(false);
  });

  /**
   * A saved token is only ever offered to the URL it was saved for. Pointing
   * `start` at another bridge without a token for it is a refusal, not a
   * production token sent to whatever host the flag names.
   */
  it('refuses a URL the saved token was not saved for', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const sys = system();
    const outcome = await startBridge(launch(stubBridge('registers').script, ['--url', 'https://elsewhere.example.test']), sys);
    expect(outcome).toEqual({ status: 'no-credentials', url: 'https://elsewhere.example.test' });
    expect(sys.spawns).toEqual([]);
  });

  it('starts the bridge detached, records it, and stop ends it and clears the record', async () => {
    const stub = stubBridge('registers');
    const sys = system();
    const outcome = await startBridge(
      launch(stub.script, ['--token', TOKEN, '--url', URL, '--repos', 'acme/widget', '--plan', '--no-observe']),
      sys,
    );

    expect(outcome).toMatchObject({ status: 'started', url: URL, savedCredentials: true });
    if (outcome.status !== 'started') return;
    expect(isAlive(outcome.pid)).toBe(true);

    // The child was launched as the CLI would be, with everything but the credentials.
    const launched = stub.launch();
    expect(launched.argv).toEqual(['bridge', 'connect', '--repos', 'acme/widget', '--plan', '--no-observe']);
    // Not in the directory `start` was run from, which may not outlive it.
    expect(launched.cwd).toBe(home);

    // What it was started with is on record, for `status`.
    expect(readState(paths)).toMatchObject({
      pid: outcome.pid,
      url: URL,
      args: ['--repos', 'acme/widget', '--plan', '--no-observe'],
      script: stub.script,
      cliVersion: '0.0.0-test',
    });

    // A second start says one is running rather than starting another.
    expect(await startBridge(launch(stub.script, []), sys)).toMatchObject({ status: 'already-running', pid: outcome.pid });
    expect(sys.spawns).toHaveLength(1);

    expect(await stopBridge(paths, sys, { pollMs: 25 })).toEqual({ status: 'stopped', pid: outcome.pid, forced: false });
    expect(isAlive(outcome.pid)).toBe(false);
    expect(existsSync(paths.statePath)).toBe(false);
    // It was asked, and went: the bridge's own shutdown ran.
    expect(sys.signals).toEqual([[outcome.pid, 'SIGTERM']]);
    expect(readFileSync(paths.logPath, 'utf8')).toContain('✓ Disconnected');

    expect(await stopBridge(paths, sys)).toEqual({ status: 'not-running' });
  }, 30_000);

  /**
   * The rule the whole feature is built around. The token is saved to the
   * owner-only credentials file and is nowhere else: not in the arguments the
   * child was given, not in its environment, not in `ps`, not in the state
   * file, not in the log.
   */
  it('puts the token in the credentials file and nowhere else', async () => {
    const stub = stubBridge('registers');
    const sys = system();
    // A stale token still exported in the shell must not be what the child uses.
    const outcome = await startBridge(
      launch(stub.script, [`--token=${TOKEN}`, '-u', URL, '--name', 'build box'], {
        DEVPILOT_BRIDGE_TOKEN: 'dp_orch_stale_from_the_shell',
        DEVPILOT_BRIDGE_URL: 'https://stale.example.test',
      }),
      sys,
    );
    expect(outcome.status).toBe('started');
    if (outcome.status !== 'started') return;

    expect(loadBridgeCredentials(paths.credentialsPath)).toEqual({ url: URL, token: TOKEN });
    expect(statSync(paths.credentialsPath).mode & 0o777).toBe(0o600);

    expect(sys.spawns[0].args).toEqual([stub.script, 'bridge', 'connect', '--name', 'build box']);
    expect(realSystem().commandLine(outcome.pid)).not.toContain('dp_orch_');
    expect(stub.launch()).toMatchObject({ argv: ['bridge', 'connect', '--name', 'build box'], token: null, url: null });
    expect(JSON.stringify(readState(paths))).not.toContain('dp_orch_');
    expect(JSON.stringify(bridgeStatus(paths, sys))).not.toContain('dp_orch_');
    expect(filesContaining(home, TOKEN)).toEqual([paths.credentialsPath]);
  }, 30_000);

  it('hands the session runner’s key to the child in its environment, not its arguments', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const stub = stubBridge('registers');
    const outcome = await startBridge(
      launch(stub.script, ['--mode', 'claude-session', '--session-api-url', 'http://127.0.0.1:3900', '--session-api-key', 'runner-secret']),
      system(),
    );
    expect(outcome).toMatchObject({ status: 'started', savedCredentials: false });
    expect(stub.launch()).toMatchObject({
      argv: ['bridge', 'connect', '--mode', 'claude-session', '--session-api-url', 'http://127.0.0.1:3900'],
      sessionKey: 'runner-secret',
    });
    // Neither the state file nor the log has it. (The stub's own record of its
    // environment does, which is how the line above could be checked.)
    expect(filesContaining(paths.stateDir, 'runner-secret')).toEqual([]);
  }, 30_000);

  /**
   * The failure this is here to prevent: "started" printed for a process that
   * was gone a second later. A rejected token ends `connect` at once, and the
   * lines it printed are what the person needs to see.
   */
  it('fails with the bridge’s own error lines when the child exits straight away', async () => {
    const before = { url: 'https://before.example.test', token: 'dp_orch_the_one_that_worked' };
    saveBridgeCredentials(before, paths.credentialsPath);
    const sys = system();

    const outcome = await startBridge(launch(stubBridge('rejects').script, ['--token', TOKEN, '--url', URL]), sys);
    expect(outcome).toEqual({
      status: 'failed',
      reason: 'exited',
      lines: ['✗ Registration failed', '   401 Unauthorized'],
      logPath: paths.logPath,
    });
    expect(existsSync(paths.statePath)).toBe(false);
    // A token the bridge refused is not the one that stays remembered.
    expect(loadBridgeCredentials(paths.credentialsPath)).toEqual(before);
    expect(bridgeStatus(paths, sys).running).toBe(false);
  }, 30_000);

  it('forgets a refused token entirely when nothing was saved before', async () => {
    const outcome = await startBridge(launch(stubBridge('rejects').script, ['--token', TOKEN, '--url', URL]), system());
    expect(outcome.status).toBe('failed');
    expect(existsSync(paths.credentialsPath)).toBe(false);
  }, 30_000);

  it('fails when the bridge registers and then dies', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const outcome = await startBridge(launch(stubBridge('dies-after-registering').script, []), system());
    expect(outcome).toMatchObject({ status: 'failed', reason: 'exited' });
    if (outcome.status === 'failed') expect(outcome.lines.at(-1)).toBe('TypeError: fetch failed');
    expect(existsSync(paths.statePath)).toBe(false);
  }, 30_000);

  it('stops a bridge that never registers, and leaves nothing running', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const sys = system();
    const outcome = await startBridge({ ...launch(stubBridge('silent').script, []), wait: { ...WAIT, waitMs: 600 } }, sys);
    expect(outcome).toMatchObject({ status: 'failed', reason: 'timeout' });
    expect(started).toHaveLength(1);
    expect(isAlive(started[0])).toBe(false);
    expect(existsSync(paths.statePath)).toBe(false);
  }, 30_000);

  it('only counts a registration this run logged, not one left in the log by the last', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    mkdirSync(paths.stateDir, { recursive: true });
    writeFileSync(paths.logPath, '✓ Registered\n   orchestrator: from-last-week\n');
    const outcome = await startBridge(launch(stubBridge('rejects').script, []), system());
    expect(outcome).toMatchObject({ status: 'failed', lines: ['✗ Registration failed', '   401 Unauthorized'] });
  }, 30_000);

  it('refuses --no-save, which a background bridge cannot honour', async () => {
    const sys = system();
    const outcome = await startBridge(launch(stubBridge('registers').script, ['--token', TOKEN, '--no-save']), sys);
    expect(outcome.status).toBe('invalid-args');
    expect(sys.spawns).toEqual([]);
    expect(existsSync(paths.credentialsPath)).toBe(false);
  });
});

describe('stop', () => {
  /** A long-lived process that is not a bridge, standing in for whatever reused the pid. */
  function bystander(): number {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    started.push(child.pid!);
    return child.pid!;
  }

  function record(pid: number): void {
    mkdirSync(paths.stateDir, { recursive: true });
    writeFileSync(
      paths.statePath,
      JSON.stringify({ pid, startedAt: '2026-09-30T09:00:00.000Z', url: URL, args: [], node: 'node', script: 'devpilot.js', logPath: paths.logPath, cliVersion: '0.0.0-test' }),
    );
  }

  /**
   * A pid file outlives its process, and the kernel reuses the number. The
   * process that has it now is someone's editor, or their database.
   */
  it('does not signal a recorded pid whose command line is not a bridge', async () => {
    const pid = bystander();
    record(pid);
    const sys = system();

    expect(await stopBridge(paths, sys)).toEqual({ status: 'not-ours', pid });
    expect(sys.signals).toEqual([]);
    expect(isAlive(pid)).toBe(true);
    // The record was wrong, so it goes; the next `start` is not blocked by it.
    expect(existsSync(paths.statePath)).toBe(false);
  });

  it('says so plainly when the recorded bridge has already exited', async () => {
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise((done) => child.on('exit', done));
    record(child.pid!);
    const sys = system();

    expect(await stopBridge(paths, sys)).toEqual({ status: 'not-running', stalePid: child.pid });
    expect(sys.signals).toEqual([]);
    expect(existsSync(paths.statePath)).toBe(false);
  });

  it('kills a bridge that does not exit when asked', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const sys = system();
    const outcome = await startBridge(launch(stubBridge('ignores-sigterm').script, []), sys);
    expect(outcome.status).toBe('started');
    if (outcome.status !== 'started') return;

    expect(await stopBridge(paths, sys, { termWaitMs: 400, pollMs: 25 })).toEqual({ status: 'stopped', pid: outcome.pid, forced: true });
    expect(sys.signals).toEqual([
      [outcome.pid, 'SIGTERM'],
      [outcome.pid, 'SIGKILL'],
    ]);
    expect(isAlive(outcome.pid)).toBe(false);
    expect(existsSync(paths.statePath)).toBe(false);
  }, 30_000);

  it('points at uninstall when the bridge that is running belongs to the login service', async () => {
    mkdirSync(dirname(paths.plistPath), { recursive: true });
    writeFileSync(paths.plistPath, '<plist/>');
    const sys = system({ respond: (call) => (call[1] === 'print' ? { status: 0, stdout: '\tstate = running\n\tpid = 4242\n' } : undefined) });
    expect(await stopBridge(paths, sys)).toEqual({ status: 'service-managed', kind: 'launchd' });
    expect(sys.signals).toEqual([]);

    // The same answer when a record from an earlier `start` is still lying about.
    const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    await new Promise((done) => child.on('exit', done));
    record(child.pid!);
    expect(await stopBridge(paths, sys)).toEqual({ status: 'service-managed', kind: 'launchd' });
    expect(existsSync(paths.statePath)).toBe(false);
  });
});

describe('status', () => {
  it('reports nothing saved, nothing running, nothing installed — without asking launchd', () => {
    const sys = system();
    const status = bridgeStatus(paths, sys);
    expect(status).toEqual({
      running: false,
      managedBy: null,
      pid: null,
      since: null,
      args: null,
      credentials: { saved: false, url: null, path: paths.credentialsPath },
      background: null,
      stale: null,
      unmanaged: [],
      service: { supported: true, kind: 'launchd', path: paths.plistPath, installed: false, loaded: false, pid: null, args: null, url: null },
      log: { path: paths.logPath, exists: false, tail: [] },
    });
    // No service file, so nothing of ours can be loaded: no subprocess to say so.
    expect(sys.calls).toEqual([]);
  });

  it('reports a running background bridge: pid, since when, what it was started with, and the log', async () => {
    const stub = stubBridge('registers');
    const sys = system();
    const outcome = await startBridge(launch(stub.script, ['--token', TOKEN, '--url', URL, '--repos', 'acme/widget']), sys);
    if (outcome.status !== 'started') throw new Error(`expected a started bridge, got ${outcome.status}`);

    const status = bridgeStatus(paths, sys);
    expect(status).toMatchObject({
      running: true,
      managedBy: 'background',
      pid: outcome.pid,
      args: ['--repos', 'acme/widget'],
      // Which bridge, and that a token is saved — never the token.
      credentials: { saved: true, url: URL, path: paths.credentialsPath },
      background: { pid: outcome.pid, url: URL, args: ['--repos', 'acme/widget'], cliVersion: '0.0.0-test' },
      stale: null,
      service: { installed: false, loaded: false },
      log: { path: paths.logPath, exists: true },
    });
    expect(status.since).toBe(readState(paths)!.startedAt);
    expect(status.log.tail).toContain('✓ Registered');
    expect(JSON.stringify(status)).not.toContain(TOKEN);

    // Killed behind its back: status says it is gone, and which one it was.
    process.kill(outcome.pid, 'SIGKILL');
    while (isAlive(outcome.pid)) await new Promise((done) => setTimeout(done, 20));
    expect(bridgeStatus(paths, sys)).toMatchObject({
      running: false,
      managedBy: null,
      background: null,
      stale: { pid: outcome.pid, startedAt: status.since },
    });
  }, 30_000);

  /**
   * The `launchctl print` text below is written from that command's output
   * format, not captured from a loaded job: no real launchd job was created
   * while building this. What is under test is that the pid on its `pid =`
   * line is the one reported, and only when that process exists.
   */
  it('reports a bridge the login service is running', () => {
    mkdirSync(dirname(paths.plistPath), { recursive: true });
    writeFileSync(paths.plistPath, '<plist/>');
    mkdirSync(paths.stateDir, { recursive: true });
    writeFileSync(paths.serviceRecordPath, JSON.stringify({ kind: 'launchd', path: paths.plistPath, url: URL, args: ['--plan'] }));

    const print = (pid: number) =>
      `gui/501/${LAUNCHD_LABEL} = {\n\tactive count = 1\n\tpath = ${paths.plistPath}\n\ttype = LaunchAgent\n\tstate = running\n\n\tprogram = /usr/local/bin/node\n\tpid = ${pid}\n}\n`;
    const sys = system({ respond: (call) => (call[1] === 'print' ? { status: 0, stdout: print(process.pid) } : undefined) });

    const status = bridgeStatus(paths, sys);
    expect(sys.calls).toEqual([['launchctl', 'print', `gui/501/${LAUNCHD_LABEL}`]]);
    expect(status).toMatchObject({
      running: true,
      managedBy: 'service',
      pid: process.pid,
      args: ['--plan'],
      background: null,
      service: { supported: true, kind: 'launchd', path: paths.plistPath, installed: true, loaded: true, pid: process.pid, args: ['--plan'], url: URL },
    });
    expect(new Date(status.since!).getTime()).toBeLessThanOrEqual(Date.now());

    // Installed, but launchd does not have it: it is not running, and says which.
    const unloaded = bridgeStatus(paths, system());
    expect(unloaded).toMatchObject({ running: false, managedBy: null, service: { installed: true, loaded: false, pid: null } });
  });

  it('reports a systemd unit from `systemctl show`', () => {
    const linux = bridgePaths(home, { DEVPILOT_BRIDGE_STATE_DIR: join(home, 'state') });
    mkdirSync(dirname(linux.unitPath), { recursive: true });
    writeFileSync(linux.unitPath, '[Unit]\n');
    const sys = system({
      platform: 'linux',
      respond: (call) => (call.includes('show') ? { status: 0, stdout: `MainPID=${process.pid}\nActiveState=active\nUnitFileState=enabled\n` } : undefined),
    });
    expect(bridgeStatus(linux, sys)).toMatchObject({
      running: true,
      managedBy: 'service',
      pid: process.pid,
      service: { kind: 'systemd', path: linux.unitPath, installed: true, loaded: true },
    });
  });

  /**
   * The machine this was built on had a `bridge connect` running that neither
   * `start` nor a service had started. `status` would have said "not running"
   * about it, and the first `start` would have made a second bridge without a
   * word. It is not counted as running — it may be a bridge under a sandbox
   * HOME, which this cannot tell apart — but it is said.
   */
  it('names a bridge that something else started, without counting it as its own', async () => {
    const elsewhere = 4242;
    const sys = system({ bridges: () => [elsewhere, process.pid] });
    expect(bridgeStatus(paths, sys)).toMatchObject({ running: false, managedBy: null, unmanaged: [elsewhere] });

    // `start` and `install` go ahead, and say what else is there.
    const started = await startBridge(launch(stubBridge('registers').script, ['--token', TOKEN, '--url', URL]), sys);
    expect(started).toMatchObject({ status: 'started', others: [elsewhere] });
    if (started.status !== 'started') return;

    // The bridge `start` launched is managed, so it is not listed twice.
    const both = system({ bridges: () => [elsewhere, started.pid] });
    expect(bridgeStatus(paths, both)).toMatchObject({ running: true, pid: started.pid, unmanaged: [elsewhere] });
    expect(JSON.stringify(bridgeStatus(paths, both))).not.toContain('dp_orch_');
  }, 30_000);

  it('finds a detached bridge by scanning this user’s processes', async () => {
    const started = await startBridge(launch(stubBridge('registers').script, ['--token', TOKEN, '--url', URL]), system());
    if (started.status !== 'started') throw new Error(`expected a started bridge, got ${started.status}`);
    // Contains, not equals: whatever real bridge this machine runs is in the list too.
    expect(realSystem().bridgeProcesses()).toContain(started.pid);
    expect(realSystem().bridgeProcesses()).not.toContain(process.pid);
  }, 30_000);

  it('says the login service is not supported where there is none', () => {
    expect(bridgeStatus(paths, system({ platform: 'win32' })).service).toMatchObject({ supported: false, kind: null, installed: false });
  });
});

describe('the login service', () => {
  /** What launchd does on a successful bootstrap, as far as `install` can see: the bridge logs that it registered. */
  const registersWhenLoaded = (verb: string) => (call: string[]) => {
    if (call[1] === verb || call.includes(verb)) appendFileSync(paths.logPath, '🌉 DevPilot bridge\n✓ Registered\n');
    return undefined;
  };

  const installInput = (args: string[], env: NodeJS.ProcessEnv = {}) => ({
    ...launch('/opt/devpilot/bin/devpilot.js', args, { PATH: '/usr/bin:/bin', ...env }),
    node: '/opt/node/bin/node',
    claudePath: '/Users/someone/.local/bin/claude',
  });

  it('writes the LaunchAgent, loads it, and records what it was installed with', async () => {
    const sys = system({ respond: registersWhenLoaded('bootstrap') });
    const outcome = await installService(installInput(['--token', TOKEN, '--url', URL, '--repos', 'acme/widget', '--plan']), sys);

    expect(outcome).toEqual({
      status: 'installed',
      kind: 'launchd',
      path: paths.plistPath,
      url: URL,
      args: ['--repos', 'acme/widget', '--plan'],
      logPath: paths.logPath,
      savedCredentials: true,
      others: [],
    });
    expect(sys.calls).toEqual([['launchctl', 'bootstrap', 'gui/501', paths.plistPath]]);

    const plist = readFileSync(paths.plistPath, 'utf8');
    expect(plist).toContain('<string>/opt/node/bin/node</string>\n    <string>/opt/devpilot/bin/devpilot.js</string>\n    <string>bridge</string>\n    <string>connect</string>\n    <string>--repos</string>');
    expect(plist).toContain('<string>/opt/node/bin:/Users/someone/.local/bin:/usr/bin:/bin:');
    expect(plist).toContain(`<string>${paths.logPath}</string>`);

    // The token went to the credentials file. Not the plist, not the record, not the log.
    expect(loadBridgeCredentials(paths.credentialsPath)).toEqual({ url: URL, token: TOKEN });
    expect(filesContaining(home, TOKEN)).toEqual([paths.credentialsPath]);
    expect(JSON.parse(readFileSync(paths.serviceRecordPath, 'utf8'))).toMatchObject({
      kind: 'launchd',
      path: paths.plistPath,
      url: URL,
      args: ['--repos', 'acme/widget', '--plan'],
    });
  });

  it('falls back to `launchctl load -w` when bootstrap is refused', async () => {
    const sys = system({
      respond: (call) => {
        if (call[1] === 'bootstrap') return { status: 5, stderr: 'Bootstrap failed: 5: Input/output error' };
        return registersWhenLoaded('load')(call);
      },
    });
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const outcome = await installService(installInput([]), sys);
    expect(outcome).toMatchObject({ status: 'installed', savedCredentials: false });
    expect(sys.calls).toEqual([
      ['launchctl', 'bootstrap', 'gui/501', paths.plistPath],
      ['launchctl', 'load', '-w', paths.plistPath],
    ]);
  });

  it('leaves nothing installed when launchd will not load it', async () => {
    const sys = system({ respond: (call) => (call[1] === 'bootstrap' || call[1] === 'load' ? { status: 1, stderr: `${call[1]} failed` } : undefined) });
    const outcome = await installService(installInput(['--token', TOKEN, '--url', URL]), sys);
    expect(outcome).toEqual({ status: 'load-failed', kind: 'launchd', message: 'bootstrap failed\nload failed' });
    expect(existsSync(paths.plistPath)).toBe(false);
    expect(existsSync(paths.serviceRecordPath)).toBe(false);
    expect(existsSync(paths.credentialsPath)).toBe(false);
  });

  /**
   * launchd restarts a KeepAlive job whenever it exits. A service that cannot
   * register — a revoked token, a flag `connect` rejects — would be started
   * and fail again every thirty seconds, indefinitely. So it is taken out.
   */
  it('removes the service again when the bridge it started cannot register', async () => {
    const sys = system({
      respond: (call) => {
        if (call[1] === 'bootstrap') appendFileSync(paths.logPath, '✗ Registration failed\n   401 Unauthorized\n');
        return undefined;
      },
    });
    const outcome = await installService(installInput(['--token', TOKEN, '--url', URL]), sys);
    expect(outcome).toEqual({
      status: 'failed',
      reason: 'exited',
      lines: ['✗ Registration failed', '   401 Unauthorized'],
      logPath: paths.logPath,
    });
    expect(sys.calls).toEqual([
      ['launchctl', 'bootstrap', 'gui/501', paths.plistPath],
      ['launchctl', 'bootout', `gui/501/${LAUNCHD_LABEL}`],
    ]);
    expect(existsSync(paths.plistPath)).toBe(false);
    expect(existsSync(paths.serviceRecordPath)).toBe(false);
    expect(existsSync(paths.credentialsPath)).toBe(false);
  });

  it('writes and enables a systemd user unit on Linux', async () => {
    const sys = system({ platform: 'linux', respond: registersWhenLoaded('enable') });
    const outcome = await installService(installInput(['--token', TOKEN, '--url', URL, '--no-observe']), sys);
    expect(outcome).toMatchObject({ status: 'installed', kind: 'systemd', path: paths.unitPath, args: ['--no-observe'] });
    expect(paths.unitPath).toBe(join(home, '.config', 'systemd', 'user', 'devpilot-bridge.service'));
    expect(sys.calls).toEqual([
      ['systemctl', '--user', 'daemon-reload'],
      ['systemctl', '--user', 'enable', '--now', 'devpilot-bridge.service'],
    ]);

    const unit = readFileSync(paths.unitPath, 'utf8');
    expect(unit).toContain('ExecStart=/opt/node/bin/node /opt/devpilot/bin/devpilot.js bridge connect --no-observe\n');
    expect(unit).toContain('Restart=always');
    expect(unit).toContain('WantedBy=default.target');
    expect(filesContaining(home, TOKEN)).toEqual([paths.credentialsPath]);
  });

  it('refuses without credentials, and writes nothing', async () => {
    const sys = system();
    expect(await installService(installInput(['--repos', 'acme/widget']), sys)).toEqual({ status: 'no-credentials', url: undefined });
    expect(sys.calls).toEqual([]);
    expect(existsSync(paths.plistPath)).toBe(false);
  });

  /** Two bridges on one machine each report every session, and the cockpit shows each twice. */
  it('refuses while a background bridge is running, and start refuses while the service is installed', async () => {
    const stub = stubBridge('registers');
    const sys = system({ respond: registersWhenLoaded('bootstrap') });
    const background = await startBridge(launch(stub.script, ['--token', TOKEN, '--url', URL]), sys);
    if (background.status !== 'started') throw new Error(`expected a started bridge, got ${background.status}`);

    expect(await installService(installInput([]), sys)).toEqual({ status: 'background-running', pid: background.pid });
    expect(sys.calls).toEqual([]);
    expect(existsSync(paths.plistPath)).toBe(false);

    // The other way round: stop it, install, and now start is the one refused.
    await stopBridge(paths, sys, { pollMs: 25 });
    expect((await installService(installInput([]), sys)).status).toBe('installed');

    const loaded = system({ respond: (call) => (call[1] === 'print' ? { status: 0, stdout: '\tpid = 4242\n' } : undefined) });
    expect(await startBridge(launch(stub.script, []), loaded)).toEqual({ status: 'service-installed', kind: 'launchd', path: paths.plistPath, loaded: true });
    // Installed but not loaded still refuses: it would be loaded at the next login.
    const unloaded = system();
    expect(await startBridge(launch(stub.script, []), unloaded)).toEqual({ status: 'service-installed', kind: 'launchd', path: paths.plistPath, loaded: false });
    expect(loaded.spawns).toEqual([]);
    expect(unloaded.spawns).toEqual([]);

    // And a second install does not write over the first.
    expect(await installService(installInput(['--plan']), loaded)).toEqual({ status: 'already-installed', kind: 'launchd', path: paths.plistPath, loaded: true });
  }, 30_000);

  /**
   * The session runner's key could only reach a service by being written into
   * the plist or the unit. It is refused instead, with `start` as the answer.
   */
  it('refuses the session runner’s key, which a service file would have to contain', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const sys = system();
    const outcome = await installService(installInput(['--session-api-key', 'runner-secret']), sys);
    expect(outcome.status).toBe('invalid-args');
    expect(sys.calls).toEqual([]);
    expect(existsSync(paths.plistPath)).toBe(false);
  });

  it('says so where there is no login service to install into', async () => {
    saveBridgeCredentials({ url: URL, token: TOKEN }, paths.credentialsPath);
    const sys = system({ platform: 'win32' });
    expect(await installService(installInput([]), sys)).toEqual({ status: 'unsupported', platform: 'win32' });
    expect(uninstallService(paths, sys)).toEqual({ status: 'unsupported', platform: 'win32' });
    expect(sys.calls).toEqual([]);
  });

  it('uninstall unloads the service and removes its file, and says when there was none', async () => {
    const sys = system({ respond: registersWhenLoaded('bootstrap') });
    await installService(installInput(['--token', TOKEN, '--url', URL]), sys);
    sys.calls.length = 0;

    expect(uninstallService(paths, sys)).toEqual({ status: 'uninstalled', kind: 'launchd', path: paths.plistPath });
    expect(sys.calls).toEqual([['launchctl', 'bootout', `gui/501/${LAUNCHD_LABEL}`]]);
    expect(existsSync(paths.plistPath)).toBe(false);
    expect(existsSync(paths.serviceRecordPath)).toBe(false);
    // Uninstalling is not disconnecting: the token is still this machine's.
    expect(loadBridgeCredentials(paths.credentialsPath)).toEqual({ url: URL, token: TOKEN });

    expect(uninstallService(paths, sys)).toEqual({ status: 'not-installed', kind: 'launchd', path: paths.plistPath });
  });

  it('uninstall falls back to `launchctl unload`, and keeps the file if the service is still loaded', async () => {
    mkdirSync(dirname(paths.plistPath), { recursive: true });
    writeFileSync(paths.plistPath, '<plist/>');

    // bootout refused, the older verb works.
    const fallback = system({ respond: (call) => (call[1] === 'bootout' ? { status: 5, stderr: 'Boot-out failed: 5: Input/output error' } : undefined) });
    expect(uninstallService(paths, fallback).status).toBe('uninstalled');
    expect(fallback.calls).toEqual([
      ['launchctl', 'bootout', `gui/501/${LAUNCHD_LABEL}`],
      // Not `-w`, which would leave the label disabled for the next install.
      ['launchctl', 'unload', paths.plistPath],
    ]);

    // Neither worked and launchd still has it: the file stays, so `status` still sees the service.
    writeFileSync(paths.plistPath, '<plist/>');
    const stuck = system({
      respond: (call) => (call[1] === 'print' ? { status: 0, stdout: '\tpid = 4242\n' } : { status: 1, stderr: 'Operation not permitted' }),
    });
    expect(uninstallService(paths, stuck)).toEqual({ status: 'unload-failed', kind: 'launchd', path: paths.plistPath, message: 'Operation not permitted' });
    expect(existsSync(paths.plistPath)).toBe(true);
  });
});
