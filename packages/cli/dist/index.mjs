#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli.ts
import { Command as Command18 } from "commander";
import updateNotifier from "update-notifier";

// src/version.ts
var VERSION = "0.6.0";

// src/commands/init.ts
import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
var initCommand = new Command("init").description("Initialize DevPilot in the current repository").option("-f, --force", "Overwrite existing configuration").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = join(cwd, ".devpilot");
  const configPath = join(devpilotDir, "config.yaml");
  if (existsSync(configPath) && !options.force) {
    console.log(
      chalk.yellow("\u26A0\uFE0F  DevPilot is already initialized in this directory.")
    );
    console.log(chalk.gray("   Use --force to reinitialize."));
    return;
  }
  if (!existsSync(devpilotDir)) {
    mkdirSync(devpilotDir, { recursive: true });
  }
  const defaultConfig = `# DevPilot Configuration
version: 1

mode: local  # 'local' | 'cloud' | 'hybrid'

database:
  type: sqlite
  path: .devpilot/data.db

sync:
  enabled: false
  endpoint: https://api.devpilot.sh
  org_id: null
  project_id: null

watchers:
  enabled: true
  patterns:
    - "src/**/*.ts"
    - "src/**/*.tsx"
    - "tests/**/*.ts"
  ignore:
    - "**/node_modules/**"
    - "**/.git/**"

ui:
  port: 3847
  open_browser: true
`;
  writeFileSync(configPath, defaultConfig);
  const gitignorePath = join(cwd, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignore = __require("fs").readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/data.db")) {
      const addition = "\n# DevPilot\n.devpilot/data.db\n";
      __require("fs").appendFileSync(gitignorePath, addition);
      console.log(chalk.gray("   Added .devpilot/data.db to .gitignore"));
    }
  }
  console.log(chalk.green("\u2705 DevPilot initialized successfully!"));
  console.log("");
  console.log(chalk.white("Next steps:"));
  console.log(chalk.gray("  1. Run ") + chalk.cyan("devpilot setup") + chalk.gray(" to configure Linear and agent-orchestrator"));
  console.log(chalk.gray("  2. Run ") + chalk.cyan("devpilot serve") + chalk.gray(" to start the local UI"));
  console.log(chalk.gray("  3. Run ") + chalk.cyan("devpilot status") + chalk.gray(" to see fleet status"));
});

// src/commands/serve.ts
import { Command as Command2 } from "commander";
import chalk2 from "chalk";
import open from "open";
import { spawn } from "child_process";
import { existsSync as existsSync2, mkdirSync as mkdirSync2 } from "fs";
import { join as join2, resolve } from "path";
function cockpitEntry() {
  for (const rel of ["../ui/server.js", "../../ui/server.js", "./ui/server.js"]) {
    const entry = resolve(__dirname, rel);
    if (existsSync2(entry)) return entry;
  }
  return null;
}
var serveCommand = new Command2("serve").description("Start the local DevPilot Conductor API server").option("-p, --port <port>", "Port to run the server on", "3847").option("--no-open", "Do not open browser automatically").option("--sync", "Enable cloud sync").option("--db <path>", "Path to SQLite database", ".devpilot/data.db").option(
  "--orchestrator-mode <mode>",
  "Orchestrator mode: claude-session | ao-cli | http | disabled"
).option("--session-api-url <url>", "claude-session dispatcher base URL").option("--session-api-key <key>", "claude-session dispatcher bearer token").option("--ao-project <name>", "ao-cli project name").option("--ao-path <path>", "Path to the ao binary").option("--orchestrator-url <url>", "Remote orchestrator base URL (http mode)").action(async (options) => {
  const port = parseInt(options.port, 10);
  const orchestratorMode = options.orchestratorMode || process.env.DEVPILOT_ORCHESTRATOR_MODE;
  const orchestrator2 = orchestratorMode ? {
    mode: orchestratorMode,
    sessionApiUrl: options.sessionApiUrl || process.env.DEVPILOT_SESSION_API_URL,
    sessionApiKey: options.sessionApiKey || process.env.DEVPILOT_SESSION_API_KEY,
    sessionEnvironmentId: process.env.DEVPILOT_SESSION_ENVIRONMENT_ID,
    callbackToken: process.env.DEVPILOT_CALLBACK_TOKEN,
    aoProjectName: options.aoProject || process.env.DEVPILOT_AO_PROJECT,
    aoPath: options.aoPath || process.env.DEVPILOT_AO_PATH,
    httpUrl: options.orchestratorUrl || process.env.DEVPILOT_ORCHESTRATOR_URL,
    apiKey: process.env.DEVPILOT_ORCHESTRATOR_API_KEY
  } : void 0;
  const dbPath = options.db.startsWith("/") ? options.db : join2(process.cwd(), options.db);
  console.log(chalk2.cyan("\u{1F680} Starting DevPilot Conductor..."));
  console.log("");
  console.log(chalk2.gray(`   Port: ${port}`));
  console.log(chalk2.gray(`   Database: ${dbPath}`));
  console.log("");
  const dbDir = join2(process.cwd(), ".devpilot");
  if (!existsSync2(dbDir)) {
    mkdirSync2(dbDir, { recursive: true });
    console.log(chalk2.gray(`   Created: ${dbDir}`));
  }
  const entry = cockpitEntry();
  if (!entry) {
    console.error(chalk2.red("\u2717 The cockpit bundle is missing from this install."));
    console.error("");
    console.error(chalk2.gray("  Expected: <package>/ui/server.js"));
    console.error(chalk2.gray("  From a repo checkout, build it with:"));
    console.error(chalk2.cyan("    pnpm --filter @devpilot.sh/cli bundle:cockpit"));
    console.error("");
    console.error(chalk2.gray("  If you installed from npm, this is a packaging bug \u2014 please file"));
    console.error(chalk2.gray("  an issue at https://github.com/geastham/devpilot/issues"));
    process.exit(1);
    return;
  }
  const child = spawn(process.execPath, [entry], {
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DEVPILOT_SQLITE_PATH: dbPath,
      ...orchestrator2?.mode ? { DEVPILOT_ORCHESTRATOR_MODE: orchestrator2.mode } : {},
      ...orchestrator2?.sessionApiUrl ? { DEVPILOT_SESSION_API_URL: orchestrator2.sessionApiUrl } : {},
      ...orchestrator2?.sessionApiKey ? { DEVPILOT_SESSION_API_KEY: orchestrator2.sessionApiKey } : {},
      ...orchestrator2?.aoProjectName ? { DEVPILOT_AO_PROJECT: orchestrator2.aoProjectName } : {},
      ...orchestrator2?.aoPath ? { DEVPILOT_AO_PATH: orchestrator2.aoPath } : {},
      ...orchestrator2?.httpUrl ? { DEVPILOT_ORCHESTRATOR_URL: orchestrator2.httpUrl } : {}
    }
  });
  const url = `http://127.0.0.1:${port}`;
  let opened = false;
  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(chalk2.gray(text.replace(/^/gm, "   ")));
    if (!opened && /Ready in|started server|Local:/i.test(text)) {
      opened = true;
      console.log("");
      console.log(chalk2.green("\u2713 Cockpit ready"));
      console.log("");
      console.log(chalk2.cyan(`   ${url}`));
      console.log("");
      console.log(chalk2.gray("   Press Ctrl+C to stop"));
      console.log("");
      if (options.open) void open(url);
    }
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(chalk2.red(`
\u2717 Cockpit exited with code ${code}`));
    }
    process.exit(code ?? 0);
  });
  const stop = () => {
    child.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
});

// src/commands/status.ts
import { Command as Command3 } from "commander";
import chalk3 from "chalk";
import { loadBridgeCredentials } from "@devpilot.sh/bridge-client";
function asComputedScore(value) {
  if (!value || typeof value !== "object") return null;
  const s = value;
  if (typeof s.total !== "number" || typeof s.measuredMax !== "number" || typeof s.complete !== "boolean" || !Array.isArray(s.dimensions)) {
    return null;
  }
  return s;
}
function formatScore(value) {
  const score = asComputedScore(value);
  if (!score) return [];
  const lines = [];
  const measured = score.dimensions.filter((d) => d.value !== null);
  const days = score.windowHours / 24;
  const period = score.windowHours <= 0 ? "" : Number.isInteger(days) ? ` (last ${days === 1 ? "24 hours" : `${days} days`})` : ` (last ${score.windowHours} hours)`;
  if (measured.length === 0) {
    lines.push(`Conductor Score: nothing measured yet${period}`);
  } else if (score.complete) {
    lines.push(`Conductor Score: ${score.total} of ${score.max}${period}`);
  } else {
    lines.push(
      `Conductor Score: ${score.total} of ${score.measuredMax} measured${period} \u2014 ${measured.length} of ${score.dimensions.length} dimensions`
    );
  }
  const width = Math.max(0, ...score.dimensions.map((d) => d.label.length));
  for (const d of score.dimensions) {
    const label = d.label.padEnd(width);
    lines.push(
      d.value === null ? `  ${label}  not measured \u2014 ${d.unmeasured ?? "no data"}` : `  ${label}  ${String(d.value).padStart(3)} / ${d.max}`
    );
  }
  if (measured.length > 0 && !score.complete) {
    lines.push("  A partial score is a personal reading; it is not comparable with another.");
  }
  return lines;
}
async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
var statusCommand = new Command3("status").description("Show what the local cockpit and the bridge connection report").option(
  "--cockpit-url <url>",
  "Local cockpit base URL",
  process.env.DEVPILOT_COCKPIT_URL || "http://127.0.0.1:3847"
).action(async (options) => {
  console.log(chalk3.cyan("DevPilot status"));
  console.log("");
  const saved = loadBridgeCredentials();
  console.log(chalk3.white("Bridge"));
  if (saved) {
    console.log(chalk3.gray("  Connected to: ") + saved.url);
    console.log(chalk3.gray("  Run `devpilot bridge connect` to report this machine's sessions."));
  } else {
    console.log(chalk3.gray("  No bridge saved on this machine."));
    console.log(chalk3.gray("  `devpilot bridge connect --token <token>` connects it; mint a token in"));
    console.log(chalk3.gray("  the dashboard under Settings \u2192 Tokens."));
  }
  console.log("");
  const base = options.cockpitUrl.replace(/\/+$/, "");
  const fleet = await getJson(`${base}/api/fleet/state`);
  console.log(chalk3.white("Local cockpit"));
  if (!fleet) {
    console.log(chalk3.gray(`  Not reachable at ${base}.`));
    console.log(chalk3.gray("  Start it with `devpilot serve`. Fleet, runway and score are read from"));
    console.log(chalk3.gray("  it \u2014 this command does not report them from anywhere else."));
    console.log("");
    return;
  }
  const sessions = fleet.sessions ?? [];
  const active = sessions.filter((s) => (s.status ?? "").toUpperCase() === "ACTIVE").length;
  const capacity = fleet.fleet?.maxSessions;
  console.log(
    chalk3.gray("  Sessions: ") + `${sessions.length}` + chalk3.gray(
      `  (${active} active` + (typeof capacity === "number" ? ` of ${capacity} the fleet can run` : "") + ")"
    )
  );
  const runwayHours = fleet.runway?.hours ?? fleet.runwayHours;
  if (typeof runwayHours === "number") {
    const state = fleet.runway?.status ?? fleet.runwayStatus;
    console.log(
      chalk3.gray("  Runway: ") + `${runwayHours.toFixed(1)}h` + (state ? chalk3.gray(`  (${state})`) : "")
    );
    console.log(chalk3.gray("          an estimate from queue length, not a measured rate"));
  }
  const scoreLines = formatScore(fleet.conductorScore);
  if (scoreLines.length > 0) {
    console.log("");
    console.log(chalk3.gray("  ") + scoreLines[0]);
    for (const line of scoreLines.slice(1)) console.log(chalk3.gray(`  ${line}`));
  }
  console.log("");
});

// src/commands/config.ts
import { Command as Command4 } from "commander";
import { existsSync as existsSync3, readFileSync, writeFileSync as writeFileSync2 } from "fs";
import { join as join3 } from "path";
import chalk4 from "chalk";
import YAML from "yaml";
import { linear } from "@devpilot.sh/core";
var linearCommand = new Command4("linear").description("Configure Linear integration").option("--api-key <key>", "Linear API key").option("--team-id <id>", "Linear team ID").option("--test", "Test the connection").action(async (options) => {
  const configPath = join3(process.cwd(), ".devpilot", "config.yaml");
  if (!existsSync3(configPath)) {
    console.log(chalk4.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = readFileSync(configPath, "utf-8");
  const config = YAML.parse(configContent);
  if (!config.integrations) config.integrations = {};
  if (!config.integrations.linear) config.integrations.linear = {};
  if (options.apiKey) {
    config.integrations.linear.apiKey = options.apiKey;
    writeFileSync2(configPath, YAML.stringify(config));
    console.log(chalk4.green("Linear API key saved."));
  }
  if (options.teamId) {
    config.integrations.linear.teamId = options.teamId;
    writeFileSync2(configPath, YAML.stringify(config));
    console.log(chalk4.green("Linear team ID saved."));
  }
  if (options.test || options.apiKey && options.teamId) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    if (!apiKey || !teamId) {
      console.log(chalk4.yellow("Missing API key or team ID. Set both to test connection."));
      return;
    }
    console.log(chalk4.cyan("Testing Linear connection..."));
    try {
      const client2 = linear.initLinearClient({ apiKey, teamId });
      const team = await client2.getTeam();
      console.log(chalk4.green(`Connected to Linear team: ${team.name} (${team.key})`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(chalk4.red(`Connection failed: ${message}`));
    }
  }
  if (!options.apiKey && !options.teamId && !options.test) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    console.log(chalk4.cyan("Linear Configuration:"));
    console.log(`  API Key: ${apiKey ? chalk4.green("configured") : chalk4.yellow("not set")}`);
    console.log(`  Team ID: ${teamId || chalk4.yellow("not set")}`);
  }
});
var configCommand = new Command4("config").description("Manage DevPilot configuration").argument("[key]", "Configuration key (e.g., ui.port)").argument("[value]", "Value to set").option("-l, --list", "List all configuration").action(async (key, value, options) => {
  const configPath = join3(process.cwd(), ".devpilot", "config.yaml");
  if (!existsSync3(configPath)) {
    console.log(chalk4.red('\u274C DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = readFileSync(configPath, "utf-8");
  const config = YAML.parse(configContent);
  if (options.list || !key && !value) {
    console.log(chalk4.cyan("DevPilot Configuration:"));
    console.log("");
    console.log(YAML.stringify(config));
    return;
  }
  if (key && !value) {
    const keys = key.split(".");
    let current = config;
    for (const k of keys) {
      if (current && typeof current === "object" && k in current) {
        current = current[k];
      } else {
        console.log(chalk4.red(`\u274C Key "${key}" not found.`));
        return;
      }
    }
    console.log(current);
    return;
  }
  if (key && value) {
    const keys = key.split(".");
    let current = config;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current)) {
        current[k] = {};
      }
      current = current[k];
    }
    let parsedValue = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      if (value === "true") parsedValue = true;
      else if (value === "false") parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
    }
    current[keys[keys.length - 1]] = parsedValue;
    writeFileSync2(configPath, YAML.stringify(config));
    console.log(chalk4.green(`\u2705 Set ${key} = ${JSON.stringify(parsedValue)}`));
  }
}).addCommand(linearCommand);

// src/commands/setup.ts
import { Command as Command5 } from "commander";
import { existsSync as existsSync5, readFileSync as readFileSync3, writeFileSync as writeFileSync4 } from "fs";
import { join as join5 } from "path";
import chalk6 from "chalk";
import YAML2 from "yaml";
import * as readline from "readline";
import { linear as linear2 } from "@devpilot.sh/core";

// src/utils/orchestrator.ts
import { execSync, spawnSync } from "child_process";
import { existsSync as existsSync4, writeFileSync as writeFileSync3 } from "fs";
import { join as join4, basename } from "path";
import chalk5 from "chalk";
function checkCommand(cmd, versionArg = "--version") {
  try {
    const result = spawnSync(cmd, [versionArg], { encoding: "utf-8", stdio: "pipe" });
    if (result.status === 0) {
      const versionMatch = result.stdout.match(/(\d+\.\d+(\.\d+)?)/);
      return {
        installed: true,
        version: versionMatch ? versionMatch[1] : null
      };
    }
    return { installed: false, version: null };
  } catch {
    return { installed: false, version: null };
  }
}
function versionMeetsMinimum(version, minimum) {
  if (!version) return false;
  const vParts = version.split(".").map(Number);
  const mParts = minimum.split(".").map(Number);
  for (let i = 0; i < mParts.length; i++) {
    if ((vParts[i] || 0) > mParts[i]) return true;
    if ((vParts[i] || 0) < mParts[i]) return false;
  }
  return true;
}
function checkSystemRequirements() {
  const node = checkCommand("node");
  const nodeMeetsMin = versionMeetsMinimum(node.version, "20.0.0");
  const git3 = checkCommand("git");
  const gitMeetsMin = versionMeetsMinimum(git3.version, "2.25.0");
  const tmux = checkCommand("tmux", "-V");
  const gh = checkCommand("gh");
  let ghAuthenticated = false;
  if (gh.installed) {
    try {
      const result = spawnSync("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" });
      ghAuthenticated = result.status === 0;
    } catch {
      ghAuthenticated = false;
    }
  }
  return {
    node: { ...node, meetsMinimum: nodeMeetsMin },
    git: { ...git3, meetsMinimum: gitMeetsMin },
    tmux: { installed: tmux.installed },
    gh: { installed: gh.installed, authenticated: ghAuthenticated }
  };
}
function printRequirementsStatus(reqs) {
  console.log(chalk5.cyan("\nSystem Requirements:"));
  console.log("");
  if (reqs.node.installed && reqs.node.meetsMinimum) {
    console.log(chalk5.green(`  \u2713 Node.js ${reqs.node.version}`));
  } else if (reqs.node.installed) {
    console.log(chalk5.yellow(`  \u26A0 Node.js ${reqs.node.version} (requires 20.0.0+)`));
  } else {
    console.log(chalk5.red("  \u2717 Node.js not found"));
  }
  if (reqs.git.installed && reqs.git.meetsMinimum) {
    console.log(chalk5.green(`  \u2713 Git ${reqs.git.version}`));
  } else if (reqs.git.installed) {
    console.log(chalk5.yellow(`  \u26A0 Git ${reqs.git.version} (requires 2.25.0+)`));
  } else {
    console.log(chalk5.red("  \u2717 Git not found"));
  }
  if (reqs.tmux.installed) {
    console.log(chalk5.green("  \u2713 tmux"));
  } else {
    console.log(chalk5.yellow("  \u26A0 tmux not found (optional, for session management)"));
  }
  if (reqs.gh.installed && reqs.gh.authenticated) {
    console.log(chalk5.green("  \u2713 GitHub CLI (authenticated)"));
  } else if (reqs.gh.installed) {
    console.log(chalk5.yellow("  \u26A0 GitHub CLI (not authenticated - run: gh auth login)"));
  } else {
    console.log(chalk5.yellow("  \u26A0 GitHub CLI not found (optional, for PR creation)"));
  }
}
function isOrchestratorInstalled() {
  try {
    const result = spawnSync("npx", ["@composio/ao-cli", "--version"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installOrchestrator() {
  console.log(chalk5.cyan("\nInstalling @composio/ao-cli..."));
  try {
    execSync("npm install -g @composio/ao-cli", { stdio: "inherit" });
    console.log(chalk5.green("\u2713 @composio/ao-cli installed successfully"));
    return true;
  } catch {
    console.log(chalk5.red("\u2717 Failed to install @composio/ao-cli"));
    console.log(chalk5.gray("  Try manually: npm install -g @composio/ao-cli"));
    return false;
  }
}
function detectRepoInfo(cwd) {
  try {
    const remoteResult = spawnSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe"
    });
    if (remoteResult.status !== 0) return null;
    const remoteUrl = remoteResult.stdout.trim();
    let repo = "";
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
    if (httpsMatch) {
      repo = httpsMatch[1];
    } else if (sshMatch) {
      repo = sshMatch[1];
    } else {
      return null;
    }
    const branchResult = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "utf-8",
      stdio: "pipe"
    });
    const branch = branchResult.status === 0 ? branchResult.stdout.trim() : "main";
    return { repo, branch };
  } catch {
    return null;
  }
}
function generateOrchestratorConfig(options) {
  const { cwd, linearTeamId, agentRules } = options;
  const projectName = basename(cwd);
  const repoInfo = detectRepoInfo(cwd);
  const config = {
    dataDir: "~/.agent-orchestrator",
    worktreeDir: "~/.worktrees",
    projects: {
      [projectName]: {
        repo: repoInfo?.repo || `owner/${projectName}`,
        path: cwd,
        defaultBranch: repoInfo?.branch || "main"
      }
    }
  };
  if (linearTeamId) {
    config.projects[projectName].tracker = {
      plugin: "linear",
      teamId: linearTeamId
    };
  }
  if (agentRules) {
    config.projects[projectName].agentRules = agentRules;
  } else {
    config.projects[projectName].agentRules = `Always link Linear tickets in commit messages.
Run tests before pushing.
Use conventional commits (feat:, fix:, chore:).
Create small, focused PRs.`;
  }
  return config;
}
function writeOrchestratorConfig(cwd, config) {
  const YAML3 = __require("yaml");
  const configPath = join4(cwd, "agent-orchestrator.yaml");
  const yamlContent = YAML3.stringify(config);
  writeFileSync3(configPath, yamlContent);
}
function orchestratorConfigExists(cwd) {
  return existsSync4(join4(cwd, "agent-orchestrator.yaml"));
}
function getInstallInstructions(reqs) {
  const instructions = [];
  if (!reqs.node.installed || !reqs.node.meetsMinimum) {
    instructions.push("Node.js 20+: https://nodejs.org or use nvm: nvm install 20");
  }
  if (!reqs.git.installed || !reqs.git.meetsMinimum) {
    instructions.push("Git 2.25+: https://git-scm.com/downloads");
  }
  if (!reqs.tmux.installed) {
    instructions.push("tmux: brew install tmux (macOS) or apt install tmux (Linux)");
  }
  if (!reqs.gh.installed) {
    instructions.push("GitHub CLI: brew install gh (macOS) or https://cli.github.com");
  } else if (!reqs.gh.authenticated) {
    instructions.push("GitHub CLI auth: gh auth login");
  }
  return instructions;
}

// src/commands/setup.ts
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve4) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve4(answer.trim());
    });
  });
}
async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await prompt(`${question} ${hint}: `);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}
var setupCommand = new Command5("setup").description("Interactive setup wizard for DevPilot and agent-orchestrator").option("--linear-only", "Only configure Linear integration").option("--orchestrator-only", "Only configure agent-orchestrator").option("--check", "Only check system requirements").option("-y, --yes", "Accept all defaults (non-interactive mode)").action(async (options) => {
  const nonInteractive = options.yes;
  const cwd = process.cwd();
  const configPath = join5(cwd, ".devpilot", "config.yaml");
  if (!existsSync5(configPath)) {
    console.log(chalk6.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  console.log(chalk6.bold.cyan("\n DevPilot Setup Wizard\n"));
  console.log(chalk6.gray("This wizard will help you configure DevPilot and agent-orchestrator.\n"));
  console.log(chalk6.bold("Step 1: Checking System Requirements"));
  const reqs = checkSystemRequirements();
  printRequirementsStatus(reqs);
  if (!reqs.node.meetsMinimum) {
    console.log(chalk6.red("\nNode.js 20+ is required. Please upgrade and try again."));
    return;
  }
  if (!reqs.git.meetsMinimum) {
    console.log(chalk6.red("\nGit 2.25+ is required. Please upgrade and try again."));
    return;
  }
  const instructions = getInstallInstructions(reqs);
  if (instructions.length > 0) {
    console.log(chalk6.yellow("\nOptional installations:"));
    instructions.forEach((inst) => console.log(chalk6.gray(`  - ${inst}`)));
  }
  if (options.check) {
    return;
  }
  console.log("");
  if (!options.orchestratorOnly) {
    console.log(chalk6.bold("Step 2: Linear Integration"));
    console.log(chalk6.gray("Linear integration enables ticket tracking and auto-status updates.\n"));
    const configContent = readFileSync3(configPath, "utf-8");
    const config = YAML2.parse(configContent);
    const existingApiKey = config.integrations?.linear?.apiKey;
    const existingTeamId = config.integrations?.linear?.teamId;
    if (existingApiKey && existingTeamId) {
      console.log(chalk6.green("  Linear is already configured."));
      if (!nonInteractive) {
        const reconfigure = await confirm("  Reconfigure Linear?", false);
        if (reconfigure) {
          await configureLinear(configPath, config);
        }
      }
      console.log("");
    } else if (nonInteractive) {
      console.log(chalk6.gray("  Skipping Linear setup (non-interactive mode).\n"));
    } else {
      const setupLinear = await confirm("  Would you like to set up Linear integration?");
      if (setupLinear) {
        await configureLinear(configPath, config);
      } else {
        console.log(chalk6.gray("  Skipping Linear setup.\n"));
      }
    }
  }
  if (!options.linearOnly) {
    console.log(chalk6.bold("Step 3: Agent Orchestrator"));
    console.log(chalk6.gray("Agent orchestrator manages parallel AI coding agents.\n"));
    const installed = isOrchestratorInstalled();
    if (!installed) {
      console.log(chalk6.yellow("  @composio/ao-cli is not installed."));
      if (nonInteractive) {
        console.log(chalk6.gray("  Skipping installation (non-interactive mode)."));
        console.log(chalk6.gray("  Install later with: npm install -g @composio/ao-cli\n"));
      } else {
        const install = await confirm("  Install @composio/ao-cli globally?");
        if (install) {
          const success = installOrchestrator();
          if (!success) {
            console.log(chalk6.yellow("  Continuing without agent-orchestrator CLI...\n"));
          }
        } else {
          console.log(chalk6.gray("  Skipping installation. You can install later with:"));
          console.log(chalk6.cyan("    npm install -g @composio/ao-cli\n"));
        }
      }
    } else {
      console.log(chalk6.green("  @composio/ao-cli is installed."));
    }
    if (orchestratorConfigExists(cwd)) {
      console.log(chalk6.green("  agent-orchestrator.yaml already exists."));
      if (!nonInteractive) {
        const regenerate = await confirm("  Regenerate configuration?", false);
        if (regenerate) {
          await configureOrchestrator(cwd, configPath, nonInteractive);
        }
      }
    } else {
      if (nonInteractive) {
        await configureOrchestrator(cwd, configPath, nonInteractive);
      } else {
        const generate = await confirm("  Generate agent-orchestrator.yaml?");
        if (generate) {
          await configureOrchestrator(cwd, configPath, nonInteractive);
        } else {
          console.log(chalk6.gray("  Skipping config generation.\n"));
        }
      }
    }
  }
  console.log(chalk6.bold.green("\nSetup Complete!\n"));
  console.log(chalk6.white("Next steps:"));
  console.log(chalk6.gray("  1. Run ") + chalk6.cyan("devpilot serve") + chalk6.gray(" to start the UI"));
  console.log(chalk6.gray("  2. Run ") + chalk6.cyan("ao start") + chalk6.gray(" to start agent orchestrator"));
  console.log(chalk6.gray("  3. Use the UI to create items and dispatch to the fleet"));
  console.log(
    chalk6.gray("  4. Connect this machine with ") + chalk6.cyan("devpilot bridge connect") + chalk6.gray(" to see what each session spends\n")
  );
});
async function configureLinear(configPath, config) {
  console.log("");
  console.log(chalk6.gray("  Get your API key from: https://linear.app/settings/api\n"));
  const apiKey = await prompt("  Linear API key: ");
  if (!apiKey) {
    console.log(chalk6.yellow("  No API key provided. Skipping Linear setup.\n"));
    return;
  }
  console.log(chalk6.cyan("\n  Connecting to Linear..."));
  try {
    const tempClient = linear2.initLinearClient({ apiKey, teamId: "" });
    const teams = await tempClient.getTeams();
    if (teams.length === 0) {
      console.log(chalk6.yellow("  No teams found. Make sure you have access to at least one team."));
      return;
    }
    console.log(chalk6.green(`  Found ${teams.length} team(s):
`));
    teams.forEach((team, i) => {
      console.log(chalk6.white(`    ${i + 1}. ${team.name} (${team.key})`));
    });
    const teamChoice = await prompt("\n  Select team number: ");
    const teamIndex = parseInt(teamChoice, 10) - 1;
    if (isNaN(teamIndex) || teamIndex < 0 || teamIndex >= teams.length) {
      console.log(chalk6.yellow("  Invalid selection. Skipping Linear setup."));
      return;
    }
    const selectedTeam = teams[teamIndex];
    if (!config.integrations) config.integrations = {};
    config.integrations.linear = {
      apiKey,
      teamId: selectedTeam.id,
      teamName: selectedTeam.name,
      teamKey: selectedTeam.key
    };
    writeFileSync4(configPath, YAML2.stringify(config));
    console.log(chalk6.green(`
  Linear configured for team: ${selectedTeam.name}
`));
    console.log(chalk6.gray("  For agent-orchestrator, also set the LINEAR_API_KEY environment variable:"));
    console.log(chalk6.cyan(`    export LINEAR_API_KEY="${apiKey}"
`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(chalk6.red(`  Failed to connect: ${message}`));
    console.log(chalk6.gray("  You can configure Linear later with: devpilot config linear\n"));
  }
}
async function configureOrchestrator(cwd, configPath, nonInteractive = false) {
  const config = YAML2.parse(readFileSync3(configPath, "utf-8"));
  const linearTeamId = config.integrations?.linear?.teamId;
  const aoConfig = generateOrchestratorConfig({
    cwd,
    linearTeamId
  });
  if (!nonInteractive) {
    const customRules = await confirm("\n  Would you like to customize agent rules?", false);
    if (customRules) {
      console.log(chalk6.gray("  Enter rules (one per line, empty line to finish):"));
      const rules = [];
      let line = "";
      do {
        line = await prompt("    > ");
        if (line) rules.push(line);
      } while (line);
      if (rules.length > 0) {
        const projectName = Object.keys(aoConfig.projects)[0];
        aoConfig.projects[projectName].agentRules = rules.join("\n");
      }
    }
  }
  writeOrchestratorConfig(cwd, aoConfig);
  console.log(chalk6.green("\n  Created agent-orchestrator.yaml"));
  console.log(chalk6.gray("\n  Configuration preview:"));
  console.log(chalk6.gray("  " + "-".repeat(40)));
  const preview = YAML2.stringify(aoConfig).split("\n").slice(0, 15).join("\n");
  preview.split("\n").forEach((line) => console.log(chalk6.gray(`  ${line}`)));
  console.log(chalk6.gray("  ...\n"));
}

// src/commands/bridge.ts
import { Command as Command9 } from "commander";

// src/commands/bridge/connect.ts
import os from "os";
import { Command as Command6 } from "commander";
import chalk10 from "chalk";
import {
  BridgeClient,
  DEFAULT_BRIDGE_URL,
  DispatchLoop,
  HeartbeatService,
  bridgeCredentialsPath,
  resolveBridgeCredentials,
  saveBridgeCredentials
} from "@devpilot.sh/bridge-client";

// src/commands/bridge/dispatch-handler.ts
import { orchestrator } from "@devpilot.sh/core";
var inFlight = /* @__PURE__ */ new Map();
function service(opts) {
  const existing = orchestrator.getOrchestratorServiceOrNull();
  if (existing) return existing;
  return orchestrator.initOrchestratorService({
    mode: opts.orchestratorMode,
    url: opts.httpUrl,
    apiKey: opts.apiKey,
    callbackUrl: opts.callbackUrl,
    aoProjectName: opts.aoProjectName,
    aoPath: opts.aoPath,
    sessionApiUrl: opts.sessionApiUrl,
    sessionApiKey: opts.sessionApiKey,
    pollIntervalMs: opts.pollIntervalMs
  });
}
function ensurePoller(opts, svc) {
  if (orchestrator.isStatusPollerInitialized()) return;
  const log = opts.onLog ?? (() => {
  });
  const poller = orchestrator.initStatusPoller(svc, {
    pollIntervalMs: opts.pollIntervalMs ?? 2e3,
    maxRetries: 3,
    onStatusUpdate: async (sessionId, status) => {
      if (!inFlight.has(sessionId)) return;
      if (status.status === "complete" || status.status === "error" || status.status === "cancelled") {
        return;
      }
      try {
        await opts.client.reportSessionStatus(sessionId, {
          status: status.status === "queued" ? "dispatched" : "running",
          progressPercent: Math.max(0, Math.min(100, status.progressPercent ?? 0)),
          message: status.message ?? status.currentStep
        });
      } catch (e) {
        log(`status report failed: ${e instanceof Error ? e.message : e}`);
      }
    },
    onComplete: async (sessionId, report) => {
      const settle = inFlight.get(sessionId);
      try {
        await opts.client.reportSessionComplete(sessionId, {
          success: report.success,
          ...report.prUrl ? { prUrl: report.prUrl } : {},
          ...report.summary ? { summary: report.summary } : {},
          ...report.tokensUsed !== void 0 ? { tokensUsed: report.tokensUsed } : {},
          ...report.costUsd !== void 0 ? { costUsd: report.costUsd } : {},
          ...report.success ? {} : { errorMessage: report.error?.message ?? "Agent failed" }
        });
        settle?.({ ok: report.success, error: report.error?.message, reported: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`completion report failed: ${msg}`);
        settle?.({ ok: false, error: msg });
      }
    },
    onError: async (sessionId, error) => {
      const settle = inFlight.get(sessionId);
      try {
        await opts.client.reportSessionComplete(sessionId, {
          success: false,
          errorMessage: error.message
        });
      } catch {
      }
      settle?.({ ok: false, error: error.message, reported: true });
    }
  });
  poller.start();
}
function createBridgeDispatchHandler(opts) {
  const log = opts.onLog ?? (() => {
  });
  return async function handle(message) {
    const { sessionId, linearIdentifier, title, repo } = message;
    log(`${linearIdentifier} \u2192 ${repo}: ${title}`);
    try {
      const svc = service(opts);
      ensurePoller(opts, svc);
      const request = orchestrator.buildDispatchRequest({
        sessionId,
        repo,
        title,
        filePaths: [],
        linearTicketId: linearIdentifier,
        callbackUrl: opts.callbackUrl ?? ""
      });
      const settled = new Promise((resolve4) => {
        inFlight.set(sessionId, resolve4);
      });
      const response = await svc.dispatch(request);
      if (!response.accepted) {
        inFlight.delete(sessionId);
        throw new Error(response.error ?? "Orchestrator rejected the dispatch");
      }
      await opts.client.reportSessionStatus(sessionId, {
        status: "dispatched",
        progressPercent: 0,
        message: `Dispatched to local orchestrator (${opts.orchestratorMode})`
      });
      orchestrator.getStatusPoller().trackSession(sessionId, response.orchestratorJobId ?? sessionId);
      const outcome = await settled;
      inFlight.delete(sessionId);
      if (!outcome.ok) {
        const e = new Error(outcome.error ?? "Session failed");
        e.alreadyReported = outcome.reported;
        throw e;
      }
      log(`${linearIdentifier} reported`);
    } catch (err) {
      inFlight.delete(sessionId);
      const reason = err instanceof Error ? err.message : String(err);
      log(`${linearIdentifier} failed: ${reason}`);
      if (!err?.alreadyReported) {
        try {
          await opts.client.reportSessionStatus(sessionId, {
            status: "error",
            progressPercent: 0,
            message: reason
          });
        } catch {
        }
      }
      throw new Error(reason);
    }
  };
}

// src/commands/bridge/conductor-handler.ts
function cleanPath(value) {
  return value.replace(/`/g, "").trim();
}
function toMirroredPlan(plan, itemId, parallelization) {
  return {
    cockpitItemId: itemId,
    parallelization,
    waves: (plan.waves ?? []).map((w) => ({
      label: w.label,
      tasks: (w.tasks ?? []).map((t) => ({
        taskCode: t.taskCode ?? "",
        description: t.description ?? "",
        filePaths: (t.filePaths ?? []).map(cleanPath),
        complexity: t.complexity,
        recommendedModel: t.recommendedModel,
        canRunInParallel: t.canRunInParallel
      }))
    })),
    dependencyEdges: plan.dependencyEdges ?? [],
    criticalPath: plan.criticalPath ?? []
  };
}
var DEFAULT_TIMEOUT_MS = 15 * 6e4;
async function call(url, init, timeoutMs, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init.headers ?? {} }
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${init.method ?? "GET"} ${url} \u2192 ${res.status}: ${text.slice(0, 300)}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}
async function existingItem(cockpitUrl, linearTicketId, timeoutMs) {
  const items = await call(
    `${cockpitUrl}/api/items?linearTicketId=${encodeURIComponent(linearTicketId)}`,
    { method: "GET" },
    timeoutMs
  );
  return Array.isArray(items) && items.length > 0 ? items[0] : null;
}
function sessionLink(hosted, sessionId) {
  return `${hosted}/sessions/${sessionId}`;
}
function hostedBase(client2) {
  return typeof client2.hostedUrl === "function" ? client2.hostedUrl() : "";
}
function linkOrText(hosted, sessionId, text) {
  return hosted ? `[${text}](${sessionLink(hosted, sessionId)})` : text;
}
function describe(state, hosted, sessionId) {
  if (state.awaiting === "review") {
    const score = state.review?.score?.parallelizationScore;
    const waves = state.review?.plan?.waves?.length;
    const tasks = state.review?.plan?.waves?.reduce(
      (n, w) => n + (w.tasks?.length ?? 0),
      0
    );
    const parts = [
      waves && tasks ? `${waves} wave${waves === 1 ? "" : "s"}, ${tasks} tasks` : null,
      typeof score === "number" ? `${Math.round(score * 100)}% parallel` : null
    ].filter(Boolean);
    const shape = parts.length ? ` \u2014 ${parts.join(", ")}` : "";
    return `Plan ready${shape}. ${linkOrText(hosted, sessionId, "Review it in the cockpit")} to dispatch, or reply here with constraints to re-plan. Awaiting review.`;
  }
  if (state.awaiting === "wave") {
    return `Plan approved \u2014 dispatching waves. ${linkOrText(hosted, sessionId, "Watch the waves")}.`;
  }
  if (state.status === "complete") return "All waves complete.";
  if (state.status === "failed") {
    return `Conductor run failed: ${state.errors?.[state.errors.length - 1] ?? "unknown error"}`;
  }
  return `Conductor run ${state.status ?? "started"}.`;
}
function createConductorDispatchHandler(opts) {
  const log = opts.onLog ?? (() => {
  });
  const timeout = opts.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = opts.cockpitUrl.replace(/\/$/, "");
  return async function handle(message) {
    const { sessionId, linearIdentifier, title, repo, description } = message;
    log(`${linearIdentifier} \u2192 conductor (${repo}): ${title}`);
    try {
      let item = await existingItem(base, linearIdentifier, timeout);
      if (item) {
        log(`${linearIdentifier} already on the board as ${item.id} \u2014 reusing`);
        const current = await call(
          `${base}/api/items/${item.id}/conductor`,
          { method: "GET" },
          timeout
        ).catch(() => ({}));
        const live = current.awaiting === "review" || current.awaiting === "wave" || current.status === "planning" || current.status === "executing";
        if (live) {
          const summary2 = describe(current, hostedBase(opts.client), sessionId);
          log(`${linearIdentifier}: ${summary2} (no new run started)`);
          await opts.client.reportSessionStatus(sessionId, {
            status: "running",
            progressPercent: current.awaiting === "review" ? 40 : 60,
            message: summary2
          });
          opts.watcher?.watch(
            { sessionId, itemId: item.id, linearIdentifier },
            current.awaiting === "review" ? "review" : void 0
          );
          return;
        }
      } else {
        item = await call(
          `${base}/api/items`,
          {
            method: "POST",
            body: JSON.stringify({
              title,
              repo,
              // REFINING is where an item that is about to be planned belongs;
              // DIRECTIONAL (the API default) would leave it parked as an idea.
              zone: "REFINING",
              linearTicketId: linearIdentifier,
              description
            })
          },
          timeout
        );
        if (!item?.id) throw new Error("Cockpit did not return a created item id");
        log(`${linearIdentifier} \u2192 item ${item.id}`);
      }
      await opts.client.reportSessionStatus(sessionId, {
        status: "running",
        progressPercent: 5,
        message: `Planning \u2014 ${linkOrText(hostedBase(opts.client), sessionId, "open it in the cockpit")}.`
      });
      const state = await call(
        `${base}/api/items/${item.id}/conductor`,
        { method: "POST", body: JSON.stringify({}) },
        timeout
      );
      const summary = describe(state, hostedBase(opts.client), sessionId);
      log(`${linearIdentifier}: ${summary}`);
      if (state.review?.plan?.waves?.length && typeof opts.client.mirrorSessionPlan === "function") {
        const mirrored = await opts.client.mirrorSessionPlan(
          sessionId,
          toMirroredPlan(
            state.review.plan,
            item.id,
            state.review.score?.parallelizationScore
          )
        );
        log(
          `${linearIdentifier}: plan ${mirrored ? "mirrored to the hosted cockpit" : "not mirrored (hosted unreachable)"}`
        );
      }
      if (state.status === "failed") {
        throw new Error(summary);
      }
      await opts.client.reportSessionStatus(sessionId, {
        status: "running",
        progressPercent: state.awaiting === "review" ? 40 : 60,
        message: summary
      });
      opts.watcher?.watch(
        { sessionId, itemId: item.id, linearIdentifier },
        state.awaiting === "review" ? "review" : void 0
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`${linearIdentifier} failed: ${reason}`);
      try {
        await opts.client.reportSessionStatus(sessionId, {
          status: "error",
          progressPercent: 0,
          message: reason
        });
      } catch {
      }
      throw new Error(reason);
    }
  };
}
function buildSessionBrief(o) {
  const lines = [];
  if (o.message?.trim()) {
    lines.push(`## What to do

${o.message.trim()}`, "");
  }
  lines.push("## Where this came from", "");
  lines.push(
    `An agent session already running in \`${o.repo}\`${o.branch ? ` on \`${o.branch}\`` : ""}, picked up from the DevPilot cockpit.`,
    ""
  );
  if (o.summary?.trim()) lines.push(o.summary.trim(), "");
  if (o.touchedPaths?.length) {
    lines.push("## Files it had already touched", "");
    for (const f of o.touchedPaths.slice(0, 30)) lines.push(`- \`${f}\``);
    if (o.touchedPaths.length > 30) lines.push(`- \u2026and ${o.touchedPaths.length - 30} more`);
    lines.push("");
  }
  if (!o.message?.trim()) {
    lines.push(
      "## What to do",
      "",
      "Work out what remains to finish this piece of work, and plan it."
    );
  }
  return lines.join("\n");
}
async function planFromSession(o) {
  const log = o.onLog ?? (() => {
  });
  const timeout = o.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = o.cockpitUrl.replace(/\/$/, "");
  const item = await call(
    `${base}/api/items`,
    {
      method: "POST",
      body: JSON.stringify({
        title: o.title,
        repo: o.repo,
        zone: "REFINING",
        description: buildSessionBrief(o)
      })
    },
    timeout,
    o.fetchImpl
  );
  if (!item?.id) throw new Error("Cockpit did not return a created item id");
  await say(o, 5, "Planning what remains \u2014 this takes a minute and costs tokens.");
  const state = await call(
    `${base}/api/items/${item.id}/conductor`,
    { method: "POST", body: JSON.stringify({}) },
    timeout,
    o.fetchImpl
  );
  const summary = describe(state, hostedBase(o.client), o.sessionId);
  if (state.review?.plan?.waves?.length && typeof o.client.mirrorSessionPlan === "function") {
    const mirrored = await o.client.mirrorSessionPlan(
      o.sessionId,
      toMirroredPlan(state.review.plan, item.id, state.review.score?.parallelizationScore)
    );
    log(`plan ${mirrored ? "mirrored to the hosted cockpit" : "not mirrored (hosted unreachable)"}`);
  }
  if (state.status === "failed") throw new Error(summary);
  await say(o, state.awaiting === "review" ? 40 : 60, summary);
  return summary;
}
async function say(o, progressPercent, message) {
  try {
    await o.client.reportSessionStatus(o.sessionId, {
      status: "running",
      progressPercent,
      message
    });
  } catch (err) {
    o.onLog?.(`could not report progress: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// src/commands/bridge/connect.ts
import { homedir as homedir2 } from "os";
import { join as join7, dirname as dirname4 } from "path";
import { readFileSync as readFileSync7, writeFileSync as writeFileSync8, mkdirSync as mkdirSync6, existsSync as existsSync9 } from "fs";

// src/commands/bridge/conductor-watcher.ts
import { readFileSync as readFileSync4, writeFileSync as writeFileSync5, mkdirSync as mkdirSync3, unlinkSync, existsSync as existsSync6 } from "fs";
import { dirname } from "path";
function whereTheWorkIs(state) {
  const isolation = state.outcome?.isolation;
  if (!isolation) return "";
  if (isolation.isolated) return isolation.summary ? `

${isolation.summary}` : "";
  return "\n\nThis run was not given a branch per task" + (isolation.reason ? ` (${isolation.reason})` : "") + ", so its changes are uncommitted edits in the checkout on the machine that ran it.";
}
function progressReport(state, links) {
  if (state.awaiting === "review") {
    const waves = state.review?.plan?.waves?.length ?? 0;
    const tasks = state.review?.plan?.waves?.reduce((n, w) => n + (w.tasks?.length ?? 0), 0) ?? 0;
    const pct = Math.round((state.score?.parallelizationScore ?? 0) * 100);
    return {
      signature: "review",
      message: `Plan ready \u2014 ${waves} wave${waves === 1 ? "" : "s"}, ${tasks} task${tasks === 1 ? "" : "s"}, ${pct}% parallel. ` + (links.hosted ? `[Review it in the cockpit](${links.hosted}/sessions/${links.sessionId}) to dispatch` : "Review it in the cockpit to dispatch") + `, or reply here with constraints to re-plan. Awaiting review.`,
      percent: 40
    };
  }
  const pausedReason = state.outcome?.pausedReason;
  if (pausedReason) {
    const done = state.completedWaves?.length ?? 0;
    return {
      signature: `paused:${pausedReason}`,
      message: `Run paused \u2014 ${pausedReason}`,
      percent: Math.min(60 + done * 15, 95)
    };
  }
  if (state.status === "executing") {
    const wave = state.currentWaveIndex ?? 0;
    const done = state.completedWaves?.length ?? 0;
    const d = state.lastDispatch?.dispatched ?? 0;
    const q = state.lastDispatch?.queued ?? 0;
    const o = state.outcome ?? {};
    const complete = o.tasksComplete ?? 0;
    const total = o.tasksTotal ?? 0;
    const files = o.filesChanged?.length ?? 0;
    const cost = typeof o.costUsd === "number" && o.costUsd > 0 ? `, $${o.costUsd.toFixed(2)} so far` : "";
    const detail = total ? ` \u2014 ${complete}/${total} tasks done, ${files} file${files === 1 ? "" : "s"} touched${cost}` : d || q ? ` \u2014 ${d} agent${d === 1 ? "" : "s"} running, ${q} queued` : "";
    return {
      signature: `wave:${wave}:${done}:${complete}:${files}`,
      message: `Wave ${wave + 1}${total ? ` of ${o.wavesTotal ?? "?"}` : ""}${detail}` + (links.hosted ? `. [Watch the waves](${links.hosted}/sessions/${links.sessionId}).` : "."),
      percent: Math.min(60 + done * 15, 95)
    };
  }
  return null;
}
var TERMINAL = /* @__PURE__ */ new Set(["complete", "failed"]);
var MAX_LISTED_FILES = 12;
function successSummary(state) {
  const o = state.outcome ?? {};
  const waves = o.wavesTotal ?? state.completedWaves?.length ?? 0;
  const planned = state.review?.plan?.waves?.reduce((n, w) => n + (w.tasks?.length ?? 0), 0) ?? 0;
  const tasks = o.tasksComplete ?? planned;
  const files = o.filesChanged ?? [];
  const head = `DevPilot finished ${tasks} task${tasks === 1 ? "" : "s"} across ${waves} wave${waves === 1 ? "" : "s"}` + (typeof o.costUsd === "number" && o.costUsd > 0 ? ` for $${o.costUsd.toFixed(2)}` : "") + ".";
  if (files.length === 0) {
    return (o.filesChanged ? `${head}

**No files were changed.** Worth checking whether the plan matched the intent.` : head) + whereTheWorkIs(state);
  }
  const shown = files.slice(0, MAX_LISTED_FILES).map((f) => `- \`${f}\``);
  const more = files.length > MAX_LISTED_FILES ? `
- \u2026and ${files.length - MAX_LISTED_FILES} more` : "";
  return `${head}

**${files.length} file${files.length === 1 ? "" : "s"} changed**
${shown.join("\n")}${more}` + whereTheWorkIs(state);
}
function failureSummary(state) {
  const o = state.outcome ?? {};
  const failures = o.failures ?? [];
  const last = state.errors?.[state.errors.length - 1];
  const head = `DevPilot run failed after ${o.tasksComplete ?? 0} of ${o.tasksTotal ?? 0} tasks` + (typeof o.costUsd === "number" && o.costUsd > 0 ? ` ($${o.costUsd.toFixed(2)} spent)` : "") + ".";
  if (failures.length > 0) {
    const lines = failures.slice(0, 5).map((f) => `- **${f.taskCode}** \u2014 ${f.error}`);
    return `${head}

**Failed tasks**
${lines.join("\n")}` + whereTheWorkIs(state);
  }
  return (last ? `${head}

${last}` : head) + whereTheWorkIs(state);
}
var ConductorWatcher = class {
  constructor(opts) {
    this.opts = opts;
    this.runs = /* @__PURE__ */ new Map();
    /** Last progress signature reported per session, so we do not repeat ourselves. */
    this.reported = /* @__PURE__ */ new Map();
    /** Sessions whose plan has already been mirrored, so we upload it once. */
    this.mirroredPlans = /* @__PURE__ */ new Set();
    this.timer = null;
    this.base = opts.cockpitUrl.replace(/\/$/, "");
    this.interval = opts.pollIntervalMs ?? 3e4;
    this.log = opts.onLog ?? (() => {
    });
    this.doFetch = opts.fetchImpl ?? fetch;
  }
  /**
   * Begin watching a run. Idempotent per bridge session.
   *
   * `alreadyReported` seeds the dedup signature with something the caller has
   * just said. The dispatch handler announces the review gate itself, and
   * without this the watcher's first sweep announced it again — AVA-13 carried
   * two identical "Plan ready — 5 waves, 17 tasks, 71% parallel" activities
   * seconds apart, which reads as the agent stuttering rather than working.
   */
  watch(run, alreadyReported) {
    if (this.runs.has(run.sessionId)) return;
    this.runs.set(run.sessionId, run);
    if (alreadyReported) this.reported.set(run.sessionId, alreadyReported);
    this.persist();
    this.log(`watching ${run.linearIdentifier} (${this.runs.size} tracked)`);
    this.start();
  }
  /**
   * Re-adopt runs left behind by a previous process.
   *
   * Restored runs are claims, not facts — `check` verifies each against the
   * cockpit on the next sweep and drops any whose item has gone. Returns how
   * many were adopted so the caller can say so.
   */
  restore() {
    const path = this.opts.statePath;
    if (!path || !existsSync6(path)) return 0;
    let entries = [];
    try {
      const parsed = JSON.parse(readFileSync4(path, "utf8"));
      if (Array.isArray(parsed)) {
        entries = parsed.filter(
          (e) => Boolean(e) && typeof e.sessionId === "string" && typeof e.itemId === "string"
        );
      }
    } catch {
      return 0;
    }
    let adopted = 0;
    for (const run of entries) {
      if (this.runs.has(run.sessionId)) continue;
      this.runs.set(run.sessionId, run);
      adopted++;
    }
    if (adopted > 0) this.start();
    return adopted;
  }
  /**
   * Read this run's live telemetry from the cockpit and send it up.
   *
   * The cockpit knows what each agent is doing because the session runner
   * streams it there; the hosted plane knew none of it, so a session page could
   * only ever show a title and a percentage. Adopted sessions — Claude Code
   * sessions discovered already running — have no plan at all, which is why
   * twenty-eight of them displayed 0%: no denominator, and no activity either.
   */
  async mirrorTelemetry(run) {
    if (typeof this.opts.client.reportTelemetry !== "function") return;
    try {
      const res = await this.doFetch(`${this.base}/api/fleet/state`);
      if (!res.ok) return;
      const state = await res.json();
      const sessions = state.sessions ?? [];
      if (sessions.length === 0) return;
      const files = /* @__PURE__ */ new Set();
      let toolCalls = 0;
      let writeCalls = 0;
      let costUsd = 0;
      const tokens = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };
      let sawTokens = false;
      let harness;
      const modelTokens = /* @__PURE__ */ new Map();
      let estimated = false;
      let elapsedMs = 0;
      let idleMs = Number.MAX_SAFE_INTEGER;
      let action;
      for (const s of sessions) {
        const t = s.telemetry;
        if (!t) continue;
        toolCalls += t.toolCalls ?? 0;
        writeCalls += t.writeCalls ?? 0;
        costUsd += t.costUsd ?? 0;
        if (typeof t.tokensIn === "number" || typeof t.tokensOut === "number") sawTokens = true;
        tokens.in += t.tokensIn ?? 0;
        tokens.out += t.tokensOut ?? 0;
        tokens.cacheRead += t.tokensCacheRead ?? 0;
        tokens.cacheWrite += t.tokensCacheWrite ?? 0;
        tokens.turns += t.turns ?? 0;
        harness ?? (harness = t.harness);
        if (t.model) {
          const size = (t.tokensIn ?? 0) + (t.tokensOut ?? 0) + (t.tokensCacheRead ?? 0) + (t.tokensCacheWrite ?? 0);
          modelTokens.set(t.model, (modelTokens.get(t.model) ?? 0) + size);
        }
        estimated = estimated || Boolean(t.costIsEstimate);
        elapsedMs = Math.max(elapsedMs, t.elapsedMs ?? 0);
        idleMs = Math.min(idleMs, t.idleMs ?? Number.MAX_SAFE_INTEGER);
        for (const f of t.filesTouched ?? []) files.add(f);
        if (!action && t.lastAction) {
          const file = t.lastAction.path?.split("/").slice(-1)[0];
          action = t.lastAction.tool === "Bash" ? programOf(t.commands?.at(-1)) : `${t.lastAction.tool.toLowerCase()}${file ? ` ${file}` : ""}`;
        }
      }
      if (toolCalls === 0 && files.size === 0) return;
      await this.opts.client.reportTelemetry(run.sessionId, {
        toolCalls,
        writeCalls,
        filesTouched: [...files],
        currentAction: action,
        costUsd: costUsd > 0 ? costUsd : void 0,
        costEstimated: estimated,
        ...sawTokens ? {
          tokensIn: tokens.in,
          tokensOut: tokens.out,
          tokensCacheRead: tokens.cacheRead,
          tokensCacheWrite: tokens.cacheWrite,
          turns: tokens.turns || void 0
        } : {},
        ...harness ? { harness } : {},
        ...modelTokens.size > 0 ? { model: [...modelTokens.entries()].sort((a, b) => b[1] - a[1])[0][0] } : {},
        elapsedMs: elapsedMs || void 0,
        idleMs: idleMs === Number.MAX_SAFE_INTEGER ? void 0 : idleMs
      });
    } catch {
    }
  }
  /** Mirror the tracked set to disk. Never throws — this is bookkeeping. */
  persist() {
    const path = this.opts.statePath;
    if (!path) return;
    try {
      if (this.runs.size === 0) {
        if (existsSync6(path)) unlinkSync(path);
        return;
      }
      mkdirSync3(dirname(path), { recursive: true });
      writeFileSync5(path, JSON.stringify([...this.runs.values()], null, 2), "utf8");
    } catch {
    }
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.interval);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const run of this.runs.values()) this.opts.onLost?.(run);
    this.runs.clear();
  }
  /** Exposed for tests and for an immediate check after handing off a run. */
  async sweep() {
    for (const run of [...this.runs.values()]) {
      try {
        await this.check(run);
      } catch (err) {
        this.log(
          `${run.linearIdentifier}: state check failed (${err instanceof Error ? err.message : String(err)})`
        );
      }
    }
    if (this.runs.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  async check(run) {
    const res = await this.doFetch(`${this.base}/api/items/${run.itemId}/conductor`);
    if (res.status === 404) {
      this.runs.delete(run.sessionId);
      this.reported.delete(run.sessionId);
      this.persist();
      this.log(
        `${run.linearIdentifier}: no conductor run on the cockpit \u2014 dropped (was it reset?)`
      );
      return;
    }
    if (!res.ok) throw new Error(`conductor state \u2192 ${res.status}`);
    const state = await res.json();
    if (!state.status || !TERMINAL.has(state.status)) {
      if (state.review?.plan?.waves?.length && !this.mirroredPlans.has(run.sessionId) && typeof this.opts.client.mirrorSessionPlan === "function") {
        const ok = await this.opts.client.mirrorSessionPlan(run.sessionId, {
          cockpitItemId: run.itemId,
          parallelization: state.review.score?.parallelizationScore,
          waves: state.review.plan.waves.map((w) => ({
            label: w.label,
            tasks: (w.tasks ?? []).map((t) => ({
              taskCode: t.taskCode ?? "",
              description: t.description ?? "",
              // The planner writes paths as markdown code spans.
              filePaths: (t.filePaths ?? []).map((f) => f.replace(/`/g, "").trim()),
              complexity: t.complexity,
              recommendedModel: t.recommendedModel,
              canRunInParallel: t.canRunInParallel
            }))
          })),
          dependencyEdges: state.review.plan.dependencyEdges ?? [],
          criticalPath: state.review.plan.criticalPath ?? []
        });
        if (ok) {
          this.mirroredPlans.add(run.sessionId);
          this.log(`${run.linearIdentifier}: plan mirrored to the hosted cockpit`);
        }
      }
      void this.mirrorTelemetry(run);
      const progress = progressReport(state, {
        // Same guard as the handler: an older client has no `hostedUrl`, and a
        // missing link must never cost the progress report itself.
        hosted: typeof this.opts.client.hostedUrl === "function" ? this.opts.client.hostedUrl() : "",
        sessionId: run.sessionId
      });
      if (progress && this.reported.get(run.sessionId) !== progress.signature) {
        this.reported.set(run.sessionId, progress.signature);
        try {
          await this.opts.client.reportSessionStatus(run.sessionId, {
            status: "running",
            progressPercent: progress.percent,
            message: progress.message
          });
          this.log(`${run.linearIdentifier}: ${progress.message}`);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          if (/not_found|not found/i.test(reason)) {
            this.runs.delete(run.sessionId);
            this.reported.delete(run.sessionId);
            this.persist();
            this.log(
              `${run.linearIdentifier}: session no longer reachable from this bridge \u2014 stopped watching`
            );
            return;
          }
          this.reported.delete(run.sessionId);
          this.log(`${run.linearIdentifier}: progress report failed (${reason})`);
        }
      }
      return;
    }
    const success = state.status === "complete";
    const waves = state.completedWaves?.length ?? 0;
    const tasks = state.review?.plan?.waves?.reduce((n, w) => n + (w.tasks?.length ?? 0), 0) ?? 0;
    const summary = success ? successSummary(state) : failureSummary(state);
    this.runs.delete(run.sessionId);
    this.reported.delete(run.sessionId);
    this.mirroredPlans.delete(run.sessionId);
    this.persist();
    await this.opts.client.reportSessionComplete(run.sessionId, {
      success,
      summary,
      ...success ? {} : { errorMessage: summary }
    });
    this.log(`${run.linearIdentifier}: reported ${success ? "complete" : "failed"} to the bridge`);
  }
  /**
   * The cockpit item a session's run belongs to, if this bridge is tracking it.
   *
   * The command applier needs this: a decision arrives addressed to a bridge
   * session, and the conductor is addressed by horizon item.
   */
  itemFor(sessionId) {
    return this.runs.get(sessionId)?.itemId;
  }
  /** Test/introspection helper. */
  get tracked() {
    return this.runs.size;
  }
};
function programOf(command) {
  const words = (command ?? "").trim().split(/\s+/).filter(Boolean);
  const program = words.find(
    (w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) && w !== "export" && w !== "env" && /^[\w.@+/-]+$/.test(w)
  );
  if (!program) return "shell";
  const name = program.split("/").pop() ?? program;
  return /^[\w.@+-]{1,40}$/.test(name) ? name : "shell";
}

// src/commands/bridge/command-applier.ts
var CommandApplier = class {
  constructor(opts) {
    this.opts = opts;
    this.base = opts.cockpitUrl.replace(/\/$/, "");
    this.log = opts.onLog ?? (() => {
    });
    this.doFetch = opts.fetchImpl ?? fetch;
    this.timeout = opts.requestTimeoutMs ?? 15 * 6e4;
  }
  /** One pass: fetch pending commands and apply them in order. */
  async sweep() {
    let commands;
    try {
      commands = await this.opts.client.pollSessionCommands();
    } catch (err) {
      this.log(`command poll failed (${err instanceof Error ? err.message : String(err)})`);
      return;
    }
    for (const command of commands) {
      await this.applyOne(command);
    }
  }
  /**
   * Apply one command that has already been polled.
   *
   * Public since TRD 23: the bridge now polls ONCE and routes, because
   * `resume` is applied by a different applier and two pollers would race to
   * claim the same rows.
   */
  async applyOne(command) {
    const itemId = this.opts.resolveItemId(command.sessionId);
    if (!itemId) {
      await this.opts.client.acknowledgeCommands(
        [command.id],
        "failed",
        "This bridge is not tracking that run, so the decision could not be applied."
      );
      this.log(`command ${command.command} for an untracked session \u2014 reported as failed`);
      return;
    }
    const decision = command.command === "approve" ? { action: "approve" } : command.command === "replan" ? { action: "refine", constraints: command.payload?.constraints ?? [] } : { action: "abort", reason: "Aborted from the hosted cockpit" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await this.doFetch(`${this.base}/api/items/${itemId}/conductor`, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision })
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`conductor \u2192 ${res.status} ${detail.slice(0, 200)}`);
      }
      await this.opts.client.acknowledgeCommands([command.id], "applied");
      this.log(`applied ${command.command} from the hosted cockpit`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const transient = /fetch failed|ECONNREFUSED|abort|timeout/i.test(reason);
      if (transient) {
        this.log(`command ${command.command} deferred \u2014 cockpit unreachable (${reason})`);
        return;
      }
      await this.opts.client.acknowledgeCommands([command.id], "failed", reason);
      this.log(`command ${command.command} failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  }
};

// src/commands/bridge/adoption-watcher.ts
import { statSync, existsSync as existsSync7, readFileSync as readFileSync5, writeFileSync as writeFileSync6, mkdirSync as mkdirSync4 } from "fs";
import { dirname as dirname2 } from "path";

// src/commands/bridge/transcript-tail.ts
import { openSync, readSync, fstatSync, closeSync } from "fs";

// src/utils/usage-meter.ts
function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
}
function initialUsageMeter() {
  return { totals: emptyUsage(), turns: 0, last: null };
}
function toTotals(usage) {
  const n = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
  const cacheWrite = n(usage.cache_creation_input_tokens);
  return {
    input: n(usage.input_tokens),
    output: n(usage.output_tokens),
    cacheRead: n(usage.cache_read_input_tokens),
    cacheWrite,
    // Never more than the write it is part of, whatever the client reports.
    cacheWrite1h: Math.min(n(usage.cache_creation?.ephemeral_1h_input_tokens), cacheWrite)
  };
}
function apply(into, add, subtract) {
  into.input += add.input - (subtract?.input ?? 0);
  into.output += add.output - (subtract?.output ?? 0);
  into.cacheRead += add.cacheRead - (subtract?.cacheRead ?? 0);
  into.cacheWrite += add.cacheWrite - (subtract?.cacheWrite ?? 0);
  into.cacheWrite1h = (into.cacheWrite1h ?? 0) + (add.cacheWrite1h ?? 0) - (subtract?.cacheWrite1h ?? 0);
}
function modelKey(model) {
  if (!model || model.startsWith("<")) return null;
  return model.slice(0, 80);
}
function countUsage(state, messageId, usage, model) {
  var _a;
  if (!usage) return;
  const next = toTotals(usage);
  const key = modelKey(model);
  const bucket = key ? (_a = state.byModel ?? (state.byModel = {}))[key] ?? (_a[key] = emptyUsage()) : null;
  if (messageId && state.last?.id === messageId) {
    const prev = state.last.counted;
    apply(state.totals, next, prev);
    const earlier = state.last.model ? state.byModel?.[state.last.model] : null;
    if (earlier) apply(earlier, next, prev);
    state.last.counted = next;
    return;
  }
  apply(state.totals, next);
  if (bucket) apply(bucket, next);
  state.turns += 1;
  state.last = messageId ? { id: messageId, model: key ?? void 0, counted: next } : null;
}
function totalTokens(t) {
  return t.input + t.output + t.cacheRead + t.cacheWrite;
}
function standard(input, output, cacheRead = input * 0.1) {
  return { input, output, cacheRead, cacheWrite: input * 1.25 };
}
var PRICES = [
  ["claude-fable-5-1", standard(10, 50, 0.25)],
  ["claude-mythos-5-1", standard(10, 50, 0.25)],
  ["claude-fable-5", standard(10, 50)],
  ["claude-mythos-5", standard(10, 50)],
  ["claude-opus-5-5", standard(4, 20, 0.2)],
  ["claude-opus-5", standard(5, 25)],
  ["claude-opus-4", standard(5, 25)],
  ["claude-sonnet-5-5", standard(2, 10)],
  ["claude-sonnet-5", standard(2, 10)],
  ["claude-sonnet-4", standard(3, 15)],
  ["claude-haiku-4-5", standard(1, 5)]
];
var DEFAULT_PRICE = standard(5, 25);
function priceFor(model) {
  if (!model) return DEFAULT_PRICE;
  for (const [prefix, price] of PRICES) if (model.startsWith(prefix)) return price;
  return DEFAULT_PRICE;
}
function priceUsage(t, model) {
  const p = priceFor(model);
  const m = 1e6;
  const write1h = Math.min(t.cacheWrite1h ?? 0, t.cacheWrite);
  return t.input * p.input / m + t.output * p.output / m + t.cacheRead * p.cacheRead / m + (t.cacheWrite - write1h) * p.cacheWrite / m + write1h * p.input * 2 / m;
}
function priceMeter(state) {
  const models = Object.entries(state.byModel ?? {});
  if (models.length === 0) return priceUsage(state.totals);
  let cost = 0;
  const attributed = emptyUsage();
  for (const [model, totals] of models) {
    cost += priceUsage(totals, model);
    apply(attributed, totals);
  }
  const rest = {
    input: Math.max(0, state.totals.input - attributed.input),
    output: Math.max(0, state.totals.output - attributed.output),
    cacheRead: Math.max(0, state.totals.cacheRead - attributed.cacheRead),
    cacheWrite: Math.max(0, state.totals.cacheWrite - attributed.cacheWrite),
    cacheWrite1h: Math.max(0, (state.totals.cacheWrite1h ?? 0) - (attributed.cacheWrite1h ?? 0))
  };
  return cost + priceUsage(rest);
}
function priceAtReference(t) {
  if (totalTokens(t) <= 0) return null;
  let best = null;
  for (const [model] of PRICES) {
    const costUsd = priceUsage(t, model);
    if (!best || costUsd > best.costUsd) best = { costUsd, model };
  }
  return best;
}
function dominantModel(state) {
  let best = null;
  let most = -1;
  for (const [model, totals] of Object.entries(state.byModel ?? {})) {
    const size = totalTokens(totals);
    if (size > most) {
      most = size;
      best = model;
    }
  }
  return best ? best.replace(/\[[^\]]*\]$/, "") : null;
}

// src/commands/bridge/transcript-tail.ts
var IDLE_MS = 5 * 60 * 1e3;
var PAUSE_BEAT_MS = 30 * 1e3;
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var MAX_WRITTEN = 500;
var MAX_PATH_LENGTH = 500;
var MAX_TOOL_LENGTH = 64;
function initialTailState() {
  return {
    byteOffset: 0,
    remainder: "",
    seq: 0,
    lastEventMs: null,
    activeMs: 0,
    usage: initialUsageMeter(),
    written: [],
    writeCalls: 0
  };
}
function pathFromCommand(command) {
  if (typeof command !== "string") return null;
  const m = command.match(/[\w./-]+\.(?:ts|tsx|js|jsx|py|sql|md|json|css|sh|mjs|go|rs)\b/);
  return m ? m[0] : null;
}
function parse(line) {
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
function relativePath(tool, input, cwd) {
  let path = typeof input.file_path === "string" && input.file_path || typeof input.path === "string" && input.path || typeof input.notebook_path === "string" && input.notebook_path || null;
  if (!path && tool === "Bash") path = pathFromCommand(input.command);
  if (path && cwd && path.startsWith(cwd)) path = path.slice(cwd.length + 1);
  if (path && path.startsWith("/")) path = null;
  return path;
}
function noteWritten(state, tool, path) {
  if (!WRITE_TOOLS.has(tool)) return;
  state.writeCalls = (state.writeCalls ?? 0) + 1;
  if (!path) return;
  if (path.length > MAX_PATH_LENGTH) return;
  const written = state.written ?? (state.written = []);
  if (written.length >= MAX_WRITTEN || written.includes(path)) return;
  written.push(path);
}
function backfill(fd, state, cwd) {
  state.usage = initialUsageMeter();
  state.written = [];
  state.writeCalls = 0;
  if (state.byteOffset === 0) return;
  const buf = Buffer.alloc(state.byteOffset);
  readSync(fd, buf, 0, buf.length, 0);
  const lines = buf.toString("utf8").split("\n");
  lines.pop();
  for (const line of lines) {
    const o = parse(line);
    if (!o || o.type !== "assistant") continue;
    countUsage(state.usage, o.message?.id, o.message?.usage, o.message?.model);
    for (const block of o.message?.content ?? []) {
      if (block.type !== "tool_use" || !block.name) continue;
      noteWritten(state, block.name, relativePath(block.name, block.input ?? {}, cwd));
    }
  }
}
function tailTranscript(transcriptPath, state, cwd) {
  let fd;
  try {
    fd = openSync(transcriptPath, "r");
  } catch {
    return [];
  }
  let chunk;
  try {
    const size = fstatSync(fd).size;
    if (size < state.byteOffset) {
      state.byteOffset = 0;
      state.remainder = "";
      state.usage = initialUsageMeter();
      state.written = [];
      state.writeCalls = 0;
    }
    if (state.usage === void 0) backfill(fd, state, cwd);
    if (size === state.byteOffset) {
      return [];
    }
    const buf = Buffer.alloc(size - state.byteOffset);
    readSync(fd, buf, 0, buf.length, state.byteOffset);
    state.byteOffset = size;
    chunk = state.remainder + buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
  const lines = chunk.split("\n");
  state.remainder = lines.pop() ?? "";
  const usage = state.usage ?? (state.usage = initialUsageMeter());
  const events = [];
  for (const line of lines) {
    const o = parse(line);
    if (!o || o.type !== "assistant") continue;
    countUsage(usage, o.message?.id, o.message?.usage, o.message?.model);
    const ms = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isFinite(ms)) continue;
    for (const block of o.message?.content ?? []) {
      if (block.type !== "tool_use" || !block.name) continue;
      let path = relativePath(block.name, block.input ?? {}, cwd);
      noteWritten(state, block.name, path);
      if (path && path.length > MAX_PATH_LENGTH) path = null;
      if (state.lastEventMs !== null) {
        const gap = ms - state.lastEventMs;
        state.activeMs += gap >= IDLE_MS ? PAUSE_BEAT_MS : Math.max(gap, 0);
      }
      state.lastEventMs = ms;
      events.push({
        seq: state.seq++,
        t: Math.round(state.activeMs / 1e3),
        tool: block.name.slice(0, MAX_TOOL_LENGTH),
        path
      });
    }
  }
  return events;
}

// src/commands/bridge/transcript-reading.ts
function canSendReadings(client2) {
  return typeof client2.streamEvents === "function" && typeof client2.reportTelemetry === "function";
}
async function sendTranscriptReading(client2, target, at, onLog) {
  const before = target.tail ? structuredClone(target.tail) : void 0;
  target.tail ?? (target.tail = initialTailState());
  const tokensBefore = before?.usage ? totalTokens(before.usage.totals) : -1;
  const derived = tailTranscript(target.transcriptPath, target.tail, target.cwd);
  if (derived.length > 0) {
    const sent = await client2.streamEvents(target.sessionId, derived);
    if (!sent) {
      target.tail = before;
      onLog?.(`stream for ${target.label} did not land; will catch up next tick`);
      return "failed";
    }
  }
  const usage = target.tail.usage?.totals;
  const tokensNow = usage ? totalTokens(usage) : -1;
  if (derived.length === 0 && tokensNow === tokensBefore && !target.readingOwed) return "nothing";
  const latest = derived[derived.length - 1];
  if (latest) {
    target.lastAction = latest.path ? `${latest.tool} \xB7 ${latest.path.split("/").slice(-2).join("/")}` : latest.tool;
  }
  const landed = await client2.reportTelemetry(target.sessionId, {
    toolCalls: target.tail.seq,
    writeCalls: target.tail.writeCalls ?? 0,
    filesTouched: target.tail.written ?? [],
    // Remembered, not re-derived: the hosted row is replaced whole, so a
    // tokens-only update that omitted this would blank the line that says what
    // the session is doing.
    ...target.lastAction ? { currentAction: target.lastAction } : {},
    ...usage ? {
      tokensIn: usage.input,
      tokensOut: usage.output,
      tokensCacheRead: usage.cacheRead,
      tokensCacheWrite: usage.cacheWrite,
      turns: target.tail.usage?.turns,
      // Our arithmetic at API list prices, each model's tokens at its own
      // rate. Not a bill: a subscription was not charged this, and the
      // hosted plane labels it so.
      costUsd: Math.min(Number(priceMeter(target.tail.usage).toFixed(4)), 1e4),
      costEstimated: true,
      ...dominantModel(target.tail.usage) ? { model: dominantModel(target.tail.usage) } : {}
    } : {},
    elapsedMs: Math.round(target.tail.activeMs),
    // mtimeMs is fractional on macOS; the schema's int() refuses a float and
    // the client swallows the 400 — a silently empty table.
    idleMs: Math.round(Math.max(0, at.now - at.mtimeMs))
  });
  target.readingOwed = !landed;
  if (!landed) {
    onLog?.(`reading for ${target.label} did not land; will send it again next tick`);
    return "failed";
  }
  return "sent";
}

// src/commands/bridge/adoption-watcher.ts
var DEFAULT_SETTLE_MS = 30 * 60 * 1e3;
var DEFAULT_TICK_MS = 6e4;
var AdoptionWatcher = class {
  constructor(config) {
    this.config = config;
    this.entries = /* @__PURE__ */ new Map();
    this.timer = null;
    this.settleAfterMs = config.settleAfterMs ?? DEFAULT_SETTLE_MS;
    this.tickMs = config.tickMs ?? DEFAULT_TICK_MS;
  }
  /** Begin watching a freshly adopted session. */
  track(entry) {
    this.entries.set(entry.adoptionKey, entry);
    this.persist();
    this.start();
  }
  /**
   * Re-adopt entries left behind by a previous process.
   *
   * Entries whose transcript no longer exists are dropped rather than polled
   * forever: stale local state must not outlive the thing it describes.
   */
  restore() {
    try {
      if (!existsSync7(this.config.statePath)) return 0;
      const parsed = JSON.parse(readFileSync5(this.config.statePath, "utf8"));
      if (parsed?.version !== 1 || !parsed.entries) return 0;
      let restored = 0;
      for (const entry of Object.values(parsed.entries)) {
        if (entry.settled) continue;
        if (!existsSync7(entry.transcriptPath)) continue;
        this.entries.set(entry.adoptionKey, entry);
        restored++;
      }
      if (restored > 0) this.start();
      return restored;
    } catch {
      return 0;
    }
  }
  /** Whether this watcher is already sending readings for a session. */
  isTracking(adoptionKey) {
    const entry = this.entries.get(adoptionKey);
    return entry !== void 0 && !entry.settled;
  }
  size() {
    return [...this.entries.values()].filter((e) => !e.settled).length;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.tickMs);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.persist();
  }
  /** One pass. Never throws: a reporting failure is retried on the next tick. */
  async sweep(now = Date.now()) {
    for (const entry of [...this.entries.values()]) {
      if (entry.settled) continue;
      let mtimeMs;
      try {
        mtimeMs = statSync(entry.transcriptPath).mtimeMs;
      } catch {
        this.entries.delete(entry.adoptionKey);
        this.persist();
        continue;
      }
      const neverDerived = entry.tail === void 0;
      if (mtimeMs > entry.lastMtimeMs || neverDerived || entry.retryReading) {
        const grew = mtimeMs > entry.lastMtimeMs;
        entry.lastMtimeMs = mtimeMs;
        entry.lastReportedAt = new Date(now).toISOString();
        if (canSendReadings(this.config.client)) {
          const target = {
            sessionId: entry.sessionId,
            label: entry.identifier,
            transcriptPath: entry.transcriptPath,
            cwd: entry.cwd,
            tail: entry.tail,
            lastAction: entry.lastAction,
            readingOwed: entry.readingOwed
          };
          const outcome = await sendTranscriptReading(
            this.config.client,
            target,
            { now, mtimeMs },
            this.config.onLog
          );
          entry.tail = target.tail;
          entry.lastAction = target.lastAction;
          entry.readingOwed = target.readingOwed;
          entry.retryReading = outcome === "failed";
        }
        this.persist();
        if (grew) {
          try {
            await this.config.client.reportSessionStatus(entry.sessionId, {
              status: "running",
              progressPercent: 0,
              message: `Still running on this machine \u2014 ${elapsed(entry.startedAt, now)} so far`
            });
          } catch (err) {
            this.config.onLog?.(
              `could not report ${entry.identifier}: ${err instanceof Error ? err.message : err}`
            );
          }
          continue;
        }
      }
      if (now - mtimeMs < this.settleAfterMs) continue;
      try {
        await this.config.client.reportSessionComplete(entry.sessionId, {
          success: true,
          summary: `The session stopped writing after ${elapsed(entry.startedAt, mtimeMs)}. DevPilot observed it rather than running it, so whether the work is finished is not something it can say.`
        });
        entry.settled = true;
        this.persist();
        this.config.onLog?.(`${entry.identifier} went quiet \u2014 reported, ticket left as it was`);
      } catch (err) {
        this.config.onLog?.(
          `could not settle ${entry.identifier}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    if (this.size() === 0) this.stop();
  }
  persist() {
    try {
      mkdirSync4(dirname2(this.config.statePath), { recursive: true });
      const ledger = { version: 1, entries: Object.fromEntries(this.entries) };
      writeFileSync6(this.config.statePath, JSON.stringify(ledger, null, 2), "utf8");
    } catch {
    }
  }
};
function elapsed(startedAt, endMs) {
  const ms = endMs - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return "an unknown time";
  const minutes = Math.round(ms / 6e4);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours}h ${rest}m`;
}

// src/commands/bridge/observer.ts
import chalk8 from "chalk";
import { existsSync as existsSync8, mkdirSync as mkdirSync5, readFileSync as readFileSync6, statSync as statSync2, writeFileSync as writeFileSync7 } from "fs";
import { dirname as dirname3 } from "path";

// src/commands/sessions/scan-pipeline.ts
import { homedir } from "os";
import { join as join6 } from "path";
import chalk7 from "chalk";
import { adoption } from "@devpilot.sh/core";
function parseDuration(input, fallbackMs) {
  const match = /^(\d+)\s*([smhdw])?$/i.exec(input.trim());
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  const unit = (match[2] ?? "h").toLowerCase();
  const scale = {
    s: 1e3,
    m: 6e4,
    h: 36e5,
    d: 864e5,
    w: 6048e5
  };
  return value * (scale[unit] ?? scale.h);
}
async function runScanPipeline(options) {
  const repos = options.onlyRepo ? [options.onlyRepo] : options.repos;
  const scan = adoption.scanSessions({
    machineName: options.machineName,
    repos,
    // `--repo x` is an explicit narrowing, so it must not be widened by
    // `--all-repos` arriving from a config file or an alias.
    allRepos: options.onlyRepo ? false : options.allRepos,
    sinceMs: options.sinceMs,
    includePaths: options.includePaths,
    excludeSessionUuids: adoption.loadOwnedSessionIds(
      join6(homedir(), ".devpilot", "owned-sessions.json")
    )
  });
  let modelTitles = 0;
  if (options.summarize && scan.candidates.length > 0) {
    const jobs = scan.candidates.filter((c) => !options.skipSummaryFor?.has(c.adoptionKey)).map((candidate) => {
      const observation = observationFor(candidate, scan);
      return observation ? { candidate, observation } : null;
    }).filter((j) => j !== null);
    const summaries = await adoption.summarizeSessions(
      jobs.map((j) => ({
        observation: j.observation,
        touchedPaths: j.candidate.touchedPaths ?? []
      })),
      { maxSummaries: options.maxSummaries, onWarn: options.onWarn }
    );
    summaries.forEach((summary, i) => {
      const candidate = jobs[i].candidate;
      candidate.title = summary.title;
      if (summary.summary) candidate.summary = summary.summary;
      if (summary.source === "model") modelTitles++;
    });
  }
  return {
    candidates: scan.candidates,
    discovered: scan.discovered,
    unmappedProjectCount: scan.unmappedProjectCount,
    skipped: scan.skipped,
    projectDirCount: scan.projectDirCount,
    withheldOwners: adoption.withheldOwners(scan.skipped),
    modelTitles,
    transcriptPaths: scan.transcriptPaths
  };
}
function observationFor(candidate, scan) {
  const path = scan.transcriptPaths?.get(candidate.adoptionKey);
  if (!path) return null;
  return adoption.probeTranscript(path.transcriptPath, path.sessionUuid);
}
function relativeAge(iso, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  const minutes = Math.round(ms / 6e4);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
function pad(value, width) {
  return value.length > width ? `${value.slice(0, width - 1)}\u2026` : value.padEnd(width);
}
function renderPreview(rows, result) {
  const lines = [];
  lines.push(
    chalk7.gray(
      `  Scanned ${result.projectDirCount} project director${result.projectDirCount === 1 ? "y" : "ies"} \xB7 ${result.candidates.length} session${result.candidates.length === 1 ? "" : "s"} in scope`
    )
  );
  lines.push("");
  if (rows.length > 0) {
    lines.push(
      chalk7.gray(`  ${pad("REPO", 30)} ${pad("SESSION", 44)} ${pad("LAST", 6)} \u2192 BOARD`)
    );
    for (const row of rows) {
      lines.push(
        `  ${chalk7.cyan(pad(row.repo, 30))} ${pad(row.title, 44)} ${row.live ? chalk7.green(pad(relativeAge(row.lastActivityAt), 5)) + "\u25CF" : chalk7.gray(pad(relativeAge(row.lastActivityAt), 6))} \u2192 ${row.destination}`
      );
    }
    lines.push("");
  }
  const reasons = /* @__PURE__ */ new Map();
  for (const skip of result.skipped) {
    reasons.set(skip.reason, (reasons.get(skip.reason) ?? 0) + 1);
  }
  const parts = [];
  const label = {
    "not-routed": "not routed",
    "devpilot-owned": "DevPilot-owned",
    "too-old": "outside the window",
    "no-repo": "no git remote",
    sidechain: "subagent transcripts",
    empty: "empty",
    unreadable: "unreadable"
  };
  for (const [reason, count] of reasons) {
    if (reason === "not-routed" && result.withheldOwners.length > 0) {
      parts.push(`${count} not routed (${result.withheldOwners.join(", ")})`);
    } else {
      parts.push(`${count} ${label[reason] ?? reason}`);
    }
  }
  if (parts.length > 0) {
    lines.push(chalk7.gray(`  Skipped: ${parts.join(", ")}`));
    if (reasons.has("not-routed")) {
      lines.push(chalk7.gray("           Run with --all-repos to include the others."));
    }
  }
  return lines.join("\n");
}

// src/commands/bridge/observer.ts
var DEFAULT_INTERVAL_MS = 6e4;
var DEFAULT_SINCE_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_SUMMARISE_BUDGET = 10;
var FIRST_READINGS_PER_SWEEP = 8;
var SessionObserver = class {
  constructor(config) {
    this.config = config;
    this.timer = null;
    this.running = false;
    /** Adoption keys reported live on the previous sweep. */
    this.lastLive = /* @__PURE__ */ new Set();
    /**
     * Adoption keys this process has already reported once.
     *
     * A summary is worth paying for exactly once per session: it is what
     * `/api/sessions/:id/promote` uses as the body of the Linear issue it drafts,
     * and a sweep with no summary produced tickets describing nothing. Paying for
     * it every 60 seconds would be absurd; paying for it never left every ticket
     * thin. First sight is the right moment.
     */
    this.seen = /* @__PURE__ */ new Set();
    /**
     * `adoptionKey → where that conversation lives on this machine`.
     *
     * The resolution table for "take the wheel" (TRD 23 §3.3). The hosted plane
     * can only point at a row; this is the state that says what that means here,
     * and it never leaves the process.
     */
    this.targets = /* @__PURE__ */ new Map();
    /** `adoptionKey → read position and meter` for the instrument readings. */
    this.readings = /* @__PURE__ */ new Map();
    this.sendingReadings = false;
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.sinceMs = config.sinceMs ?? DEFAULT_SINCE_MS;
    this.summariseBudget = config.summariseBudget ?? DEFAULT_SUMMARISE_BUDGET;
    this.restoreReadings();
  }
  /**
   * Where a conversation lives on this machine, by adoption key.
   *
   * Undefined for anything this process has not observed — which is the honest
   * answer, and the reason a resume for another machine's session refuses
   * rather than guessing.
   */
  targetFor(adoptionKey) {
    return this.targets.get(adoptionKey);
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  /**
   * One pass. Never throws, and never overlaps itself.
   *
   * A scan on a large machine takes most of a second and `git status` can take
   * longer; without the guard a slow sweep would stack behind the interval and
   * the machine would spend its life scanning itself.
   */
  async sweep() {
    if (this.running) return null;
    this.running = true;
    try {
      const result = await runScanPipeline({
        machineName: this.config.machineName,
        repos: this.config.repos,
        /**
         * Observation defaults to EVERY repo, unlike placement.
         *
         * TRD 21 §3.5 narrowed adoption to routed repos because it pushes repo
         * names onto a shared Linear board, and one client's names must not
         * reach another client's workspace. Observation has no such reach: it
         * writes only into the org that already receives the full repo
         * inventory from discovery, so restricting it here would buy no privacy
         * and would leave the cockpit empty for anyone who has not routed
         * anything yet — which is everyone, on day one.
         */
        allRepos: this.config.allRepos !== false,
        sinceMs: this.sinceMs,
        includePaths: true,
        /**
         * Summarise only what this process has not seen before, and only a
         * handful per sweep.
         *
         * The first sweep after a connect is the expensive one — everything is
         * new — so it is capped, and the remainder pick up their summary on
         * later passes rather than all at once.
         */
        maxSummaries: this.summariseBudget,
        summarize: true,
        skipSummaryFor: this.seen
      });
      result.candidates.forEach((c) => {
        this.seen.add(c.adoptionKey);
        const at = result.transcriptPaths.get(c.adoptionKey);
        if (at) {
          this.targets.set(c.adoptionKey, {
            transcriptPath: at.transcriptPath,
            sessionUuid: at.sessionUuid,
            repo: c.repo,
            // Carried so a planning handoff has a brief to work from without
            // going back to the hosted plane for what this machine just read.
            title: c.title,
            summary: c.summary,
            branch: c.branch,
            touchedPaths: c.touchedPaths
          });
        }
      });
      const live = new Set(result.candidates.filter((c) => c.live).map((c) => c.adoptionKey));
      const ended = [...this.lastLive].filter((key) => !live.has(key));
      const response = await this.config.client.reportObservations({
        machineName: this.config.machineName,
        sessions: result.candidates,
        endedKeys: ended
      });
      this.lastLive = live;
      if (response) {
        if (response.sessionIds) {
          void this.sendReadings(
            result.candidates.map((c) => ({ key: c.adoptionKey, label: c.repo, live: c.live })),
            response.sessionIds,
            result.transcriptPaths
          );
        }
        return { observed: response.observed, ended: response.ended };
      }
      return null;
    } catch (err) {
      this.config.onLog?.(
        chalk8.gray(`observation sweep failed: ${err instanceof Error ? err.message : err}`)
      );
      return null;
    } finally {
      this.running = false;
    }
  }
  /**
   * Send an instrument reading for each observed session that has something
   * new to say.
   *
   * Live sessions first, and first-time readings capped per pass — see
   * FIRST_READINGS_PER_SWEEP. A session that ended before this bridge started
   * is still read once: what it cost is as much a fact about last week as what
   * a running one costs is about now.
   *
   * Exposed for tests; never throws and never overlaps itself.
   */
  async sendReadings(candidates, sessionIds, locations, now = Date.now()) {
    const client2 = this.config.client;
    if (this.sendingReadings || !canSendReadings(client2)) return 0;
    this.sendingReadings = true;
    let sent = 0;
    let first = 0;
    try {
      const ordered = [...candidates].sort((a, b) => Number(b.live) - Number(a.live));
      for (const candidate of ordered) {
        const sessionId = sessionIds[candidate.key];
        const location = locations.get(candidate.key);
        if (!sessionId || !location) continue;
        if (this.config.isWatched?.(candidate.key)) continue;
        let mtimeMs;
        try {
          mtimeMs = statSync2(location.transcriptPath).mtimeMs;
        } catch {
          this.readings.delete(candidate.key);
          continue;
        }
        const known = this.readings.get(candidate.key);
        if (known && mtimeMs <= known.lastMtimeMs && !known.retry) continue;
        if (!known) {
          if (first >= FIRST_READINGS_PER_SWEEP) continue;
          first++;
        }
        const reading = known ?? {
          sessionId,
          label: candidate.label,
          transcriptPath: location.transcriptPath,
          cwd: location.cwd,
          lastMtimeMs: 0
        };
        reading.sessionId = sessionId;
        const outcome = await sendTranscriptReading(client2, reading, { now, mtimeMs }, this.config.onLog);
        reading.retry = outcome === "failed";
        if (outcome !== "failed") reading.lastMtimeMs = mtimeMs;
        this.readings.set(candidate.key, reading);
        if (outcome === "sent") sent++;
      }
      const current = new Set(candidates.map((c) => c.key));
      for (const key of this.readings.keys()) if (!current.has(key)) this.readings.delete(key);
      this.persistReadings();
    } catch (err) {
      this.config.onLog?.(
        chalk8.gray(`instrument readings failed: ${err instanceof Error ? err.message : err}`)
      );
    } finally {
      this.sendingReadings = false;
    }
    return sent;
  }
  restoreReadings() {
    const path = this.config.readingsStatePath;
    if (!path) return;
    try {
      if (!existsSync8(path)) return;
      const parsed = JSON.parse(readFileSync6(path, "utf8"));
      if (parsed?.version !== 1 || !parsed.readings) return;
      for (const [key, reading] of Object.entries(parsed.readings)) this.readings.set(key, reading);
    } catch {
    }
  }
  persistReadings() {
    const path = this.config.readingsStatePath;
    if (!path) return;
    try {
      mkdirSync5(dirname3(path), { recursive: true });
      writeFileSync7(
        path,
        JSON.stringify({ version: 1, readings: Object.fromEntries(this.readings) }),
        "utf8"
      );
    } catch {
    }
  }
};

// src/commands/bridge/resume-applier.ts
import { adoption as adoption2 } from "@devpilot.sh/core";
var DEFAULT_LIVE_WITHIN_MS = 5 * 6e4;
var ResumeApplier = class {
  constructor(opts) {
    this.opts = opts;
    this.log = opts.onLog ?? (() => {
    });
    this.doFetch = opts.fetchImpl ?? fetch;
    this.liveWithinMs = opts.liveWithinMs ?? DEFAULT_LIVE_WITHIN_MS;
  }
  /** Whether this applier handles a given command. */
  static handles(command) {
    return command.command === "resume";
  }
  /**
   * Apply one resume.
   *
   * Acknowledges only AFTER the runner accepts, matching the ordering rule in
   * `command-applier.ts`: a decision a person made must not be silently dropped
   * because a laptop was asleep. The cost is that an accepted-but-unacknowledged
   * resume is retried, which the runner's own idempotency on `sessionId`
   * absorbs rather than starting a second agent on the same repo.
   */
  async apply(command) {
    const adoptionKey = command.payload?.adoptionKey;
    if (!adoptionKey) {
      await this.fail(
        command,
        "That resume carried no session key, so this machine cannot tell which conversation it means."
      );
      return;
    }
    const target = this.opts.resolveTarget(adoptionKey);
    if (!target) {
      await this.fail(
        command,
        "This machine is not tracking that session, so there is nothing to resume. It may belong to a different machine in the fleet."
      );
      return;
    }
    const observation = adoption2.probeTranscript(target.transcriptPath, target.sessionUuid);
    if (!observation) {
      await this.fail(command, "That session\u2019s transcript is no longer on this machine.");
      return;
    }
    if (command.payload?.mode !== "plan" && Date.now() - observation.lastActivityMs < this.liveWithinMs) {
      await this.fail(
        command,
        "That session is still running, so continuing it would put two agents on one transcript. Open it in Claude Code, or plan the work instead."
      );
      return;
    }
    const message = command.payload?.message?.trim();
    if (command.payload?.mode !== "plan" && !this.opts.sessionApiUrl) {
      await this.fail(
        command,
        "Continuing a session needs the local session runner. Start one with `devpilot session-runner` and reconnect with --session-api-url, or use Plan it."
      );
      return;
    }
    if (command.payload?.mode === "plan") {
      if (!this.opts.cockpitUrl) {
        await this.fail(
          command,
          "Planning needs the local cockpit. Start it with `devpilot serve`, reconnect the bridge with --cockpit-url, or take the wheel without planning."
        );
        return;
      }
      try {
        const summary = await planFromSession({
          client: this.opts.client,
          cockpitUrl: this.opts.cockpitUrl,
          sessionId: command.sessionId,
          repo: target.repo,
          title: target.title || `Continue work in ${target.repo}`,
          message,
          summary: target.summary,
          branch: target.branch,
          touchedPaths: target.touchedPaths,
          fetchImpl: this.doFetch,
          onLog: this.log
        });
        await this.opts.client.acknowledgeCommands([command.id], "applied");
        this.log(`planned ${target.repo}: ${summary}`);
      } catch (err) {
        await this.fail(
          command,
          `Planning failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      return;
    }
    try {
      const res = await this.doFetch(`${this.opts.sessionApiUrl.replace(/\/$/, "")}/v1/sessions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.opts.sessionApiKey ? { authorization: `Bearer ${this.opts.sessionApiKey}` } : {}
        },
        body: JSON.stringify({
          sessionId: command.sessionId,
          repo: target.repo,
          /**
           * `--resume` continues the conversation, so a prompt is optional in a
           * way it never is for a fresh dispatch. With nothing to say, ask the
           * agent to take stock rather than sending an empty string — an empty
           * turn produces an empty answer, and the point of picking this up is
           * to find out where it got to.
           */
          prompt: message || "Summarise where this session got to and what remains, then stop and wait.",
          resumeSessionId: target.sessionUuid,
          // Empty is the established "no callbacks" value; the dispatch path
          // passes the same and relies on polling instead.
          callbackUrl: this.opts.callbackUrl ?? ""
        })
      });
      if (!res.ok && res.status !== 409) {
        const body = await res.text().catch(() => "");
        await this.fail(
          command,
          `The local session runner refused: ${res.status} ${body.slice(0, 200)}`
        );
        return;
      }
      await this.opts.client.acknowledgeCommands([command.id], "applied");
      this.log(
        `took the wheel on ${target.repo}${message ? " with an instruction" : ""} \u2014 it now reports as a DevPilot run`
      );
    } catch (err) {
      this.log(
        `could not reach the session runner (${err instanceof Error ? err.message : String(err)}) \u2014 the resume stays queued`
      );
    }
  }
  async fail(command, reason) {
    await this.opts.client.acknowledgeCommands([command.id], "failed", reason);
    this.log(`resume refused \u2014 ${reason}`);
  }
};

// src/commands/bridge/introspect.ts
import chalk9 from "chalk";
import { adoption as adoption3 } from "@devpilot.sh/core";
async function runIntrospection(options) {
  let result;
  try {
    result = await runScanPipeline({
      machineName: options.machineName,
      repos: options.repos,
      allRepos: options.allRepos,
      sinceMs: 24 * 60 * 60 * 1e3,
      includePaths: true,
      maxSummaries: 25,
      // Only pay for titles when they are about to be written somewhere.
      summarize: options.adopt,
      onWarn: (line) => console.log(chalk9.gray(`   ${line}`))
    });
  } catch (err) {
    console.log(chalk9.gray(`   Could not look around this machine: ${describe2(err)}`));
    return;
  }
  if (result.projectDirCount === 0) {
    return;
  }
  const live = result.discovered.reduce((n, r) => n + r.liveSessionCount, 0);
  const owners = adoption3.groupByOwner(result.discovered);
  console.log(
    chalk9.cyan(
      `   Looked around this machine: ${result.projectDirCount} projects, ${owners.size} owner${owners.size === 1 ? "" : "s"}, ${result.discovered.reduce((n, r) => n + r.sessionCount, 0)} sessions`
    )
  );
  console.log("");
  const sorted = [...owners.entries()].sort(
    (a, b) => b[1].reduce((n, r) => n + r.sessionCount, 0) - a[1].reduce((n, r) => n + r.sessionCount, 0)
  );
  for (const [owner, repos] of sorted.slice(0, 8)) {
    const sessions = repos.reduce((n, r) => n + r.sessionCount, 0);
    const liveHere = repos.reduce((n, r) => n + r.liveSessionCount, 0);
    console.log(
      `     ${chalk9.bold(owner.padEnd(18))} ${String(repos.length).padStart(2)} repo${repos.length === 1 ? " " : "s"}   ${String(sessions).padStart(4)} session${sessions === 1 ? " " : "s"}` + (liveHere > 0 ? chalk9.green(`   \u25CF ${liveHere} live`) : "")
    );
  }
  if (sorted.length > 8) {
    console.log(chalk9.gray(`     \u2026 and ${sorted.length - 8} more`));
  }
  console.log("");
  const discovery = await options.client.reportDiscovery({
    machineName: options.machineName,
    repos: result.discovered,
    unmappedProjectCount: result.unmappedProjectCount
  });
  if (discovery && discovery.proposed > 0) {
    console.log(
      chalk9.gray(
        `     ${discovery.proposed} repo${discovery.proposed === 1 ? "" : "s"} not yet routed \u2014 review at ${options.client.hostedUrl()}/fleet/discovered`
      )
    );
    console.log("");
  } else if (!discovery) {
    console.log(chalk9.gray("     (could not report the inventory \u2014 the bridge is still fine)"));
    console.log("");
  }
  if (live > 0 && !options.adopt) {
    console.log(
      chalk9.gray(
        `     ${live} of these are running right now. \`devpilot sessions scan\` shows what putting them on the board would do.`
      )
    );
    console.log("");
  }
  if (!options.adopt || result.candidates.length === 0) return;
  try {
    const response = await options.client.adoptSessions({
      machineName: options.machineName,
      candidates: result.candidates,
      dryRun: false
    });
    console.log(
      chalk9.green(
        `   \u2713 Adopted ${response.adopted}, attached ${response.attached}, ${response.duplicates} already tracked, ${response.skipped} skipped`
      )
    );
    const byKey = new Map(result.candidates.map((c) => [c.adoptionKey, c]));
    for (const outcome of response.outcomes) {
      if (outcome.status !== "adopted" && outcome.status !== "attached" && outcome.status !== "duplicate")
        continue;
      if (!outcome.sessionId) continue;
      const candidate = byKey.get(outcome.adoptionKey);
      const location = result.transcriptPaths?.get(outcome.adoptionKey);
      if (!candidate?.live || !location) continue;
      options.watcher.track({
        adoptionKey: outcome.adoptionKey,
        sessionId: outcome.sessionId,
        identifier: outcome.linearIdentifier ?? candidate.repo,
        transcriptPath: location.transcriptPath,
        repo: candidate.repo,
        startedAt: candidate.startedAt,
        lastMtimeMs: Date.parse(candidate.lastActivityAt),
        lastReportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        settled: false,
        // Repo-relative paths in the stream need the absolute prefix to strip.
        cwd: location.cwd
      });
    }
    if (options.watcher.size() > 0) {
      console.log(
        chalk9.gray(
          `     Watching ${options.watcher.size()} of them. They are observed, not dispatched \u2014 no ticket will be moved.`
        )
      );
    }
    console.log("");
  } catch (err) {
    console.log(chalk9.yellow(`   Could not adopt: ${describe2(err)}`));
    console.log("");
  }
}
function describe2(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/commands/bridge/connect.ts
function stableMachineName() {
  const path = join7(homedir2(), ".devpilot", "machine.json");
  try {
    if (existsSync9(path)) {
      const saved = JSON.parse(readFileSync7(path, "utf8"));
      if (saved.name) return saved.name;
    }
  } catch {
  }
  const name = os.hostname();
  try {
    mkdirSync6(dirname4(path), { recursive: true });
    writeFileSync8(path, JSON.stringify({ name }, null, 2), "utf8");
  } catch {
  }
  return name;
}
var connectCommand = new Command6("connect").description("Connect this machine to a DevPilot bridge and run dispatched work locally").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-n, --name <name>", "Name for this machine (defaults to a stable name for this machine)").option("-r, --repos <repos>", "Comma-separated repos this machine handles").option("-m, --mode <mode>", "Local orchestrator mode (http|claude-session)", "http").option(
  "--transport <transport>",
  "realtime | poll \u2014 polling is fully correct, just higher latency",
  process.env.DEVPILOT_BRIDGE_TRANSPORT || "realtime"
).option("-j, --max-jobs <n>", "Max concurrent local jobs", "4").option("--http-url <url>", "Orchestrator URL (required for --mode http)").option("--ao-project <name>", "ao project name (for --mode ao-cli)").option("--ao-path <path>", "Path to the ao binary (default: ao on PATH)").option(
  "--session-api-url <url>",
  "Session runner URL (required for --mode claude-session)",
  process.env.DEVPILOT_SESSION_API_URL
).option(
  "--session-api-key <token>",
  "Bearer token the session runner expects",
  process.env.DEVPILOT_SESSION_API_KEY
).option(
  "--plan",
  "Route dispatches through the conductor (plan \u2192 waves) instead of one session",
  process.env.DEVPILOT_BRIDGE_PLAN === "true"
).option(
  "--cockpit-url <url>",
  "Local cockpit base URL for --plan",
  process.env.DEVPILOT_COCKPIT_URL || "http://127.0.0.1:3000"
).option("--no-save", "Do not remember the bridge URL and token on this machine").option("--no-discover", "Do not report which repos this machine has agent history for").option(
  "--no-observe",
  "Do not report the agent sessions running on this machine to the cockpit"
).option(
  "--adopt",
  "Also put agent sessions already running on this machine onto the board",
  process.env.DEVPILOT_BRIDGE_ADOPT === "true"
).option(
  "--adopt-all-repos",
  "With --adopt, include repos this machine does not route (names them first)",
  false
).action(async (options) => {
  const credentials = resolveBridgeCredentials({ url: options.url, token: options.token });
  options.url = credentials.url ?? (credentials.token ? DEFAULT_BRIDGE_URL : void 0);
  options.token = credentials.token;
  if (!options.url) {
    console.error(chalk10.red("\u2717 Bridge URL required (--url or DEVPILOT_BRIDGE_URL)"));
    process.exit(1);
  }
  if (!options.token) {
    console.error(chalk10.red("\u2717 Token required (--token or DEVPILOT_BRIDGE_TOKEN)"));
    console.error(chalk10.gray("  Mint one in the dashboard under Settings \u2192 Tokens."));
    process.exit(1);
  }
  const repos = options.repos?.split(",").map((r) => r.trim()).filter(Boolean) ?? [];
  const maxConcurrentJobs = Math.max(1, parseInt(options.maxJobs, 10) || 4);
  console.log(chalk10.cyan("\u{1F309} DevPilot bridge"));
  console.log(chalk10.gray(`   ${options.url}`));
  console.log(chalk10.gray(`   machine: ${options.name}`));
  console.log("");
  const usesLocalOrchestrator = !options.plan;
  if (usesLocalOrchestrator && options.mode === "ao-cli") {
    console.error(chalk10.red("\u2717 --mode ao-cli is deprecated and non-functional."));
    console.error(chalk10.gray("  `ao` is now a daemon on 127.0.0.1:3001; point http mode at it:"));
    console.error(chalk10.gray("    devpilot bridge connect --mode http --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  if (usesLocalOrchestrator && options.mode === "http" && !options.httpUrl) {
    console.error(chalk10.red("\u2717 --mode http requires --http-url"));
    console.error(chalk10.gray("  For the ao daemon: --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  if (usesLocalOrchestrator && options.mode === "claude-session" && !options.sessionApiUrl) {
    console.error(chalk10.red("\u2717 --mode claude-session requires --session-api-url"));
    console.error(chalk10.gray("  Start the runner, then point at it:"));
    console.error(chalk10.gray("    devpilot session-runner --port 3900 --token <t>"));
    console.error(chalk10.gray("    \u2026 --session-api-url http://127.0.0.1:3900 --session-api-key <t>"));
    process.exit(1);
  }
  const client2 = new BridgeClient({ bridgeUrl: options.url, token: options.token });
  let registration;
  try {
    const machineName = options.name ?? stableMachineName();
    registration = await client2.register({ name: machineName, repos, maxConcurrentJobs });
  } catch (err) {
    console.error(chalk10.red("\u2717 Registration failed"));
    console.error(chalk10.red(`   ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }
  console.log(chalk10.green("\u2713 Registered"));
  console.log(chalk10.gray(`   orchestrator: ${registration.orchestratorId}`));
  if (options.save !== false && credentials.source !== "saved") {
    const saved = saveBridgeCredentials({ url: options.url, token: options.token });
    if (saved) {
      console.log(chalk10.gray(`   remembered in ${bridgeCredentialsPath()} \u2014 reconnect with no flags`));
    }
  }
  console.log(chalk10.gray(`   repos: ${repos.join(", ") || "(none)"}`));
  if (repos.length === 0) {
    console.log(chalk10.yellow("   \u26A0 No repos specified \u2014 nothing can route to this machine."));
    console.log(chalk10.gray("     Re-run with --repos owner/name to receive dispatches."));
  }
  console.log("");
  const useRealtime = options.transport !== "poll" && registration.realtime !== null;
  if (options.transport !== "poll" && !registration.realtime) {
    console.log(chalk10.yellow("   Realtime unavailable from this bridge \u2014 polling instead."));
  }
  const conductorWatcher = options.plan ? new ConductorWatcher({
    client: client2,
    cockpitUrl: options.cockpitUrl,
    // Survives a restart. Without this, upgrading the CLI or closing a
    // laptop lid orphaned every in-flight run: the cockpit kept working
    // and Linear was never told how any of it ended.
    statePath: join7(homedir2(), ".devpilot", "conductor-watch.json"),
    onLog: (line) => console.log(chalk10.blue(`   ${line}`)),
    onLost: (run) => console.log(
      chalk10.yellow(
        `   ${run.linearIdentifier} still running at shutdown \u2014 it will be picked up on the next start`
      )
    )
  }) : null;
  const commandApplier = options.plan && conductorWatcher ? new CommandApplier({
    client: client2,
    cockpitUrl: options.cockpitUrl,
    resolveItemId: (sessionId) => conductorWatcher.itemFor(sessionId),
    onLog: (line) => console.log(chalk10.blue(`   ${line}`))
  }) : null;
  const readopted = conductorWatcher?.restore() ?? 0;
  if (readopted > 0) {
    console.log(
      chalk10.blue(
        `   Resumed watching ${readopted} run${readopted === 1 ? "" : "s"} from a previous session`
      )
    );
  }
  const adoptionWatcher = new AdoptionWatcher({
    client: client2,
    statePath: join7(homedir2(), ".devpilot", "adoption-watch.json"),
    onLog: (line) => console.log(chalk10.blue(`   ${line}`))
  });
  const resumedAdoptions = adoptionWatcher.restore();
  if (resumedAdoptions > 0) {
    console.log(
      chalk10.blue(
        `   Watching ${resumedAdoptions} adopted session${resumedAdoptions === 1 ? "" : "s"} from a previous run`
      )
    );
  }
  const observer = options.observe !== false ? new SessionObserver({
    client: client2,
    machineName: options.name ?? stableMachineName(),
    repos,
    // A session placed on a board is already followed by the adoption
    // watcher; everything else gets its instruments from the observer.
    isWatched: (key) => adoptionWatcher.isTracking(key),
    readingsStatePath: join7(homedir2(), ".devpilot", "observed-readings.json"),
    onLog: (line) => console.log(chalk10.gray(`   ${line}`))
  }) : null;
  if (observer) {
    const first = await observer.sweep();
    if (first && first.observed > 0) {
      console.log(
        chalk10.green(
          `   \u2713 Observing ${first.observed} agent session${first.observed === 1 ? "" : "s"} on this machine`
        )
      );
      console.log(chalk10.gray(`     ${client2.hostedUrl()}/cockpit`));
      console.log("");
    }
    observer.start();
  }
  const resumeApplier = observer && (options.sessionApiUrl || options.cockpitUrl) ? new ResumeApplier({
    client: client2,
    sessionApiUrl: options.sessionApiUrl,
    sessionApiKey: options.sessionApiKey,
    // Deliberately none: an adopted session is reported by the
    // observation sweep, which is already watching its transcript.
    callbackUrl: "",
    // Planning is an HTTP call to the local cockpit; without one the
    // applier refuses `plan` and says so rather than silently
    // continuing the conversation instead.
    cockpitUrl: options.cockpitUrl,
    resolveTarget: (key) => {
      const at = observer.targetFor(key);
      return at ? { ...at, cwd: "" } : void 0;
    },
    onLog: (line) => console.log(chalk10.blue(`   ${line}`))
  }) : null;
  if (commandApplier || resumeApplier) {
    const pump = async () => {
      let commands;
      try {
        commands = await client2.pollSessionCommands();
      } catch {
        return;
      }
      for (const command of commands) {
        if (ResumeApplier.handles(command)) {
          if (resumeApplier) {
            await resumeApplier.apply(command);
          } else {
            await client2.acknowledgeCommands(
              [command.id],
              "failed",
              "This machine has no session runner, so it cannot take the wheel. Start one with `devpilot session-runner` and reconnect."
            );
          }
        } else if (commandApplier) {
          await commandApplier.applyOne(command);
        } else {
          await client2.acknowledgeCommands(
            [command.id],
            "failed",
            "This bridge is not running a conductor, so it cannot apply that decision."
          );
        }
      }
    };
    const tick = () => void pump();
    setInterval(tick, 15e3).unref?.();
    tick();
  }
  if (options.discover !== false) {
    await runIntrospection({
      client: client2,
      machineName: options.name ?? stableMachineName(),
      repos,
      adopt: Boolean(options.adopt),
      allRepos: Boolean(options.adoptAllRepos),
      watcher: adoptionWatcher
    });
  }
  const loop = new DispatchLoop({
    client: client2,
    orchestratorId: registration.orchestratorId,
    realtime: useRealtime && registration.realtime ? {
      supabaseUrl: registration.realtime.supabaseUrl,
      anonKey: registration.realtime.anonKey,
      jwt: registration.realtime.jwt
    } : null,
    maxConcurrent: maxConcurrentJobs,
    handler: options.plan ? createConductorDispatchHandler({
      client: client2,
      cockpitUrl: options.cockpitUrl,
      watcher: conductorWatcher,
      onLog: (line) => console.log(chalk10.blue(`   ${line}`))
    }) : createBridgeDispatchHandler({
      client: client2,
      orchestratorMode: options.mode,
      httpUrl: options.httpUrl,
      sessionApiUrl: options.sessionApiUrl,
      sessionApiKey: options.sessionApiKey,
      aoProjectName: options.aoProject,
      aoPath: options.aoPath,
      onLog: (line) => console.log(chalk10.blue(`   ${line}`))
    }),
    onLog: (line) => console.log(chalk10.gray(`   ${line}`)),
    onError: (e) => console.log(chalk10.yellow(`   ${e.message}`))
  });
  const heartbeat = new HeartbeatService({
    client: client2,
    activeJobs: () => loop.activeJobs,
    onError: (e) => console.log(chalk10.gray(`   heartbeat: ${e.message}`))
  });
  await loop.start();
  heartbeat.start();
  console.log(chalk10.green(`\u2713 Listening (${useRealtime ? "realtime" : "poll"})`));
  console.log(chalk10.gray("   Agents run on THIS machine. Ctrl+C to disconnect."));
  console.log("");
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("");
    console.log(chalk10.yellow("Disconnecting\u2026"));
    heartbeat.stop();
    observer?.stop();
    conductorWatcher?.stop();
    await loop.stop();
    console.log(chalk10.green("\u2713 Disconnected"));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  await new Promise(() => {
  });
});

// src/commands/bridge/disconnect.ts
import { Command as Command7 } from "commander";
import chalk11 from "chalk";
import {
  bridgeCredentialsPath as bridgeCredentialsPath2,
  clearBridgeCredentials,
  loadBridgeCredentials as loadBridgeCredentials2
} from "@devpilot.sh/bridge-client";
var disconnectCommand = new Command7("disconnect").description("Forget the bridge URL and token saved on this machine").action(async () => {
  const saved = loadBridgeCredentials2();
  clearBridgeCredentials();
  if (saved) {
    console.log(chalk11.green("\u2713 Forgot the saved token for ") + chalk11.gray(saved.url));
  } else {
    console.log(chalk11.gray(`Nothing was saved at ${bridgeCredentialsPath2()}.`));
  }
  console.log("");
  console.log(chalk11.gray("  The token still works for anyone who has a copy of it. To end that,"));
  console.log(chalk11.gray("  revoke it in the dashboard under Settings \u2192 Tokens \u2014 it stops being"));
  console.log(chalk11.gray("  accepted on the very next request."));
  console.log(chalk11.gray("  A bridge that is running now keeps running until you stop it (Ctrl+C)."));
  console.log("");
});

// src/commands/bridge/status.ts
import { Command as Command8 } from "commander";
import chalk12 from "chalk";
var statusCommand2 = new Command8("status").description("Check bridge connection status").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-i, --orchestrator-id <id>", "Orchestrator ID").option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).action(async (options) => {
  if (!options.bridgeUrl) {
    console.error(chalk12.red("\u2717 Error: Bridge URL required"));
    console.error(chalk12.gray("   Use: devpilot bridge status -u <url>"));
    process.exit(1);
  }
  console.log(chalk12.cyan("\u{1F309} DevPilot Bridge Status"));
  console.log("");
  try {
    const healthRes = await fetch(`${options.bridgeUrl}/health`);
    const health = await healthRes.json();
    console.log(chalk12.white("Bridge Status:"));
    if (health.status === "ok") {
      console.log(chalk12.gray("  Status: ") + chalk12.green("\u2713 Online"));
    } else {
      console.log(chalk12.gray("  Status: ") + chalk12.red("\u2717 Offline"));
    }
    console.log("");
    if (options.orchestratorId) {
      const orchRes = await fetch(
        `${options.bridgeUrl}/api/orchestrators/${options.orchestratorId}`,
        {
          headers: {
            "Authorization": `Bearer ${options.apiKey}`
          }
        }
      );
      if (orchRes.ok) {
        const orch = await orchRes.json();
        console.log(chalk12.white("Orchestrator Status:"));
        console.log(chalk12.gray("  ID: ") + chalk12.cyan(orch.id));
        console.log(chalk12.gray("  Name: ") + chalk12.white(orch.name));
        if (orch.isOnline) {
          console.log(chalk12.gray("  Online: ") + chalk12.green("\u2713"));
        } else {
          console.log(chalk12.gray("  Online: ") + chalk12.red("\u2717"));
        }
        console.log(chalk12.gray("  Active Jobs: ") + chalk12.yellow(orch.activeJobs));
        console.log(chalk12.gray("  Last Heartbeat: ") + chalk12.white(orch.lastHeartbeat || "Never"));
        console.log(chalk12.gray("  Repos: ") + chalk12.cyan(orch.repos?.join(", ") || "None"));
      } else {
        console.log(chalk12.white("Orchestrator Status:"));
        console.log(chalk12.gray("  ") + chalk12.red("Not found or unauthorized"));
      }
    }
  } catch (error) {
    console.error(chalk12.red("\u2717 Error checking status:"));
    console.error(chalk12.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge.ts
var bridgeCommand = new Command9("bridge").description("Manage connection to DevPilot cloud bridge").addCommand(connectCommand).addCommand(disconnectCommand).addCommand(statusCommand2);

// src/commands/session.ts
import { Command as Command13 } from "commander";

// src/commands/session/new.ts
import os2 from "os";
import { Command as Command10 } from "commander";
import chalk13 from "chalk";
import { buildSessionHandoff, SESSION_LIMITS } from "@devpilot.sh/bridge-protocol";
import {
  DEFAULT_BRIDGE_URL as DEFAULT_BRIDGE_URL2,
  SharedSessionClient,
  resolveBridgeCredentials as resolveBridgeCredentials2
} from "@devpilot.sh/bridge-client";
var MODES = ["observe", "relay", "auto"];
var newCommand = new Command10("new").description("Create a shared session and print the message to send your teammate").argument("<title>", "What this session is about (stored in plaintext \u2014 no secrets)").option("-u, --url <url>", "Bridge URL (defaults to the one this machine is connected to)").option("-t, --token <token>", "Machine token (defaults to the one this machine is connected with)").option("--issue <identifier>", "Linear issue identifier to attach, e.g. ENG-394").option(
  "--mode <mode>",
  "observe (agents post only when asked) | relay | auto (agents may reply, bounded)",
  "observe"
).option("--budget <n>", `Agent messages allowed in auto mode (default ${SESSION_LIMITS.autoDefaultBudget})`).option("--minutes <n>", `Minutes auto mode lasts (default ${SESSION_LIMITS.autoDefaultTtlMinutes})`).option("-n, --name <name>", "Your display name in the transcript", os2.hostname()).option("-m, --message <text>", "Post this as the first message (encrypted)").option("--link-only", "Print just the join link, for scripts").action(async (title, options) => {
  const credentials = resolveBridgeCredentials2({ url: options.url, token: options.token });
  if (!credentials.token) {
    console.error(chalk13.red("\u2717 No machine token"));
    console.error(
      chalk13.gray("  Connect this machine once with `devpilot bridge connect --token <token>` and it")
    );
    console.error(chalk13.gray("  is remembered, or pass --token / set DEVPILOT_BRIDGE_TOKEN."));
    process.exit(1);
  }
  if (!MODES.includes(options.mode)) {
    console.error(chalk13.red(`\u2717 Unknown mode "${options.mode}" \u2014 use observe, relay or auto`));
    process.exit(1);
  }
  const mode = options.mode;
  const autoBudget = options.budget ? parseInt(options.budget, 10) : SESSION_LIMITS.autoDefaultBudget;
  const autoTtlMinutes = options.minutes ? parseInt(options.minutes, 10) : SESSION_LIMITS.autoDefaultTtlMinutes;
  if (mode === "auto" && !(autoBudget > 0 && autoTtlMinutes > 0)) {
    console.error(chalk13.red("\u2717 auto mode needs a positive --budget and --minutes"));
    process.exit(1);
  }
  let created;
  try {
    created = await SharedSessionClient.create({
      baseUrl: credentials.url ?? DEFAULT_BRIDGE_URL2,
      token: credentials.token,
      title,
      displayName: options.name,
      kind: "human",
      linearIdentifier: options.issue,
      mode,
      autoBudget,
      autoTtlMinutes
    });
  } catch (err) {
    console.error(chalk13.red("\u2717 Could not create the session"));
    console.error(chalk13.gray(`  ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
  const { client: client2, link } = created;
  if (options.message) await client2.post(options.message);
  if (options.linkOnly) {
    console.log(link);
    return;
  }
  console.log("");
  console.log(chalk13.cyan(`  ${title}`) + chalk13.gray(`  \xB7  ${mode}`));
  console.log("");
  console.log(chalk13.gray("  Send this to your teammate:"));
  console.log("");
  for (const line of buildSessionHandoff({ title, link, mode, autoBudget, autoTtlMinutes }).split("\n")) {
    console.log(`  ${line}`);
  }
  console.log("");
  console.log(chalk13.yellow("  Anyone with that link can read the whole transcript."));
  console.log(chalk13.gray("  The key is after the #, and never reaches the bridge. To revoke the"));
  console.log(chalk13.gray("  link, re-key the session from the dashboard; that ends access for it"));
  console.log(chalk13.gray("  but cannot un-send what was already read."));
  console.log("");
  console.log(chalk13.gray(`  Follow it here with:  devpilot session tail "${chalk13.italic("<link>")}"`));
  console.log("");
});

// src/commands/session/join.ts
import os3 from "os";
import { Command as Command11 } from "commander";
import chalk14 from "chalk";
import { SharedSessionClient as SharedSessionClient2 } from "@devpilot.sh/bridge-client";
var joinCommand = new Command11("join").description("Join a shared session by link and post a message").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", os3.hostname()).option("-m, --message <text>", "Post this message after joining").action(async (url, options) => {
  try {
    const client2 = await SharedSessionClient2.join({ link: url, displayName: options.name });
    const s = client2.session;
    console.log(chalk14.cyan(`
  ${s.title}`));
    console.log(chalk14.gray(`  mode: ${s.mode}  \xB7  messages: ${s.lastSeq ?? 0}
`));
    if (options.message) {
      const posted = await client2.post(options.message);
      console.log(chalk14.green(`  posted #${posted.seq}
`));
    }
    const participants = await client2.who();
    for (const p of participants) {
      const agent = p.agentKind ? chalk14.gray(` [${p.agentKind}]`) : "";
      console.log(`  \xB7 ${p.displayName}${agent}${p.leftAt ? chalk14.gray(" (left)") : ""}`);
    }
    console.log("");
  } catch (err) {
    console.error(chalk14.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
});

// src/commands/session/tail.ts
import os4 from "os";
import { Command as Command12 } from "commander";
import chalk15 from "chalk";
import { SharedSessionClient as SharedSessionClient3 } from "@devpilot.sh/bridge-client";
var tailCommand = new Command12("tail").description("Follow a shared session transcript in the terminal").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", os4.hostname()).option("-i, --interval <seconds>", "Poll interval", "3").action(async (url, options) => {
  const intervalMs = Math.max(1, parseInt(options.interval, 10) || 3) * 1e3;
  let client2;
  try {
    client2 = await SharedSessionClient3.join({ link: url, displayName: options.name });
  } catch (err) {
    console.error(chalk15.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
    return;
  }
  const names = /* @__PURE__ */ new Map();
  for (const p of await client2.who()) names.set(p.id, p.displayName);
  console.log(chalk15.cyan(`
  ${client2.session.title}`));
  console.log(chalk15.gray(`  following \xB7 ctrl-c to stop
`));
  let cursor = 0;
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
    console.log(chalk15.gray("\n  stopped\n"));
    process.exit(0);
  });
  while (!stopped) {
    try {
      const { entries, latestSeq } = await client2.read(cursor);
      if (entries.length > 0) {
        if (entries.some((e) => e.participantId && !names.has(e.participantId))) {
          for (const p of await client2.who()) names.set(p.id, p.displayName);
        }
        for (const e of entries) console.log(format(e, names));
        cursor = latestSeq;
      }
    } catch (err) {
      console.error(chalk15.gray(`  \u2026 ${err instanceof Error ? err.message : String(err)}`));
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
});
function format(e, names) {
  const who = e.participantId ? names.get(e.participantId) ?? e.participantId : "system";
  const seq = chalk15.gray(`#${String(e.seq).padStart(3)}`);
  if (e.status === "system") {
    const reason = e.systemNotice?.reason ? ` (${e.systemNotice.reason})` : "";
    return `  ${seq} ${chalk15.yellow(`\u2699 ${e.systemNotice?.type ?? e.text}${reason}`)}`;
  }
  if (e.status === "undecryptable") {
    return `  ${seq} ${chalk15.gray(`${who}: <sealed under an earlier key \u2014 not readable with this link>`)}`;
  }
  return `  ${seq} ${chalk15.bold(who)}: ${e.text}`;
}

// src/commands/session.ts
var sessionCommand = new Command13("session").description("Shared, end-to-end encrypted sessions across machines").addCommand(newCommand).addCommand(joinCommand).addCommand(tailCommand);

// src/commands/sessions/index.ts
import os5 from "os";
import { homedir as homedir3 } from "os";
import { join as join8, dirname as dirname5 } from "path";
import { existsSync as existsSync10, readFileSync as readFileSync8, writeFileSync as writeFileSync9, mkdirSync as mkdirSync7 } from "fs";
import { Command as Command14 } from "commander";
import chalk16 from "chalk";
import inquirer from "inquirer";
import { BridgeClient as BridgeClient2 } from "@devpilot.sh/bridge-client";
function stableMachineName2() {
  const path = join8(homedir3(), ".devpilot", "machine.json");
  try {
    if (existsSync10(path)) {
      const saved = JSON.parse(readFileSync8(path, "utf8"));
      if (saved.name) return saved.name;
    }
  } catch {
  }
  const name = os5.hostname();
  try {
    mkdirSync7(dirname5(path), { recursive: true });
    writeFileSync9(path, JSON.stringify({ name }, null, 2), "utf8");
  } catch {
  }
  return name;
}
function withCommonOptions(command) {
  return command.option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-n, --name <name>", "Machine name (defaults to this machine\u2019s stable name)").option("-r, --repos <repos>", "Comma-separated repos this machine handles").option(
    "--all-repos",
    "Include every repo found on this machine, not only the ones it routes",
    false
  ).option("--repo <owner/name>", "Restrict to a single repo").option("--since <duration>", "How far back to look (e.g. 24h, 3d)", "24h").option("--no-paths", "Do not send the paths of changed files").option("--max-summaries <n>", "Cap on model-written titles", "25").option("--json", "Machine-readable output");
}
async function pipeline(options) {
  const machineName = options.name ?? stableMachineName2();
  const result = await runScanPipeline({
    machineName,
    repos: options.repos?.split(",").map((r) => r.trim()).filter(Boolean) ?? [],
    allRepos: Boolean(options.allRepos),
    onlyRepo: options.repo,
    sinceMs: parseDuration(options.since, 24 * 60 * 60 * 1e3),
    includePaths: options.paths !== false,
    maxSummaries: Math.max(0, parseInt(options.maxSummaries, 10) || 25),
    summarize: true,
    onWarn: (message) => {
      if (!options.json) console.log(chalk16.gray(`   ${message}`));
    }
  });
  return { machineName, result };
}
function destinationFor(outcome) {
  if (!outcome) return chalk16.gray("\u2014");
  switch (outcome.status) {
    case "duplicate":
      return chalk16.gray(`${outcome.linearIdentifier ?? "already adopted"} (tracked)`);
    case "attached":
      return chalk16.green(`${outcome.linearIdentifier} (${outcome.matchedBy})`);
    case "adopted":
      return outcome.linearIdentifier ? chalk16.green(outcome.linearIdentifier) : chalk16.yellow("create");
    case "skipped":
      return chalk16.yellow(outcome.reason ? `skip \u2014 ${outcome.reason.slice(0, 60)}` : "skip");
  }
}
function rowsFrom(result, outcomes) {
  const byKey = new Map(outcomes.map((o) => [o.adoptionKey, o]));
  return result.candidates.map((candidate) => ({
    repo: candidate.repo,
    title: candidate.title,
    lastActivityAt: candidate.lastActivityAt,
    live: candidate.live,
    destination: destinationFor(byKey.get(candidate.adoptionKey))
  }));
}
function client(options) {
  if (!options.url || !options.token) return null;
  return new BridgeClient2({ bridgeUrl: options.url, token: options.token });
}
var scanCommand = withCommonOptions(
  new Command14("scan").description(
    "List agent sessions on this machine and what adopting them would do. Writes nothing."
  )
).action(async (options) => {
  const { machineName, result } = await pipeline(options);
  let outcomes = [];
  const bridge = client(options);
  if (bridge && result.candidates.length > 0) {
    try {
      const response = await bridge.adoptSessions({
        machineName,
        candidates: result.candidates,
        dryRun: true
      });
      outcomes = response.outcomes;
    } catch (err) {
      if (!options.json) {
        console.log(chalk16.yellow(`   Could not preview against the bridge: ${describe3(err)}`));
        console.log(chalk16.gray("   Showing the local scan only."));
      }
    }
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          machineName,
          candidates: result.candidates,
          discovered: result.discovered,
          outcomes,
          skipped: result.skipped,
          unmappedProjectCount: result.unmappedProjectCount
        },
        null,
        2
      )
    );
    return;
  }
  console.log("");
  console.log(renderPreview(rowsFrom(result, outcomes), result));
  console.log("");
  if (!bridge) {
    console.log(
      chalk16.gray(
        "  No bridge credentials, so this is a local listing only. Pass --url and --token"
      )
    );
    console.log(chalk16.gray("  to see which Linear issues these would attach to."));
  } else if (result.candidates.length > 0) {
    console.log(chalk16.gray("  Nothing was written. Run `devpilot sessions adopt` to act on this."));
  }
  console.log("");
});
var adoptCommand = withCommonOptions(
  new Command14("adopt").description("Put agent sessions running on this machine onto the board")
).option("-y, --yes", "Skip the confirmation").action(async (options) => {
  const bridge = client(options);
  if (!bridge) {
    console.error(chalk16.red("\u2717 Bridge URL and token required (--url / --token)"));
    console.error(chalk16.gray("  Mint a token in the dashboard under Settings \u2192 Tokens."));
    process.exit(1);
  }
  const { machineName, result } = await pipeline(options);
  if (result.candidates.length === 0) {
    console.log("");
    console.log(renderPreview([], result));
    console.log("");
    console.log(chalk16.gray("  No sessions to adopt."));
    console.log("");
    return;
  }
  let preview;
  try {
    preview = await bridge.adoptSessions({
      machineName,
      candidates: result.candidates,
      dryRun: true
    });
  } catch (err) {
    console.error(chalk16.red(`\u2717 ${describe3(err)}`));
    process.exit(1);
  }
  console.log("");
  console.log(renderPreview(rowsFrom(result, preview.outcomes), result));
  console.log("");
  const willCreate = preview.outcomes.filter((o) => o.status === "adopted").length;
  const willAttach = preview.outcomes.filter((o) => o.status === "attached").length;
  if (willCreate === 0 && willAttach === 0) {
    console.log(chalk16.gray("  Nothing new to adopt \u2014 everything here is already tracked."));
    console.log("");
    return;
  }
  console.log(
    `  This creates ${chalk16.bold(String(willCreate))} Linear issue${willCreate === 1 ? "" : "s"} and attaches ${chalk16.bold(String(willAttach))} existing.`
  );
  console.log("");
  if (!options.yes) {
    const { proceed } = await inquirer.prompt([
      { type: "confirm", name: "proceed", message: "Continue?", default: false }
    ]);
    if (!proceed) {
      console.log(chalk16.gray("  Nothing was written."));
      return;
    }
  }
  let response;
  try {
    response = await bridge.adoptSessions({
      machineName,
      candidates: result.candidates,
      dryRun: false
    });
  } catch (err) {
    console.error(chalk16.red(`\u2717 ${describe3(err)}`));
    process.exit(1);
  }
  console.log("");
  for (const outcome of response.outcomes) {
    if (outcome.status === "skipped") {
      console.log(chalk16.yellow(`   \u25CB skipped \u2014 ${outcome.reason ?? "no reason given"}`));
    } else if (outcome.status === "duplicate") {
      console.log(chalk16.gray(`   \xB7 ${outcome.linearIdentifier ?? "?"} already tracked`));
    } else {
      console.log(
        chalk16.green(
          `   \u2713 ${outcome.linearIdentifier}${outcome.status === "attached" ? ` (attached, ${outcome.matchedBy})` : ""}`
        )
      );
    }
  }
  console.log("");
  console.log(
    chalk16.green(
      `\u2713 ${response.adopted} adopted, ${response.attached} attached, ${response.duplicates} already tracked, ${response.skipped} skipped`
    )
  );
  console.log(
    chalk16.gray(
      "  These are observed, not dispatched: DevPilot is watching them and will not move a ticket."
    )
  );
  console.log("");
});
function describe3(err) {
  return err instanceof Error ? err.message : String(err);
}
var sessionsCommand = new Command14("sessions").description("Agent sessions running on this machine").addCommand(scanCommand).addCommand(adoptCommand);

// src/commands/session-runner/index.ts
import { Command as Command15 } from "commander";
import chalk17 from "chalk";
import { resolve as resolve3 } from "path";

// src/commands/session-runner/server.ts
import { createServer } from "http";
import { randomUUID } from "crypto";
import { existsSync as existsSync13 } from "fs";
import { basename as basename3, isAbsolute, resolve as resolve2 } from "path";

// src/commands/session-runner/claude-runner.ts
import { spawn as spawn2, execFile } from "child_process";
import { promisify } from "util";
import { mkdtempSync, rmSync, writeFileSync as writeFileSync10, existsSync as existsSync11, readFileSync as readFileSync9, mkdirSync as mkdirSync8 } from "fs";
import { tmpdir, homedir as homedir4 } from "os";
import { join as join9 } from "path";

// src/commands/session-runner/stream-events.ts
var MAX_ACTIONS = 200;
var WRITE_TOOLS2 = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var READ_TOOLS = /* @__PURE__ */ new Set(["Read", "Glob", "Grep"]);
function relativize(path, workdir) {
  if (!workdir) return path;
  const root = workdir.endsWith("/") ? workdir : `${workdir}/`;
  if (path.startsWith(root)) return path.slice(root.length);
  const alt = root.startsWith("/private/") ? root.slice("/private".length) : `/private${root}`;
  if (path.startsWith(alt)) return path.slice(alt.length);
  return path;
}
var TelemetryCollector = class {
  constructor(now = Date.now, workdir) {
    this.touched = [];
    this.read = [];
    this.commands = [];
    this.actions = [];
    this.toolCalls = 0;
    this.writeCalls = 0;
    this.costUsd = 0;
    this.costIsEstimate = true;
    /**
     * Counted once per response. The stream repeats a response's usage on every
     * content block it emits, exactly as the transcript does, so adding each
     * event's usage inflated the running estimate by the number of blocks.
     */
    this.meter = initialUsageMeter();
    this.turns = 0;
    this.now = now;
    this.workdir = workdir;
    this.startedAt = now();
    this.lastEventAt = this.startedAt;
  }
  /**
   * Feed one raw line. Malformed lines are ignored rather than thrown:
   * telemetry must never be able to kill the session it is describing.
   */
  ingestLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    this.ingest(event);
  }
  ingest(event) {
    this.lastEventAt = this.now();
    if (event.type === "assistant") {
      const usage = event.message?.usage;
      if (usage && this.costIsEstimate) {
        countUsage(this.meter, event.message?.id, usage, event.message?.model);
        this.costUsd = priceMeter(this.meter);
        this.turns = this.meter.turns;
      }
      for (const block of event.message?.content ?? []) {
        if (block.type === "tool_use" && block.name) {
          this.recordTool(block.name, block.input ?? {});
        } else if (block.type === "text" && block.text?.trim()) {
          this.lastText = block.text.trim().slice(0, 240);
        }
      }
    }
    if (event.type === "result") {
      if (typeof event.total_cost_usd === "number") this.costIsEstimate = false;
      this.costUsd = event.total_cost_usd ?? this.costUsd;
      this.turns = event.num_turns ?? this.turns;
      if (event.usage) {
        const t = this.meter.totals;
        t.input = event.usage.input_tokens ?? t.input;
        t.output = event.usage.output_tokens ?? t.output;
        t.cacheRead = event.usage.cache_read_input_tokens ?? t.cacheRead;
        t.cacheWrite = event.usage.cache_creation_input_tokens ?? t.cacheWrite;
        const hour = event.usage.cache_creation?.ephemeral_1h_input_tokens;
        if (typeof hour === "number") t.cacheWrite1h = Math.min(hour, t.cacheWrite);
      }
      this.reconcileModels(event.modelUsage);
    }
  }
  /**
   * Replace the per-model split with the one in the final result.
   *
   * WHY IT CANNOT BE LEFT AS COUNTED. While a run is in flight the stream
   * reports each response's usage as it BEGINS: the input side is right, and
   * the output count is a placeholder of a few tokens. The real output arrives
   * only in the final result. Measured on a live run: 11 output tokens counted
   * from the stream against 567 in the result.
   *
   * The totals above are corrected from the result, but the per-model buckets
   * were not, so a finished session's tokens no longer added up to its total —
   * and the difference, which is nearly all of the output, was priced as
   * "tokens no model was named for", at the default rate. A Haiku run's output
   * was being priced as Opus: $0.033 reported against Claude's own $0.018.
   *
   * The result names every model and what it used, so the buckets are rebuilt
   * from it, and the totals with them when more than one model ran — the
   * top-level usage can omit a model that only did background work.
   *
   * The one thing the per-model figures do not carry is how a cache write
   * splits by lifetime. That is known for the run as a whole, so it is shared
   * out in proportion to each model's cache writes.
   */
  reconcileModels(modelUsage) {
    const entries = Object.entries(modelUsage ?? {});
    if (entries.length === 0) {
      this.attributeRemainder();
      return;
    }
    const n = (v) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
    const byModel = {};
    const sum = emptyUsage();
    for (const [model, usage] of entries) {
      const bucket = {
        input: n(usage.inputTokens),
        output: n(usage.outputTokens),
        cacheRead: n(usage.cacheReadInputTokens),
        cacheWrite: n(usage.cacheCreationInputTokens),
        cacheWrite1h: 0
      };
      byModel[model.slice(0, 80)] = bucket;
      sum.input += bucket.input;
      sum.output += bucket.output;
      sum.cacheRead += bucket.cacheRead;
      sum.cacheWrite += bucket.cacheWrite;
    }
    const hourShare = sum.cacheWrite > 0 ? Math.min(1, (this.meter.totals.cacheWrite1h ?? 0) / Math.max(1, this.meter.totals.cacheWrite)) : 0;
    for (const bucket of Object.values(byModel)) bucket.cacheWrite1h = bucket.cacheWrite * hourShare;
    sum.cacheWrite1h = sum.cacheWrite * hourShare;
    this.meter.byModel = byModel;
    this.meter.totals = sum;
  }
  /**
   * The same repair for a result that names no models — an older Claude Code.
   *
   * There is no authoritative split to rebuild from, so whatever the corrected
   * totals hold beyond what was counted per model is given to the model that
   * did most of the work, rather than left unattributed and priced at the
   * default. For a run on one model, which is nearly all of them, that is
   * exact.
   */
  attributeRemainder() {
    const model = dominantModel(this.meter);
    const buckets = this.meter.byModel;
    if (!model || !buckets) return;
    const key = Object.keys(buckets).find((k) => k === model || k.replace(/\[[^\]]*\]$/, "") === model);
    if (!key) return;
    const counted = emptyUsage();
    for (const b of Object.values(buckets)) {
      counted.input += b.input;
      counted.output += b.output;
      counted.cacheRead += b.cacheRead;
      counted.cacheWrite += b.cacheWrite;
      counted.cacheWrite1h = (counted.cacheWrite1h ?? 0) + (b.cacheWrite1h ?? 0);
    }
    const t = this.meter.totals;
    const bucket = buckets[key];
    bucket.input += Math.max(0, t.input - counted.input);
    bucket.output += Math.max(0, t.output - counted.output);
    bucket.cacheRead += Math.max(0, t.cacheRead - counted.cacheRead);
    bucket.cacheWrite += Math.max(0, t.cacheWrite - counted.cacheWrite);
    bucket.cacheWrite1h = (bucket.cacheWrite1h ?? 0) + Math.max(0, (t.cacheWrite1h ?? 0) - (counted.cacheWrite1h ?? 0));
  }
  recordTool(tool, input) {
    this.toolCalls++;
    if (WRITE_TOOLS2.has(tool)) this.writeCalls++;
    const raw = typeof input.file_path === "string" ? input.file_path : typeof input.path === "string" ? input.path : void 0;
    const path = raw ? relativize(raw, this.workdir) : void 0;
    if (path) {
      const list = WRITE_TOOLS2.has(tool) ? this.touched : READ_TOOLS.has(tool) ? this.read : null;
      if (list && !list.includes(path)) list.push(path);
    }
    if (tool === "Bash" && typeof input.command === "string") {
      this.commands.push(input.command.slice(0, 200));
    }
    const action = { tool, path, atMs: this.now() - this.startedAt };
    this.lastAction = action;
    this.actions.push(action);
    if (this.actions.length > MAX_ACTIONS) this.actions.shift();
  }
  referencePricing() {
    const reference = priceAtReference(this.meter.totals);
    if (!reference) return {};
    return {
      listCostUsd: priceMeter(this.meter),
      referenceCostUsd: reference.costUsd,
      referenceModel: reference.model
    };
  }
  snapshot() {
    const now = this.now();
    return {
      toolCalls: this.toolCalls,
      writeCalls: this.writeCalls,
      filesTouched: [...this.touched],
      filesRead: [...this.read],
      commands: [...this.commands],
      lastText: this.lastText,
      lastAction: this.lastAction,
      actions: [...this.actions],
      costUsd: this.costUsd,
      costIsEstimate: this.costIsEstimate,
      ...this.referencePricing(),
      tokensIn: this.meter.totals.input,
      tokensOut: this.meter.totals.output,
      tokensCacheRead: this.meter.totals.cacheRead,
      tokensCacheWrite: this.meter.totals.cacheWrite,
      turns: this.turns,
      model: dominantModel(this.meter) ?? void 0,
      elapsedMs: now - this.startedAt,
      idleMs: now - this.lastEventAt
    };
  }
};
function estimateProgress(telemetry, declaredFiles = []) {
  if (declaredFiles.length > 0) {
    const declared = declaredFiles.map(normalize);
    const done = declared.filter(
      (f) => telemetry.filesTouched.some((t) => normalize(t).endsWith(f) || f.endsWith(normalize(t)))
    ).length;
    const ratio = done / declared.length;
    return Math.max(telemetry.toolCalls > 0 ? 10 : 0, Math.min(90, Math.round(ratio * 90)));
  }
  if (telemetry.toolCalls === 0) return 0;
  return Math.min(70, Math.round(70 * (1 - Math.exp(-telemetry.toolCalls / 8))));
}
function normalize(p) {
  return p.replace(/^\.\//, "").replace(/\\/g, "/");
}
function describeActivity(telemetry) {
  const a = telemetry.lastAction;
  if (!a) return "starting up";
  const file = a.path ? a.path.split("/").slice(-1)[0] : void 0;
  switch (a.tool) {
    case "Write":
      return file ? `writing ${file}` : "writing";
    case "Edit":
    case "MultiEdit":
      return file ? `editing ${file}` : "editing";
    case "Read":
      return file ? `reading ${file}` : "reading";
    case "Bash":
      return `running ${(telemetry.commands.at(-1) ?? "").split(/\s+/)[0] || "a command"}`;
    case "Grep":
    case "Glob":
      return "searching";
    default:
      return a.tool.toLowerCase();
  }
}

// src/commands/session-runner/claude-runner.ts
var execFileAsync = promisify(execFile);
var OWNED_SESSION_LIMIT = 5e3;
function recordOwnedSession(sessionId) {
  try {
    const dir = join9(homedir4(), ".devpilot");
    const path = join9(dir, "owned-sessions.json");
    let ids = [];
    if (existsSync11(path)) {
      const parsed = JSON.parse(readFileSync9(path, "utf8"));
      if (Array.isArray(parsed.sessionIds)) {
        ids = parsed.sessionIds.filter((v) => typeof v === "string");
      }
    }
    if (ids.includes(sessionId)) return;
    ids.push(sessionId);
    if (ids.length > OWNED_SESSION_LIMIT) ids = ids.slice(-OWNED_SESSION_LIMIT);
    mkdirSync8(dir, { recursive: true });
    writeFileSync10(path, JSON.stringify({ version: 1, sessionIds: ids }, null, 2), "utf8");
  } catch {
  }
}
async function git(workdir, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: workdir,
    maxBuffer: 32 * 1024 * 1024
  });
  return stdout;
}
async function snapshot(workdir) {
  const state = /* @__PURE__ */ new Map();
  try {
    const out = await git(workdir, ["status", "--porcelain", "-uall"]);
    for (const line of out.split("\n")) {
      if (line.length < 4) continue;
      state.set(line.slice(3).trim(), line.slice(0, 2));
    }
  } catch {
  }
  return state;
}
async function headSha(workdir) {
  try {
    return (await git(workdir, ["rev-parse", "HEAD"])).trim();
  } catch {
    return void 0;
  }
}
function classify(before, after) {
  const filesModified = [];
  const filesCreated = [];
  const filesDeleted = [];
  for (const [path, code] of after) {
    if (before.get(path) === code) continue;
    if (code.includes("?")) filesCreated.push(path);
    else if (code.includes("D")) filesDeleted.push(path);
    else if (code.includes("A")) filesCreated.push(path);
    else filesModified.push(path);
  }
  return { filesModified, filesCreated, filesDeleted };
}
function parseEnvelope(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
  }
  const start = trimmed.lastIndexOf("\n{");
  if (start !== -1) {
    try {
      return JSON.parse(trimmed.slice(start + 1));
    } catch {
    }
  }
  return null;
}
function writeSessionMcpConfig(sessionLink2) {
  const dir = mkdtempSync(join9(tmpdir(), "devpilot-mcp-"));
  const file = join9(dir, "mcp.json");
  writeFileSync10(
    file,
    JSON.stringify(
      {
        mcpServers: {
          "devpilot-session": {
            command: "npx",
            args: ["-y", "@devpilot.sh/mcp-session"],
            env: { DEVPILOT_SESSION_LINK: sessionLink2 }
          }
        }
      },
      null,
      2
    ),
    { mode: 384 }
  );
  return { dir, file };
}
function sessionPreamble() {
  return [
    "# Shared session",
    "",
    "You are working inside a DevPilot shared session. Your collaborators can",
    "watch this session and join it while you work.",
    "",
    "1. Call `devpilot_session_join` FIRST, with no `url` argument \u2014 the runner",
    "   has already supplied the link out of band.",
    "2. Post a short plan before you change anything.",
    "3. Post a summary of what you did and why when you finish.",
    "",
    "Never print the join link or any key material into the transcript.",
    "",
    "---",
    ""
  ].join("\n");
}
async function runClaudeSession(options) {
  const { workdir, prompt: prompt2, sessionLink: sessionLink2, model, claudePath, permissionMode, timeoutMs, resumeSessionId, harness, onLog, onSpawn } = options;
  const before = await snapshot(workdir);
  const startedAt = Date.now();
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    permissionMode
  ];
  if (model) args.push("--model", model);
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  let mcpDir;
  let effectivePrompt = prompt2;
  if (sessionLink2) {
    const cfg = writeSessionMcpConfig(sessionLink2);
    mcpDir = cfg.dir;
    args.push("--mcp-config", cfg.file, "--strict-mcp-config");
    effectivePrompt = sessionPreamble() + prompt2;
  }
  const harnessBuild = harness?.build({ hasMcpConfig: Boolean(sessionLink2) });
  if (harnessBuild) args.push(...harnessBuild.args);
  const outcome = await new Promise((resolve4) => {
    const child = spawn2(claudePath, args, {
      cwd: workdir,
      // The prompt goes in on stdin, not argv. A composed prompt carries
      // newlines, backticks and quotes, and is easily tens of kilobytes — well
      // past ARG_MAX on a long file scope.
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let pending = "";
    const collector = new TelemetryCollector(Date.now, workdir);
    let timedOut = false;
    let killed = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5e3).unref();
    }, timeoutMs);
    onSpawn?.(() => {
      killed = true;
      child.kill("SIGTERM");
    });
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) collector.ingestLine(line);
      if (lines.length > 0) {
        options.onTelemetry?.({ ...collector.snapshot(), harness: harness?.stamp });
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onLog?.(text.trimEnd());
    });
    child.on("error", (error2) => {
      clearTimeout(timer);
      resolve4({ code: null, stdout, stderr: `${stderr}
${error2.message}`, timedOut, killed });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve4({ code, stdout, stderr, timedOut, killed });
    });
    child.stdin.write(effectivePrompt);
    child.stdin.end();
  }).finally(() => {
    if (mcpDir) rmSync(mcpDir, { recursive: true, force: true });
    if (harnessBuild?.cleanupDir) rmSync(harnessBuild.cleanupDir, { recursive: true, force: true });
  });
  const after = await snapshot(workdir);
  const files = classify(before, after);
  const envelope = parseEnvelope(outcome.stdout);
  const usage = envelope?.usage ?? {};
  const tokensUsed = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const durationMs = envelope?.duration_ms ?? Date.now() - startedAt;
  if (envelope?.session_id) recordOwnedSession(envelope.session_id);
  const processOk = outcome.code === 0 && !outcome.timedOut && !outcome.killed;
  const envelopeOk = envelope ? envelope.is_error !== true : false;
  const success = processOk && envelopeOk;
  let error;
  if (outcome.timedOut) error = `Session exceeded ${Math.round(timeoutMs / 1e3)}s timeout`;
  else if (outcome.killed) error = "Session stopped by operator";
  else if (!envelope) error = `No JSON result from claude. stderr: ${outcome.stderr.slice(-2e3)}`;
  else if (envelope.is_error) error = envelope.result ?? `claude reported ${envelope.subtype}`;
  else if (outcome.code !== 0) error = `claude exited ${outcome.code}. stderr: ${outcome.stderr.slice(-2e3)}`;
  return {
    success,
    summary: envelope?.result?.trim() || (success ? "Session completed." : error || "Session failed."),
    error,
    tokensUsed,
    costUsd: envelope?.total_cost_usd ?? 0,
    durationMinutes: Math.round(durationMs / 6e4 * 100) / 100,
    ...files,
    commitSha: await headSha(workdir)
  };
}

// src/commands/session-runner/callbacks.ts
var BACKOFF_MS = [1e3, 2e3, 4e3, 8e3, 16e3, 32e3, 6e4, 12e4, 24e4, 24e4];
function sleep(ms) {
  return new Promise((resolve4) => setTimeout(resolve4, ms));
}
async function post(url, body, token, log) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-DevPilot-Callback-Token"] = token;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3e4)
      });
      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        log(`callback ${url} rejected: ${res.status} ${await res.text().catch(() => "")}`);
        return false;
      }
      log(`callback ${url} failed: ${res.status} (attempt ${attempt + 1})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`callback ${url} error: ${message} (attempt ${attempt + 1})`);
    }
    if (attempt < BACKOFF_MS.length) await sleep(BACKOFF_MS[attempt]);
  }
  log(`callback ${url} GAVE UP after ${BACKOFF_MS.length + 1} attempts`);
  return false;
}
function sendStatus(callbackUrl, update, token, log) {
  return post(`${callbackUrl.replace(/\/$/, "")}/status`, update, token, log);
}
function sendCompletion(callbackUrl, report, token, log) {
  return post(`${callbackUrl.replace(/\/$/, "")}/complete`, report, token, log);
}

// src/commands/session-runner/isolation.ts
import { execFile as execFile2 } from "child_process";
import { createHash } from "crypto";
import { existsSync as existsSync12, mkdirSync as mkdirSync9, realpathSync, rmSync as rmSync2 } from "fs";
import { homedir as homedir5 } from "os";
import { basename as basename2, dirname as dirname6, join as join10 } from "path";
import { promisify as promisify2 } from "util";
var execFileAsync2 = promisify2(execFile2);
var IsolationError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "IsolationError";
  }
};
var GIT_TIMEOUT_MS = 12e4;
var DEFAULT_SETUP_TIMEOUT_MS = 10 * 6e4;
var FALLBACK_IDENTITY = ["-c", "user.name=DevPilot", "-c", "user.email=devpilot@localhost"];
async function git2(cwd, args) {
  const { stdout } = await execFileAsync2("git", args, {
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    timeout: GIT_TIMEOUT_MS,
    // A hook or credential helper that prompts would hang a process with no
    // terminal. Nothing here should ever need to ask.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
  });
  return stdout;
}
async function gitOk(cwd, args) {
  try {
    await git2(cwd, args);
    return true;
  } catch {
    return false;
  }
}
function gitMessage(error) {
  const e = error;
  return (e.stderr || e.message || String(error)).trim().slice(-1500);
}
function refSafe(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80).replace(/[-.]+$/g, "");
  if (!cleaned || cleaned.toLowerCase().endsWith(".lock")) {
    throw new IsolationError(`'${value}' cannot be used in a branch name`, "INVALID_NAME");
  }
  return cleaned;
}
function runBranchName(runId) {
  return `devpilot/${refSafe(runId)}/run`;
}
function taskBranchName(runId, taskCode) {
  return `devpilot/${refSafe(runId)}/task-${refSafe(taskCode)}`;
}
function worktreeRoot(config) {
  return config.worktreeRoot ?? join10(homedir5(), ".devpilot", "worktrees");
}
function repoKey(repoDir) {
  let real = repoDir;
  try {
    real = realpathSync(repoDir);
  } catch {
  }
  const hash = createHash("sha1").update(real).digest("hex").slice(0, 8);
  return `${refSafe(basename2(real) || "repo")}-${hash}`;
}
var repoLocks = /* @__PURE__ */ new Map();
function withRepoLock(repoDir, fn) {
  const previous = repoLocks.get(repoDir) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  repoLocks.set(
    repoDir,
    next.catch(() => void 0)
  );
  return next;
}
async function revParse(cwd, ref) {
  try {
    return (await git2(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).trim() || null;
  } catch {
    return null;
  }
}
async function identityArgs(cwd) {
  const hasName = await gitOk(cwd, ["config", "user.name"]);
  const hasEmail = await gitOk(cwd, ["config", "user.email"]);
  return hasName && hasEmail ? [] : FALLBACK_IDENTITY;
}
async function removeWorktree(repoDir, dir) {
  await git2(repoDir, ["worktree", "remove", "--force", dir]).catch(() => void 0);
  rmSync2(dir, { recursive: true, force: true });
  await git2(repoDir, ["worktree", "prune"]).catch(() => void 0);
}
async function checkIsolatable(repoDir) {
  if (!await gitOk(repoDir, ["rev-parse", "--git-dir"])) {
    throw new IsolationError(
      `${repoDir} is not a git repository, so a task cannot be given its own branch there.`,
      "NOT_A_REPOSITORY"
    );
  }
  if (!await revParse(repoDir, "HEAD")) {
    throw new IsolationError(
      `${repoDir} has no commits yet. A task branch needs a commit to start from.`,
      "NO_COMMITS"
    );
  }
}
async function prepareTaskWorkspace(repoDir, request, config = {}) {
  const runBranch = runBranchName(request.runId);
  const branch = taskBranchName(request.runId, request.taskCode);
  const dir = join10(
    worktreeRoot(config),
    repoKey(repoDir),
    refSafe(request.runId),
    `task-${refSafe(request.taskCode)}`
  );
  const workspace = await withRepoLock(repoDir, async () => {
    await checkIsolatable(repoDir);
    try {
      if (!await revParse(repoDir, `refs/heads/${runBranch}`)) {
        await git2(repoDir, ["branch", runBranch, "HEAD"]);
      }
      const baseSha = await revParse(repoDir, `refs/heads/${runBranch}`);
      if (existsSync12(dir)) await removeWorktree(repoDir, dir);
      const previous = await revParse(repoDir, `refs/heads/${branch}`);
      if (previous) {
        let kept = `${branch}-attempt-${previous.slice(0, 8)}`;
        for (let n = 2; await revParse(repoDir, `refs/heads/${kept}`); n++) {
          kept = `${branch}-attempt-${previous.slice(0, 8)}-${n}`;
        }
        await git2(repoDir, ["branch", "-m", branch, kept]);
      }
      mkdirSync9(dirname6(dir), { recursive: true });
      await git2(repoDir, ["worktree", "add", "-b", branch, dir, runBranch]);
      return { repoDir, dir, branch, runBranch, baseSha, taskCode: request.taskCode };
    } catch (error) {
      if (error instanceof IsolationError) throw error;
      throw new IsolationError(
        `Could not create a working tree for task ${request.taskCode}: ${gitMessage(error)}`,
        "GIT_FAILED"
      );
    }
  });
  if (config.setupCommand) {
    try {
      await execFileAsync2("/bin/sh", ["-c", config.setupCommand], {
        cwd: workspace.dir,
        timeout: config.setupTimeoutMs ?? DEFAULT_SETUP_TIMEOUT_MS,
        maxBuffer: 32 * 1024 * 1024
      });
    } catch (error) {
      await withRepoLock(repoDir, async () => {
        await removeWorktree(repoDir, workspace.dir);
        await git2(repoDir, ["branch", "-D", workspace.branch]).catch(() => void 0);
      });
      throw new IsolationError(
        `The worktree setup command failed for task ${request.taskCode}: ${gitMessage(error)}`,
        "SETUP_FAILED"
      );
    }
  }
  return workspace;
}
async function finishTaskWorkspace(workspace, options) {
  const { repoDir, dir, branch, baseSha } = workspace;
  return withRepoLock(repoDir, async () => {
    let commitSha;
    try {
      await git2(dir, ["add", "-A"]);
      if ((await git2(dir, ["status", "--porcelain"])).trim()) {
        await git2(dir, [
          ...await identityArgs(dir),
          "commit",
          "--no-verify",
          "--no-gpg-sign",
          "-m",
          options.message
        ]);
      }
      commitSha = await revParse(dir, "HEAD");
      if (await revParse(repoDir, `refs/heads/${branch}`) !== commitSha) {
        await git2(repoDir, ["update-ref", `refs/heads/${branch}`, commitSha]);
      }
    } catch (error) {
      throw new IsolationError(
        `Could not commit task ${workspace.taskCode}'s work. It is still in ${dir}: ${gitMessage(error)}`,
        "GIT_FAILED"
      );
    }
    try {
      const filesModified = [];
      const filesCreated = [];
      const filesDeleted = [];
      const diff = await git2(repoDir, [
        "diff",
        "--name-status",
        "--no-renames",
        "-z",
        baseSha,
        commitSha
      ]);
      const fields = diff.split("\0");
      for (let i = 0; i + 1 < fields.length; i += 2) {
        const status = fields[i];
        const path = fields[i + 1];
        if (!path) continue;
        if (status.startsWith("A")) filesCreated.push(path);
        else if (status.startsWith("D")) filesDeleted.push(path);
        else filesModified.push(path);
      }
      return {
        commitSha,
        changed: commitSha !== baseSha,
        filesModified,
        filesCreated,
        filesDeleted
      };
    } catch (error) {
      throw new IsolationError(
        `Task ${workspace.taskCode}'s work is committed on ${branch}, but its changes could not be read back: ${gitMessage(error)}`,
        "GIT_FAILED"
      );
    } finally {
      if (await gitOk(repoDir, ["worktree", "remove", dir])) {
        rmSync2(dir, { recursive: true, force: true });
      }
    }
  });
}
async function checkedOutAt(repoDir, branch) {
  const out = await git2(repoDir, ["worktree", "list", "--porcelain"]);
  let current = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("worktree ")) current = line.slice("worktree ".length);
    else if (line === `branch refs/heads/${branch}`) return current;
  }
  return null;
}
async function integrateRun(repoDir, request, config = {}) {
  const runBranch = runBranchName(request.runId);
  const dir = join10(worktreeRoot(config), repoKey(repoDir), refSafe(request.runId), "_integrate");
  return withRepoLock(repoDir, async () => {
    await checkIsolatable(repoDir);
    const startSha = await revParse(repoDir, `refs/heads/${runBranch}`);
    if (!startSha) {
      throw new IsolationError(
        `There is no run branch ${runBranch} in ${repoDir}. No task of this run was isolated here.`,
        "RUN_BRANCH_MISSING"
      );
    }
    const heldAt = await checkedOutAt(repoDir, runBranch);
    if (heldAt) {
      throw new IsolationError(
        `${runBranch} is checked out in ${heldAt}. Switch that checkout to another branch so the wave's work can be merged into it.`,
        "RUN_BRANCH_CHECKED_OUT"
      );
    }
    const result = {
      runBranch,
      headSha: startSha,
      merged: [],
      conflicts: [],
      missing: []
    };
    if (existsSync12(dir)) await removeWorktree(repoDir, dir);
    mkdirSync9(dirname6(dir), { recursive: true });
    try {
      await git2(repoDir, ["worktree", "add", "--detach", dir, runBranch]);
      const identity = await identityArgs(dir);
      for (const taskCode of request.taskCodes) {
        const branch = taskBranchName(request.runId, taskCode);
        const commitSha = await revParse(repoDir, `refs/heads/${branch}`);
        if (!commitSha) {
          result.missing.push(taskCode);
          continue;
        }
        if (await gitOk(dir, ["merge-base", "--is-ancestor", commitSha, "HEAD"])) {
          result.merged.push({ taskCode, branch, commitSha, alreadyMerged: true });
          continue;
        }
        try {
          await git2(dir, [
            ...identity,
            "merge",
            "--no-ff",
            "--no-verify",
            "--no-gpg-sign",
            "-m",
            `devpilot: merge task ${taskCode}`,
            commitSha
          ]);
          result.merged.push({ taskCode, branch, commitSha, alreadyMerged: false });
        } catch (error) {
          const unmerged = await git2(dir, ["diff", "--name-only", "--diff-filter=U", "-z"]).catch(
            () => ""
          );
          const files = unmerged.split("\0").filter(Boolean);
          await git2(dir, ["merge", "--abort"]).catch(() => void 0);
          await git2(dir, ["reset", "--hard", "--quiet"]).catch(() => void 0);
          if (files.length === 0) {
            throw new IsolationError(
              `Merging task ${taskCode} into ${runBranch} failed: ${gitMessage(error)}`,
              "GIT_FAILED"
            );
          }
          result.conflicts.push({ taskCode, branch, files });
        }
      }
      const headSha2 = await revParse(dir, "HEAD");
      if (headSha2 !== startSha) {
        try {
          await git2(repoDir, ["update-ref", `refs/heads/${runBranch}`, headSha2, startSha]);
        } catch (error) {
          throw new IsolationError(
            `${runBranch} changed while the wave was being merged; nothing was written. ${gitMessage(error)}`,
            "RUN_BRANCH_MOVED"
          );
        }
      }
      result.headSha = headSha2;
      return result;
    } catch (error) {
      if (error instanceof IsolationError) throw error;
      throw new IsolationError(
        `Could not merge into ${runBranch}: ${gitMessage(error)}`,
        "GIT_FAILED"
      );
    } finally {
      await removeWorktree(repoDir, dir);
    }
  });
}
function workspacePreamble(workspace, config = {}) {
  return [
    "# Your workspace",
    "",
    `You are in a git worktree made for this task, on the branch \`${workspace.branch}\`.`,
    "Other tasks in this run each have their own. Nothing you do here reaches theirs,",
    "and nothing they do reaches you, until DevPilot merges the wave.",
    "",
    "- Stay on this branch. Do not switch branches, rebase, push, or open a pull request.",
    "- You do not need to commit. Whatever is in this directory when you finish is",
    "  committed to the branch for you.",
    config.setupCommand ? "- This is a fresh checkout that the operator's setup step has prepared. If something" : "- This is a fresh checkout: it has the tracked files only. Installed dependencies,",
    config.setupCommand ? "  a command needs is still missing, say so in your final message rather than" : "  local env files and build output from the main checkout are not here. If a command",
    config.setupCommand ? "  working around it." : "  fails because of that, say so in your final message rather than working around it.",
    "",
    "---",
    ""
  ].join("\n");
}

// src/commands/session-runner/server.ts
var VERSION2 = "1.1.0";
var CAPABILITIES = ["isolation"];
function commitSubject(taskCode, title) {
  const line = (title ?? "").replace(/\s+/g, " ").trim();
  const subject = line ? `devpilot(${taskCode}): ${line}` : `devpilot: task ${taskCode}`;
  return subject.length > 72 ? `${subject.slice(0, 71)}\u2026` : subject;
}
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload)
  });
  res.end(payload);
}
async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
var SessionRunner = class {
  constructor(config) {
    this.config = config;
    /** Keyed by runner-side externalSessionId. */
    this.sessions = /* @__PURE__ */ new Map();
    /** DevPilot sessionId -> externalSessionId. The §7.1 idempotency index. */
    this.byDevpilotId = /* @__PURE__ */ new Map();
    this.server = null;
  }
  get activeCount() {
    let n = 0;
    for (const session of this.sessions.values()) {
      if (session.status === "queued" || session.status === "running") n++;
    }
    return n;
  }
  /**
   * Resolve `owner/name` to a checkout on this machine.
   *
   * Explicit `--repo` mappings win; otherwise the repo's basename is looked up
   * under `--workspace`. A repo that resolves nowhere is rejected at create
   * time with a message naming the path it tried, because the alternative —
   * spawning the agent in the wrong directory — produces a session that edits
   * unrelated files and reports success.
   */
  resolveWorkdir(repo) {
    const mapped = this.config.repoMap.get(repo);
    if (mapped) {
      return existsSync13(mapped) ? { workdir: mapped } : { error: `Mapped path for '${repo}' does not exist: ${mapped}` };
    }
    const candidate = isAbsolute(repo) ? repo : resolve2(this.config.workspace, basename3(repo));
    if (!existsSync13(candidate)) {
      return {
        error: `No checkout for '${repo}'. Tried ${candidate}. Pass --repo ${repo}=/path/to/checkout, or set --workspace.`
      };
    }
    return { workdir: candidate };
  }
  authorized(req) {
    if (!this.config.apiKey) return true;
    return req.headers.authorization === `Bearer ${this.config.apiKey}`;
  }
  /** Fire-and-forget status callback; delivery failures are logged, not thrown. */
  reportStatus(session, callbackUrl, callbackToken, patch) {
    const update = {
      sessionId: session.devpilotSessionId,
      status: session.status,
      progressPercent: session.progressPercent,
      filesModified: session.filesModified,
      tokensUsed: session.tokensUsed,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...patch
    };
    void sendStatus(callbackUrl, update, callbackToken, this.config.log);
  }
  /**
   * Run a session to completion and report. Never rejects: a throw here would be
   * an unhandled rejection in a detached promise, and — worse — would leave the
   * wave task stuck on `dispatched` with no completion callback ever sent.
   */
  async execute(session, request) {
    const { callbackUrl, callbackToken } = request;
    try {
      session.status = "running";
      let workspace;
      if (request.isolation) {
        workspace = await prepareTaskWorkspace(session.workdir, request.isolation, this.config.isolation);
        session.branch = workspace.branch;
        this.config.log(
          `[${session.externalSessionId}] task ${request.isolation.taskCode} on ${workspace.branch} (from ${workspace.baseSha.slice(0, 8)})`
        );
      }
      const rundir = workspace?.dir ?? session.workdir;
      session.progressPercent = 5;
      session.currentStep = "session started";
      this.reportStatus(session, callbackUrl, callbackToken, {
        currentStep: "session started",
        message: workspace ? `Claude Code session running on ${workspace.branch}` : `Claude Code session running in ${session.workdir}`
      });
      const heartbeat = setInterval(() => {
        if (session.terminal) return;
        this.reportStatus(session, callbackUrl, callbackToken, {
          currentStep: session.currentStep ?? "working",
          message: session.message ?? "Session in progress"
        });
      }, 9e4);
      heartbeat.unref();
      let lastReportAt = 0;
      const REPORT_INTERVAL_MS = 3e3;
      const outcome = await runClaudeSession({
        workdir: rundir,
        prompt: workspace ? workspacePreamble(workspace, this.config.isolation) + request.prompt : request.prompt,
        sessionLink: request.sessionLink,
        model: request.model,
        claudePath: this.config.claudePath,
        /**
         * Permission mode is the OPERATOR's, never the caller's — TRD 23 S-04.
         *
         * A request that could raise it would let someone in the cockpit
         * escalate what an agent may do on another person's laptop. It stays
         * with whoever started the bridge.
         */
        permissionMode: this.config.permissionMode,
        resumeSessionId: request.resumeSessionId,
        timeoutMs: this.config.timeoutMs,
        harness: this.config.harness,
        onLog: (line) => this.config.log(`[${session.externalSessionId}] ${line}`),
        onSpawn: (kill) => {
          session.kill = kill;
        },
        onTelemetry: (telemetry) => {
          session.telemetry = telemetry;
          session.currentStep = describeActivity(telemetry);
          session.progressPercent = estimateProgress(telemetry, request.filePaths ?? []);
          const now = Date.now();
          if (now - lastReportAt < REPORT_INTERVAL_MS) return;
          lastReportAt = now;
          this.reportStatus(session, callbackUrl, callbackToken, {
            currentStep: session.currentStep,
            message: telemetry.lastText ?? `${telemetry.toolCalls} tool calls`,
            filesModified: telemetry.filesTouched,
            tokensUsed: telemetry.tokensIn + telemetry.tokensOut,
            telemetry
          });
        }
      });
      clearInterval(heartbeat);
      if (workspace && request.isolation) {
        try {
          const result = await finishTaskWorkspace(workspace, {
            message: `${commitSubject(request.isolation.taskCode, request.isolation.title)}

Run: ${request.isolation.runId}
Session: ${session.devpilotSessionId}
` + (outcome.success ? "" : "The agent did not finish this task; this is what it left.\n")
          });
          outcome.filesModified = result.filesModified;
          outcome.filesCreated = result.filesCreated;
          outcome.filesDeleted = result.filesDeleted;
          outcome.commitSha = result.commitSha;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          outcome.success = false;
          outcome.error = outcome.error ? `${outcome.error}
${message}` : message;
          outcome.filesModified = [];
          outcome.filesCreated = [];
          outcome.filesDeleted = [];
          outcome.commitSha = void 0;
        }
      }
      session.terminal = true;
      session.status = outcome.success ? "complete" : "error";
      session.progressPercent = outcome.success ? 100 : session.progressPercent;
      session.currentStep = outcome.success ? "complete" : "failed";
      session.filesModified = outcome.filesModified;
      session.tokensUsed = outcome.tokensUsed;
      session.message = outcome.summary;
      this.config.log(
        `[${session.externalSessionId}] ${outcome.success ? "complete" : "FAILED"} \u2014 ${outcome.filesModified.length} modified, ${outcome.filesCreated.length} created, $${outcome.costUsd.toFixed(4)}, ${outcome.durationMinutes}m`
      );
      await sendCompletion(
        callbackUrl,
        {
          sessionId: session.devpilotSessionId,
          success: outcome.success,
          commitSha: outcome.commitSha,
          branch: workspace?.branch,
          baseSha: workspace?.baseSha,
          filesModified: outcome.filesModified,
          filesCreated: outcome.filesCreated,
          filesDeleted: outcome.filesDeleted,
          summary: outcome.summary,
          tokensUsed: outcome.tokensUsed,
          costUsd: outcome.costUsd,
          durationMinutes: outcome.durationMinutes,
          error: outcome.error,
          telemetry: session.telemetry,
          metadata: request.metadata
        },
        callbackToken,
        this.config.log
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.config.log(`[${session.externalSessionId}] runner error: ${message}`);
      session.terminal = true;
      session.status = "error";
      await sendCompletion(
        callbackUrl,
        {
          sessionId: session.devpilotSessionId,
          success: false,
          filesModified: [],
          filesCreated: [],
          filesDeleted: [],
          summary: "The session runner failed before the agent could report.",
          tokensUsed: 0,
          costUsd: 0,
          durationMinutes: (Date.now() - session.startedAt) / 6e4,
          error: message,
          metadata: request.metadata
        },
        callbackToken,
        this.config.log
      ).catch(() => void 0);
    }
  }
  async handleCreate(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : "invalid JSON";
      return json(res, 400, { error: "INVALID_PAYLOAD", message });
    }
    if (!body?.sessionId || !body?.repo || !body?.prompt || !body?.callbackUrl) {
      return json(res, 400, {
        error: "INVALID_PAYLOAD",
        message: "sessionId, repo, prompt and callbackUrl are required"
      });
    }
    const existing = this.byDevpilotId.get(body.sessionId);
    if (existing) {
      const session2 = this.sessions.get(existing);
      return json(res, 200, {
        externalSessionId: existing,
        status: session2?.status ?? "running",
        createdAt: session2?.createdAt,
        idempotent: true
      });
    }
    if (this.activeCount >= this.config.maxConcurrent) {
      return json(res, 429, { error: "CAPACITY", retryAfterSeconds: 60 });
    }
    const { workdir, error } = this.resolveWorkdir(body.repo);
    if (!workdir) {
      this.config.log(`create rejected: ${error}`);
      return json(res, 400, { error: "REPO_NOT_FOUND", message: error });
    }
    if (body.isolation !== void 0) {
      const refusal = await this.isolationRefusal(body, workdir);
      if (refusal) {
        this.config.log(`create rejected: ${refusal}`);
        return json(res, 400, { error: "ISOLATION_UNAVAILABLE", message: refusal });
      }
    }
    const externalSessionId = `run_${randomUUID()}`;
    const session = {
      externalSessionId,
      devpilotSessionId: body.sessionId,
      repo: body.repo,
      workdir,
      status: "queued",
      progressPercent: 0,
      filesModified: [],
      tokensUsed: 0,
      startedAt: Date.now(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      terminal: false
    };
    this.sessions.set(externalSessionId, session);
    this.byDevpilotId.set(body.sessionId, externalSessionId);
    this.config.log(
      `dispatch ${body.sessionId} -> ${externalSessionId} (${body.repo} @ ${workdir}, model=${body.model ?? "default"}${body.sessionLink ? ", shared-session" : ""})`
    );
    json(res, 201, { externalSessionId, status: "queued", createdAt: session.createdAt });
    void this.execute(session, body);
  }
  /** Why an isolation request cannot be honoured, or null if it can. */
  async isolationRefusal(body, workdir) {
    const isolation = body.isolation;
    if (!isolation || typeof isolation.runId !== "string" || typeof isolation.taskCode !== "string" || !isolation.runId || !isolation.taskCode) {
      return "isolation needs a runId and a taskCode";
    }
    if (body.resumeSessionId) {
      return "a resumed session runs where its conversation lives and cannot be isolated";
    }
    try {
      refSafe(isolation.runId);
      refSafe(isolation.taskCode);
      await checkIsolatable(workdir);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    return null;
  }
  /**
   * `POST /v1/integrate` — merge a wave's task branches into the run branch.
   *
   * Answers when the merge is done rather than calling back: it is a few ref
   * updates, and the dispatcher needs the result (the new head, and which
   * tasks conflicted) before it can decide what the next wave starts from.
   */
  async handleIntegrate(req, res) {
    let body;
    try {
      body = await readBody(req);
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : "invalid JSON";
      return json(res, 400, { error: "INVALID_PAYLOAD", message });
    }
    if (!body?.repo || typeof body.runId !== "string" || !body.runId || !Array.isArray(body.taskCodes) || body.taskCodes.some((code) => typeof code !== "string" || !code)) {
      return json(res, 400, {
        error: "INVALID_PAYLOAD",
        message: "repo, runId and taskCodes are required"
      });
    }
    const { workdir, error } = this.resolveWorkdir(body.repo);
    if (!workdir) return json(res, 400, { error: "REPO_NOT_FOUND", message: error });
    try {
      const result = await integrateRun(
        workdir,
        { runId: body.runId, taskCodes: body.taskCodes },
        this.config.isolation
      );
      this.config.log(
        `integrate ${result.runBranch}: ${result.merged.length} merged, ${result.conflicts.length} conflicted, ${result.missing.length} missing -> ${result.headSha.slice(0, 8)}`
      );
      return json(res, 200, result);
    } catch (error2) {
      const message = error2 instanceof Error ? error2.message : String(error2);
      this.config.log(`integrate failed: ${message}`);
      if (!(error2 instanceof IsolationError)) return json(res, 500, { error: "INTERNAL", message });
      const status = error2.code === "RUN_BRANCH_MISSING" ? 404 : error2.code === "RUN_BRANCH_CHECKED_OUT" || error2.code === "RUN_BRANCH_MOVED" ? 409 : error2.code === "GIT_FAILED" ? 500 : 400;
      return json(res, status, { error: error2.code, message });
    }
  }
  handleGet(res, externalSessionId) {
    const session = this.sessions.get(externalSessionId);
    if (!session) return json(res, 404, { error: "NOT_FOUND" });
    json(res, 200, {
      status: session.status,
      progressPercent: session.progressPercent,
      currentStep: session.currentStep,
      message: session.message,
      filesModified: session.filesModified,
      tokensUsed: session.tokensUsed,
      branch: session.branch
    });
  }
  async handleMessages(req, res, externalSessionId) {
    const session = this.sessions.get(externalSessionId);
    if (!session) return json(res, 404, { error: "NOT_FOUND" });
    if (session.terminal) return json(res, 410, { error: "TERMINAL" });
    await readBody(req).catch(() => ({}));
    json(res, 501, {
      error: "NOT_IMPLEMENTED",
      message: "Mid-session steering requires streaming input mode; not supported by this runner."
    });
  }
  handleStop(res, externalSessionId) {
    const session = this.sessions.get(externalSessionId);
    if (!session) return json(res, 404, { error: "NOT_FOUND" });
    if (session.terminal) return json(res, 410, { success: true, message: "already stopped" });
    session.kill?.();
    this.config.log(`stop requested for ${externalSessionId}`);
    json(res, 202, { success: true, message: "stopping" });
  }
  async route(req, res) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;
    if (path === "/v1/health" && req.method === "GET") {
      return json(res, 200, {
        status: "healthy",
        version: VERSION2,
        activeSessions: this.activeCount,
        // How many agents this runner will run at once. It is the fleet's
        // capacity as a fact rather than a setting somebody typed into the
        // cockpit, and the score's utilization dimension is a ratio against it.
        maxConcurrent: this.config.maxConcurrent,
        capabilities: CAPABILITIES
      });
    }
    if (!this.authorized(req)) return json(res, 401, { error: "UNAUTHORIZED" });
    if (path === "/v1/sessions" && req.method === "POST") {
      return this.handleCreate(req, res);
    }
    if (path === "/v1/integrate" && req.method === "POST") {
      return this.handleIntegrate(req, res);
    }
    const match = path.match(/^\/v1\/sessions\/([^/]+)(\/messages|\/stop)?$/);
    if (match) {
      const [, id, suffix] = match;
      if (!suffix && req.method === "GET") return this.handleGet(res, id);
      if (suffix === "/messages" && req.method === "POST") return this.handleMessages(req, res, id);
      if (suffix === "/stop" && req.method === "POST") return this.handleStop(res, id);
      return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
    }
    json(res, 404, { error: "NOT_FOUND" });
  }
  start() {
    return new Promise((resolvePromise, reject) => {
      this.server = createServer((req, res) => {
        this.route(req, res).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          this.config.log(`unhandled: ${message}`);
          if (!res.headersSent) json(res, 500, { error: "INTERNAL", message });
        });
      });
      this.server.on("error", reject);
      this.server.listen(this.config.port, this.config.host, () => resolvePromise());
    });
  }
  async stop() {
    for (const session of this.sessions.values()) {
      if (!session.terminal) session.kill?.();
    }
    await new Promise((resolvePromise) => {
      if (!this.server) return resolvePromise();
      this.server.close(() => resolvePromise());
    });
  }
};

// src/commands/session-runner/harness.ts
import { mkdtempSync as mkdtempSync2, writeFileSync as writeFileSync11 } from "fs";
import { tmpdir as tmpdir2 } from "os";
import { join as join11 } from "path";
var HARNESS_VERSION = 1;
var TECHNIQUES = [
  {
    id: "strict-mcp",
    summary: "Give the agent no MCP servers except the ones the dispatch supplies",
    bucket: "fixed-overhead",
    watch: "tool-not-found errors, or a task that needed a project MCP server failing",
    args: (ctx) => {
      if (ctx.hasMcpConfig) return [];
      const file = join11(ctx.scratchDir(), "mcp-none.json");
      writeFileSync11(file, JSON.stringify({ mcpServers: {} }), { mode: 384 });
      return ["--mcp-config", file, "--strict-mcp-config"];
    }
  },
  {
    id: "no-skills",
    summary: "Do not load skills into a worker \u2014 it has one scoped task",
    bucket: "fixed-overhead",
    watch: "a task failing because it relied on a project skill",
    args: () => ["--disable-slash-commands"]
  },
  {
    id: "stable-prefix",
    summary: "Keep per-directory details out of the system prompt so worktrees share one cache entry",
    bucket: "cache-writes",
    watch: "no fall in first-turn cache writes across parallel tasks, or changed behaviour",
    args: () => ["--exclude-dynamic-system-prompt-sections"]
  },
  {
    id: "compact-200k",
    summary: "Summarise history once the context passes 200k tokens, instead of near the window limit",
    bucket: "context-size",
    watch: "files being read again after a compaction, more turns, lower task success",
    args: () => ["--autocompact", "200000"]
  },
  {
    id: "budget-cap",
    summary: "Stop a run that has spent more than DEVPILOT_HARNESS_MAX_BUDGET_USD at API rates",
    bucket: "tail-cost",
    watch: "legitimate long tasks being cut off before they finish",
    args: () => {
      const cap = Number(process.env.DEVPILOT_HARNESS_MAX_BUDGET_USD);
      return Number.isFinite(cap) && cap > 0 ? ["--max-budget-usd", String(cap)] : [];
    }
  }
];
var PROFILES = {
  baseline: [],
  lean: ["strict-mcp", "no-skills", "stable-prefix"]
};
function resolveHarness(spec) {
  const parts = (spec?.trim() || "baseline").split("+").map((p) => p.trim()).filter(Boolean);
  const [profile, ...extras] = parts;
  const base = PROFILES[profile];
  if (!base) {
    throw new Error(
      `Unknown harness profile "${profile}". Profiles: ${Object.keys(PROFILES).join(", ")}. Techniques: ${TECHNIQUES.map((t) => t.id).join(", ")}.`
    );
  }
  const ids = [.../* @__PURE__ */ new Set([...base, ...extras])];
  const techniques = ids.map((id) => {
    const technique = TECHNIQUES.find((t) => t.id === id);
    if (!technique) {
      throw new Error(
        `Unknown harness technique "${id}". Techniques: ${TECHNIQUES.map((t) => t.id).join(", ")}.`
      );
    }
    return technique;
  });
  const added = extras.filter((id) => !base.includes(id)).sort();
  const stamp = `${[profile, ...new Set(added)].join("+")}@${HARNESS_VERSION}`;
  return {
    stamp,
    techniques,
    build({ hasMcpConfig }) {
      let dir;
      const ctx = {
        hasMcpConfig,
        scratchDir: () => dir ?? (dir = mkdtempSync2(join11(tmpdir2(), "devpilot-harness-")))
      };
      const args = techniques.flatMap((t) => t.args(ctx));
      return { args, cleanupDir: dir };
    }
  };
}

// src/commands/session-runner/index.ts
function parseRepoMap(values) {
  const map = /* @__PURE__ */ new Map();
  for (const entry of values) {
    const idx = entry.indexOf("=");
    if (idx === -1) {
      throw new Error(`--repo expects <repo>=<path>, got '${entry}'`);
    }
    map.set(entry.slice(0, idx).trim(), resolve3(entry.slice(idx + 1).trim()));
  }
  return map;
}
var sessionRunnerCommand = new Command15("session-runner").description("Run Claude Code sessions dispatched by DevPilot (claude-session mode)").option("-p, --port <port>", "Port to listen on", "3900").option("--host <host>", "Interface to bind", "127.0.0.1").option("--token <token>", "Bearer token the dispatcher must present").option("-w, --workspace <dir>", "Directory containing repo checkouts", process.cwd()).option(
  "--repo <mapping>",
  "Explicit repo mapping, <owner/name>=<path> (repeatable)",
  (value, previous) => [...previous, value],
  []
).option("--claude-path <path>", "Path to the claude executable", "claude").option(
  "--permission-mode <mode>",
  "claude --permission-mode (acceptEdits | bypassPermissions | plan)",
  "acceptEdits"
).option("--max-concurrent <n>", "Max simultaneous sessions before answering 429", "3").option("--timeout <minutes>", "Wall-clock cap per session", "30").option(
  "--harness <spec>",
  "How agents are configured: baseline | lean, optionally +technique (e.g. baseline+compact-200k)",
  process.env.DEVPILOT_HARNESS || "baseline"
).option(
  "--worktree-root <dir>",
  "Where per-task git worktrees are created (default ~/.devpilot/worktrees)",
  process.env.DEVPILOT_WORKTREE_ROOT
).option(
  "--worktree-setup <command>",
  'Shell command run in each new task worktree before its agent starts (e.g. "pnpm install --offline")',
  process.env.DEVPILOT_WORKTREE_SETUP
).action(async (options) => {
  let repoMap;
  try {
    repoMap = parseRepoMap(options.repo ?? []);
  } catch (error) {
    console.error(chalk17.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return;
  }
  let harness;
  try {
    harness = resolveHarness(options.harness);
  } catch (error) {
    console.error(chalk17.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return;
  }
  const config = {
    port: parseInt(options.port, 10),
    host: options.host,
    apiKey: options.token ?? process.env.DEVPILOT_SESSION_API_KEY,
    workspace: resolve3(options.workspace),
    repoMap,
    claudePath: options.claudePath,
    permissionMode: options.permissionMode,
    maxConcurrent: parseInt(options.maxConcurrent, 10),
    timeoutMs: parseInt(options.timeout, 10) * 6e4,
    harness,
    isolation: {
      worktreeRoot: options.worktreeRoot ? resolve3(options.worktreeRoot) : void 0,
      setupCommand: options.worktreeSetup || void 0
    },
    log: (line) => console.log(chalk17.dim(`[runner] ${line}`))
  };
  const runner = new SessionRunner(config);
  try {
    await runner.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk17.red(`Failed to start session runner: ${message}`));
    process.exitCode = 1;
    return;
  }
  const base = `http://${config.host}:${config.port}`;
  console.log(chalk17.bold("\n  DevPilot session runner\n"));
  console.log(`  ${chalk17.dim("listening")}   ${base}`);
  console.log(`  ${chalk17.dim("workspace")}   ${config.workspace}`);
  console.log(`  ${chalk17.dim("claude")}      ${config.claudePath} (${config.permissionMode})`);
  console.log(`  ${chalk17.dim("concurrency")} ${config.maxConcurrent}`);
  console.log(`  ${chalk17.dim("harness")}     ${harness.stamp}`);
  for (const t of harness.techniques) {
    console.log(`  ${chalk17.dim("           ")} ${t.id}: ${t.summary}`);
    console.log(chalk17.dim(`               watch for ${t.watch}`));
  }
  console.log(
    `  ${chalk17.dim("worktrees")}   ${config.isolation?.worktreeRoot ?? "~/.devpilot/worktrees"}` + (config.isolation?.setupCommand ? chalk17.dim(` (setup: ${config.isolation.setupCommand})`) : chalk17.dim(" (no --worktree-setup: tracked files only)"))
  );
  if (repoMap.size > 0) {
    for (const [repo, path] of repoMap) console.log(`  ${chalk17.dim("repo")}        ${repo} \u2192 ${path}`);
  }
  if (!config.apiKey) {
    console.log(chalk17.yellow("\n  No --token set: the dispatcher API is unauthenticated."));
  }
  console.log(chalk17.dim("\n  Point DevPilot at it:"));
  console.log(
    chalk17.dim(
      `    DEVPILOT_ORCHESTRATOR_MODE=claude-session DEVPILOT_SESSION_API_URL=${base} devpilot serve
`
    )
  );
  const shutdown = async () => {
    console.log(chalk17.dim("\n[runner] shutting down\u2026"));
    await runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});

// src/commands/update.ts
import { Command as Command16 } from "commander";
import { execSync as execSync2, spawn as spawn3 } from "child_process";
import chalk18 from "chalk";
async function getLatestVersion() {
  try {
    const result = execSync2("npm view @devpilot.sh/cli version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    return result.trim();
  } catch {
    return null;
  }
}
function compareVersions(a, b) {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}
function detectPackageManager() {
  try {
    const pnpmList = execSync2("pnpm list -g @devpilot.sh/cli 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (pnpmList.includes("@devpilot.sh/cli")) return "pnpm";
  } catch {
  }
  try {
    const yarnList = execSync2("yarn global list 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (yarnList.includes("@devpilot.sh/cli")) return "yarn";
  } catch {
  }
  try {
    execSync2("bun --version", { stdio: ["pipe", "pipe", "pipe"] });
    return "bun";
  } catch {
  }
  return "npm";
}
function getUpdateCommand(pm) {
  switch (pm) {
    case "pnpm":
      return "pnpm add -g @devpilot.sh/cli@latest";
    case "yarn":
      return "yarn global add @devpilot.sh/cli@latest";
    case "bun":
      return "bun add -g @devpilot.sh/cli@latest";
    default:
      return "npm install -g @devpilot.sh/cli@latest";
  }
}
var updateCommand = new Command16("update").description("Update DevPilot CLI to the latest version").option("-c, --check", "Only check for updates without installing").option("--force", "Force update even if already on latest version").action(async (options) => {
  console.log(chalk18.cyan("Checking for updates..."));
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    console.log(chalk18.yellow("Could not check for updates. Please check your network connection."));
    console.log(chalk18.gray("You can manually update with: npm install -g @devpilot.sh/cli@latest"));
    return;
  }
  const comparison = compareVersions(latestVersion, VERSION);
  if (comparison === 0 && !options.force) {
    console.log(chalk18.green(`You're already on the latest version (${VERSION})`));
    return;
  }
  if (comparison === -1 && !options.force) {
    console.log(chalk18.yellow(`You're on a newer version (${VERSION}) than the latest release (${latestVersion})`));
    console.log(chalk18.gray("This might be a pre-release or development version."));
    return;
  }
  if (options.check) {
    if (comparison === 1) {
      console.log(chalk18.yellow(`Update available: ${VERSION} \u2192 ${latestVersion}`));
      console.log(chalk18.gray('Run "devpilot update" to install the latest version.'));
    }
    return;
  }
  const pm = detectPackageManager();
  const updateCmd = getUpdateCommand(pm);
  console.log(chalk18.cyan(`Updating from ${VERSION} to ${latestVersion}...`));
  console.log(chalk18.gray(`Using: ${updateCmd}`));
  console.log("");
  try {
    const [cmd, ...args] = updateCmd.split(" ");
    const child = spawn3(cmd, args, {
      stdio: "inherit",
      shell: true
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log("");
        console.log(chalk18.green(`Successfully updated to ${latestVersion}`));
        console.log(chalk18.gray('Run "devpilot --version" to verify.'));
      } else {
        console.log("");
        console.log(chalk18.red("Update failed. Please try manually:"));
        console.log(chalk18.cyan(`  ${updateCmd}`));
      }
    });
    child.on("error", (err) => {
      console.log(chalk18.red(`Update failed: ${err.message}`));
      console.log(chalk18.gray("Please try manually:"));
      console.log(chalk18.cyan(`  ${updateCmd}`));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(chalk18.red(`Update failed: ${message}`));
    console.log(chalk18.gray("Please try manually:"));
    console.log(chalk18.cyan(`  ${updateCmd}`));
  }
});

// src/commands/wiki.ts
import { Command as Command17 } from "commander";
import { existsSync as existsSync14, mkdirSync as mkdirSync10, readFileSync as readFileSync10, writeFileSync as writeFileSync12 } from "fs";
import { join as join12 } from "path";
import chalk19 from "chalk";
import { resolveWikiModel } from "@devpilot.sh/core/wave-planner";
var wikiCommand = new Command17("wiki").description("LLM-compiled knowledge base \u2014 institutional memory for your codebase");
wikiCommand.command("init").description("Initialize the wiki system in the current repository").option("--wiki-dir <path>", "Wiki output directory", ".devpilot/wiki").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = join12(cwd, ".devpilot");
  const wikiDir = join12(cwd, options.wikiDir);
  if (!existsSync14(devpilotDir)) {
    console.log(
      chalk19.yellow("\u26A0\uFE0F  DevPilot not initialized. Run `devpilot init` first.")
    );
    return;
  }
  if (!existsSync14(wikiDir)) {
    mkdirSync10(wikiDir, { recursive: true });
  }
  const indexPath = join12(wikiDir, "index.md");
  if (!existsSync14(indexPath)) {
    const initialIndex = `# Wiki Index

> Auto-generated wiki \u2014 compiled from session logs, commits, specs, and decisions.
> This wiki is maintained by DevPilot's wiki compiler following the LLM Knowledge Base pattern.

## Getting Started

This wiki will grow automatically as you work with DevPilot:
- **Session logs** are compiled into architecture and decision articles
- **Commits** are analyzed for patterns and architectural changes
- **Specs** are indexed for requirements and design rationale

Run \`devpilot wiki ingest\` to manually add sources, or let the session hook capture knowledge automatically.
`;
    writeFileSync12(indexPath, initialIndex);
  }
  const logPath = join12(wikiDir, "log.md");
  if (!existsSync14(logPath)) {
    writeFileSync12(
      logPath,
      `# Wiki Activity Log

> Append-only chronicle of wiki operations.

- **${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}** [init] Wiki initialized
`
    );
  }
  const gitignorePath = join12(cwd, ".gitignore");
  if (existsSync14(gitignorePath)) {
    const gitignore = readFileSync10(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/wiki")) {
    }
  }
  console.log(chalk19.green("\u2705 Wiki initialized!"));
  console.log("");
  console.log(chalk19.white("Wiki directory: ") + chalk19.cyan(wikiDir));
  console.log("");
  console.log(chalk19.white("Next steps:"));
  console.log(
    chalk19.gray("  1. ") + chalk19.cyan("devpilot wiki ingest --file <path>") + chalk19.gray(" to add source material")
  );
  console.log(
    chalk19.gray("  2. ") + chalk19.cyan('devpilot wiki query "How does auth work?"') + chalk19.gray(" to ask questions")
  );
  console.log(
    chalk19.gray("  3. ") + chalk19.cyan("devpilot wiki status") + chalk19.gray(" to check wiki health")
  );
  console.log("");
  console.log(
    chalk19.gray(
      "The wiki will grow automatically as agents work \u2014 each session compounds the knowledge base."
    )
  );
});
wikiCommand.command("ingest").description("Ingest a source document into the wiki").requiredOption("--type <type>", "Source type: session_log, commit, spec, decision, manual").requiredOption("--title <title>", "Human-readable title for the source").option("--file <path>", "Path to source file").option("--stdin", "Read source from stdin").option("--origin <origin>", "Origin identifier (e.g. session ID, commit SHA)").action(async (options) => {
  let content;
  if (options.file) {
    if (!existsSync14(options.file)) {
      console.log(chalk19.red(`\u274C File not found: ${options.file}`));
      return;
    }
    content = readFileSync10(options.file, "utf-8");
  } else if (options.stdin) {
    content = readFileSync10(0, "utf-8");
  } else {
    console.log(
      chalk19.red("\u274C Provide either --file <path> or --stdin")
    );
    return;
  }
  const validTypes = ["session_log", "commit", "spec", "decision", "manual"];
  if (!validTypes.includes(options.type)) {
    console.log(
      chalk19.red(
        `\u274C Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`
      )
    );
    return;
  }
  console.log(chalk19.gray(`Ingesting ${options.type}: "${options.title}"...`));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.ingest(
      content,
      options.type,
      options.title,
      options.origin
    );
    console.log(chalk19.green("\u2705 Ingested successfully!"));
    console.log(
      chalk19.gray(`   Source ID: ${result.sourceId}`)
    );
    if (result.articlesCreated.length > 0) {
      console.log(
        chalk19.white(`   Articles created: `) + chalk19.cyan(result.articlesCreated.join(", "))
      );
    }
    if (result.articlesUpdated.length > 0) {
      console.log(
        chalk19.white(`   Articles updated: `) + chalk19.yellow(result.articlesUpdated.join(", "))
      );
    }
    console.log(
      chalk19.gray(`   Tokens used: ${result.tokensUsed}`)
    );
  } catch (error) {
    console.log(
      chalk19.red(
        `\u274C Ingest failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("query <question>").description("Ask a question against the wiki").action(async (question) => {
  console.log(chalk19.gray(`Searching wiki for: "${question}"...`));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.query(question);
    console.log("");
    console.log(chalk19.white(result.answer));
    console.log("");
    if (result.citedArticles.length > 0) {
      console.log(
        chalk19.gray("Cited: ") + chalk19.cyan(result.citedArticles.map((s) => `[[${s}]]`).join(", "))
      );
    }
    if (result.newArticleSlug) {
      console.log(
        chalk19.green(
          `\u{1F4DD} New article created from this query: [[${result.newArticleSlug}]]`
        )
      );
    }
    console.log(chalk19.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      chalk19.red(
        `\u274C Query failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("lint").description("Check wiki health \u2014 find stale content, orphans, and gaps").action(async () => {
  console.log(chalk19.gray("Linting wiki..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.lint();
    if (result.findings.length === 0) {
      console.log(chalk19.green("\u2705 Wiki is healthy \u2014 no issues found!"));
      return;
    }
    console.log(
      chalk19.yellow(`\u26A0\uFE0F  Found ${result.findings.length} issue(s):
`)
    );
    for (const finding of result.findings) {
      const icon = {
        stale: "\u{1F550}",
        orphaned: "\u{1F517}",
        contradiction: "\u26A1",
        gap: "\u{1F4ED}",
        broken_link: "\u{1F494}"
      }[finding.type];
      console.log(
        `  ${icon} ${chalk19.white(`[${finding.type}]`)} ${chalk19.cyan(`[[${finding.articleSlug}]]`)}`
      );
      console.log(chalk19.gray(`     ${finding.description}`));
      console.log(chalk19.gray(`     \u2192 ${finding.suggestion}`));
      console.log("");
    }
    if (result.articlesMarkedStale.length > 0) {
      console.log(
        chalk19.yellow(
          `Marked ${result.articlesMarkedStale.length} article(s) as stale.`
        )
      );
    }
    console.log(chalk19.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      chalk19.red(
        `\u274C Lint failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("status").description("Show wiki statistics").action(async () => {
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const status = await compiler.getStatus();
    console.log(chalk19.white.bold("\n\u{1F4DA} Wiki Status\n"));
    console.log(
      chalk19.gray("  Sources:    ") + chalk19.white(String(status.totalSources))
    );
    console.log(
      chalk19.gray("  Articles:   ") + chalk19.white(String(status.totalArticles)) + chalk19.gray(" (") + chalk19.green(`${status.activeArticles} active`) + (status.staleArticles > 0 ? chalk19.yellow(`, ${status.staleArticles} stale`) : "") + (status.archivedArticles > 0 ? chalk19.gray(`, ${status.archivedArticles} archived`) : "") + chalk19.gray(")")
    );
    if (Object.keys(status.categories).length > 0) {
      console.log(chalk19.gray("\n  Categories:"));
      for (const [category, count] of Object.entries(status.categories).sort()) {
        console.log(
          chalk19.gray("    ") + chalk19.cyan(category) + chalk19.gray(": ") + chalk19.white(String(count))
        );
      }
    }
    if (status.lastActivity) {
      console.log(
        chalk19.gray("\n  Last activity: ") + chalk19.white(status.lastActivity.toISOString().split("T")[0])
      );
    }
    console.log("");
  } catch (error) {
    console.log(
      chalk19.red(
        `\u274C Status failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("flush").description("Export wiki to disk as markdown files").action(async () => {
  console.log(chalk19.gray("Flushing wiki to disk..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.flushToDisk();
    console.log(chalk19.green(`\u2705 Wrote ${result.filesWritten} files to ${result.wikiDir}`));
  } catch (error) {
    console.log(
      chalk19.red(
        `\u274C Flush failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("index").description("Show the wiki table of contents").option("--category <category>", "Filter by category").action(async (options) => {
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    let index = await compiler.getIndex();
    if (options.category) {
      index = index.filter((e) => e.category === options.category);
    }
    if (index.length === 0) {
      console.log(chalk19.gray("Wiki is empty. Run `devpilot wiki ingest` to add sources."));
      return;
    }
    const byCategory = {};
    for (const entry of index) {
      if (!byCategory[entry.category]) {
        byCategory[entry.category] = [];
      }
      byCategory[entry.category].push(entry);
    }
    console.log(chalk19.white.bold("\n\u{1F4D6} Wiki Index\n"));
    for (const [category, entries] of Object.entries(byCategory).sort()) {
      console.log(
        chalk19.cyan.bold(
          `  ${category.charAt(0).toUpperCase() + category.slice(1)}`
        )
      );
      for (const entry of entries) {
        const statusColor = entry.status === "active" ? chalk19.green : entry.status === "stale" ? chalk19.yellow : chalk19.gray;
        const badge = statusColor(`[${entry.status}]`);
        console.log(
          `    ${badge} ${chalk19.white(entry.title)} ${chalk19.gray(`[[${entry.slug}]]`)}`
        );
      }
      console.log("");
    }
  } catch (error) {
    console.log(
      chalk19.red(
        `\u274C Index failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("read <slug>").description("Read a specific wiki article").action(async (slug) => {
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const article = await compiler.getArticle(slug);
    if (!article) {
      console.log(chalk19.red(`\u274C Article not found: [[${slug}]]`));
      return;
    }
    console.log(chalk19.white.bold(`
# ${article.title}
`));
    console.log(
      chalk19.gray(
        `Category: ${article.category} | Status: ${article.status} | v${article.version}`
      )
    );
    if (article.backlinks.length > 0) {
      console.log(
        chalk19.gray(
          `Related: ${article.backlinks.map((b) => `[[${b}]]`).join(", ")}`
        )
      );
    }
    console.log(chalk19.gray("\u2500".repeat(60)));
    console.log(article.content);
    console.log("");
  } catch (error) {
    console.log(
      chalk19.red(
        `\u274C Read failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
function getWikiConfig() {
  const cwd = process.cwd();
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: resolveWikiModel(),
    maxTokens: parseInt(process.env.WIKI_MAX_TOKENS || "8192", 10),
    repo: getRepoName(cwd),
    wikiDir: join12(cwd, ".devpilot", "wiki")
  };
}
function getRepoName(cwd) {
  try {
    const { execSync: execSync3 } = __require("child_process");
    const remote = execSync3("git remote get-url origin", {
      cwd,
      encoding: "utf-8"
    }).trim();
    const match = remote.match(/[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
    return match ? match[1] : cwd.split("/").pop() || "unknown";
  } catch {
    return cwd.split("/").pop() || "unknown";
  }
}

// src/cli.ts
import { benchCommand } from "@devpilot.sh/benchmarks/cli";
var pkg = {
  name: "@devpilot.sh/cli",
  version: VERSION
};
var cli = new Command18();
cli.name("devpilot").description("DevPilot CLI - Manage your AI coding agent fleet").version(VERSION);
cli.addCommand(initCommand);
cli.addCommand(setupCommand);
cli.addCommand(serveCommand);
cli.addCommand(statusCommand);
cli.addCommand(configCommand);
cli.addCommand(bridgeCommand);
cli.addCommand(sessionCommand);
cli.addCommand(sessionsCommand);
cli.addCommand(sessionRunnerCommand);
cli.addCommand(updateCommand);
cli.addCommand(wikiCommand);
cli.addCommand(benchCommand);
function runCli(args = process.argv) {
  const notifier = updateNotifier({
    pkg,
    updateCheckInterval: 1e3 * 60 * 60 * 24
    // 24 hours
  });
  notifier.notify({
    message: `Update available: {currentVersion} \u2192 {latestVersion}
Run {updateCommand} to update`,
    boxenOptions: {
      padding: 1,
      margin: 1,
      borderColor: "cyan",
      borderStyle: "round"
    }
  });
  cli.parse(args);
}
export {
  VERSION,
  cli,
  runCli
};
//# sourceMappingURL=index.mjs.map