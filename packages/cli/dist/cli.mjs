#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli.ts
import { Command as Command17 } from "commander";
import updateNotifier from "update-notifier";

// src/version.ts
var VERSION = "0.1.1";

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
var statusCommand = new Command3("status").description("Show current fleet and runway status").option("-v, --verbose", "Show detailed information").action(async (options) => {
  console.log(chalk3.cyan("\u{1F4CA} DevPilot Status"));
  console.log("");
  console.log(chalk3.white("Fleet Status:"));
  console.log(chalk3.gray("  Active Sessions: ") + chalk3.green("3"));
  console.log(chalk3.gray("  Needs Spec: ") + chalk3.yellow("1"));
  console.log(chalk3.gray("  Fleet Utilization: ") + chalk3.cyan("75%"));
  console.log("");
  console.log(chalk3.white("Runway:"));
  console.log(chalk3.gray("  Ready Items: ") + chalk3.green("2"));
  console.log(chalk3.gray("  Refining: ") + chalk3.blue("1"));
  console.log(chalk3.gray("  Shaping: ") + chalk3.magenta("2"));
  console.log(chalk3.gray("  Directional: ") + chalk3.gray("3"));
  console.log(chalk3.gray("  Runway Hours: ") + chalk3.green("4.2h"));
  console.log("");
  console.log(chalk3.white("Conductor Score:"));
  console.log(chalk3.gray("  Total: ") + chalk3.magenta("742") + chalk3.gray("/1000"));
  console.log(chalk3.gray("  Rank: ") + chalk3.cyan("#23"));
  if (options.verbose) {
    console.log("");
    console.log(chalk3.white("Score Breakdown:"));
    console.log(chalk3.gray("  Fleet Utilization: ") + chalk3.white("156/200"));
    console.log(chalk3.gray("  Runway Health: ") + chalk3.white("148/200"));
    console.log(chalk3.gray("  Plan Accuracy: ") + chalk3.white("162/200"));
    console.log(chalk3.gray("  Cost Efficiency: ") + chalk3.white("138/200"));
    console.log(chalk3.gray("  Velocity Trend: ") + chalk3.white("138/200"));
  }
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
      const client = linear.initLinearClient({ apiKey, teamId });
      const team = await client.getTeam();
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
import { existsSync as existsSync4, readFileSync as readFileSync2, writeFileSync as writeFileSync3 } from "fs";
import { join as join4, basename } from "path";
import { homedir } from "os";
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
  const git2 = checkCommand("git");
  const gitMeetsMin = versionMeetsMinimum(git2.version, "2.25.0");
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
  const rtk = checkCommand("rtk");
  const cavemanInstalled = isCavemanInstalled();
  return {
    node: { ...node, meetsMinimum: nodeMeetsMin },
    git: { ...git2, meetsMinimum: gitMeetsMin },
    tmux: { installed: tmux.installed },
    gh: { installed: gh.installed, authenticated: ghAuthenticated },
    rtk: { installed: rtk.installed, version: rtk.version },
    caveman: { installed: cavemanInstalled }
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
  if (reqs.rtk.installed) {
    console.log(chalk5.green(`  \u2713 RTK ${reqs.rtk.version || ""} (token optimization)`));
  } else {
    console.log(chalk5.yellow("  \u26A0 RTK not found (recommended, for 60-90% token savings)"));
  }
  if (reqs.caveman.installed) {
    console.log(chalk5.green("  \u2713 Caveman plugin (output token compression)"));
  } else {
    console.log(chalk5.yellow("  \u26A0 Caveman not found (optional, for ~65-75% output token savings)"));
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
function isRtkInstalled() {
  try {
    const result = spawnSync("rtk", ["--version"], { encoding: "utf-8", stdio: "pipe" });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installRtk() {
  const hasCargo = spawnSync("cargo", ["--version"], { encoding: "utf-8", stdio: "pipe" }).status === 0;
  if (hasCargo) {
    console.log(chalk5.cyan("\n  Installing RTK via cargo (this may take a few minutes)..."));
    try {
      execSync("cargo install --git https://github.com/rtk-ai/rtk", { stdio: "inherit" });
      console.log(chalk5.green("  \u2713 RTK installed successfully"));
      return true;
    } catch {
      console.log(chalk5.red("  \u2717 Failed to install RTK via cargo"));
    }
  }
  console.log(chalk5.cyan("\n  Installing RTK via install script..."));
  try {
    execSync("curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh", {
      stdio: "inherit"
    });
    console.log(chalk5.green("  \u2713 RTK installed successfully"));
    return true;
  } catch {
    console.log(chalk5.red("  \u2717 Failed to install RTK"));
    console.log(chalk5.gray("  Install manually: cargo install --git https://github.com/rtk-ai/rtk"));
    console.log(chalk5.gray("  Or: brew install rtk"));
    return false;
  }
}
function initRtkHook() {
  console.log(chalk5.cyan("\n  Initializing RTK hook for Claude Code..."));
  try {
    execSync("rtk init -g", { encoding: "utf-8", stdio: "pipe" });
    console.log(chalk5.green("  \u2713 RTK hook initialized"));
    return true;
  } catch {
    console.log(chalk5.yellow("  \u26A0 RTK hook init requires manual step: rtk init -g"));
    return false;
  }
}
function isCavemanInstalled() {
  const claudeDir = join4(homedir(), ".claude");
  if (existsSync4(join4(claudeDir, "hooks", "caveman-activate.js"))) {
    return true;
  }
  const settingsPath = join4(claudeDir, "settings.json");
  if (existsSync4(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync2(settingsPath, "utf-8"));
      const settingsStr = JSON.stringify(settings);
      if (settingsStr.includes("caveman")) {
        return true;
      }
    } catch {
    }
  }
  return false;
}
function installCaveman() {
  console.log(chalk5.cyan("\n  Installing Caveman plugin for Claude Code..."));
  try {
    execSync("npx -y skills add JuliusBrussee/caveman", {
      stdio: "inherit",
      timeout: 12e4
    });
    console.log(chalk5.green("  \u2713 Caveman plugin installed successfully"));
    return true;
  } catch {
    console.log(chalk5.yellow("  npx skills add failed, trying hook install script..."));
    try {
      execSync(
        "bash <(curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/hooks/install.sh)",
        { stdio: "inherit", shell: "/bin/bash", timeout: 6e4 }
      );
      console.log(chalk5.green("  \u2713 Caveman hooks installed successfully"));
      return true;
    } catch {
      console.log(chalk5.red("  \u2717 Failed to install Caveman plugin"));
      console.log(chalk5.gray("  Install manually: npx skills add JuliusBrussee/caveman"));
      return false;
    }
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
  if (!reqs.rtk.installed) {
    instructions.push("RTK (token savings): cargo install --git https://github.com/rtk-ai/rtk");
  }
  if (!reqs.caveman.installed) {
    instructions.push("Caveman (output compression): npx skills add JuliusBrussee/caveman");
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
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(chalk6.bold("Step 4: RTK Token Optimization"));
    console.log(chalk6.gray("RTK reduces LLM token consumption by 60-90% across fleet agents.\n"));
    const rtkInstalled = isRtkInstalled();
    if (rtkInstalled) {
      console.log(chalk6.green("  RTK is already installed."));
      console.log(chalk6.gray("  Ensuring Claude Code hook is configured..."));
      initRtkHook();
    } else if (nonInteractive) {
      console.log(chalk6.gray("  Installing RTK (non-interactive mode)..."));
      const success = installRtk();
      if (success) {
        initRtkHook();
      }
    } else {
      const install = await confirm("  Install RTK for token-optimized agent sessions?");
      if (install) {
        const success = installRtk();
        if (success) {
          initRtkHook();
        }
      } else {
        console.log(chalk6.gray("  Skipping RTK installation. Install later with:"));
        console.log(chalk6.cyan("    cargo install --git https://github.com/rtk-ai/rtk"));
        console.log(chalk6.cyan("    rtk init -g\n"));
      }
    }
    console.log("");
  }
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(chalk6.bold("Step 5: Caveman Output Compression"));
    console.log(chalk6.gray("Caveman reduces output token usage by ~65-75% across fleet agents.\n"));
    const cavemanInstalled = isCavemanInstalled();
    if (cavemanInstalled) {
      console.log(chalk6.green("  Caveman plugin is already installed."));
      console.log(chalk6.gray("  Activate in any session with /caveman (modes: lite, full, ultra)"));
    } else if (nonInteractive) {
      console.log(chalk6.gray("  Installing Caveman plugin (non-interactive mode)..."));
      installCaveman();
    } else {
      const install = await confirm("  Install Caveman plugin for compressed agent output?");
      if (install) {
        installCaveman();
      } else {
        console.log(chalk6.gray("  Skipping Caveman installation. Install later with:"));
        console.log(chalk6.cyan("    npx skills add JuliusBrussee/caveman\n"));
      }
    }
    console.log("");
  }
  console.log(chalk6.bold.green("\nSetup Complete!\n"));
  console.log(chalk6.white("Next steps:"));
  console.log(chalk6.gray("  1. Run ") + chalk6.cyan("devpilot serve") + chalk6.gray(" to start the UI"));
  console.log(chalk6.gray("  2. Run ") + chalk6.cyan("ao start") + chalk6.gray(" to start agent orchestrator"));
  console.log(chalk6.gray("  3. Use the UI to create items and dispatch to the fleet"));
  console.log(chalk6.gray("  4. Run ") + chalk6.cyan("rtk gain") + chalk6.gray(" to monitor token savings"));
  console.log(chalk6.gray("  5. Use ") + chalk6.cyan("/caveman") + chalk6.gray(" in sessions for compressed output\n"));
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
import chalk7 from "chalk";
import { BridgeClient, DispatchLoop, HeartbeatService } from "@devpilot.sh/bridge-client";

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
var DEFAULT_TIMEOUT_MS = 15 * 6e4;
async function call(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
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
function describe(state) {
  if (state.awaiting === "review") {
    const score = state.review?.score?.parallelizationScore;
    const pct = typeof score === "number" ? ` (parallelization ${Math.round(score * 100)}%)` : "";
    return `Plan ready${pct} \u2014 awaiting review in the DevPilot cockpit.`;
  }
  if (state.awaiting === "wave") return "Plan approved \u2014 dispatching waves.";
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
          const summary2 = describe(current);
          log(`${linearIdentifier}: ${summary2} (no new run started)`);
          await opts.client.reportSessionStatus(sessionId, {
            status: "running",
            progressPercent: current.awaiting === "review" ? 40 : 60,
            message: summary2
          });
          opts.watcher?.watch({ sessionId, itemId: item.id, linearIdentifier });
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
        message: `On the board as ${item.id}. Planning\u2026`
      });
      const state = await call(
        `${base}/api/items/${item.id}/conductor`,
        { method: "POST", body: JSON.stringify({}) },
        timeout
      );
      const summary = describe(state);
      log(`${linearIdentifier}: ${summary}`);
      if (state.status === "failed") {
        throw new Error(summary);
      }
      await opts.client.reportSessionStatus(sessionId, {
        status: "running",
        progressPercent: state.awaiting === "review" ? 40 : 60,
        message: summary
      });
      opts.watcher?.watch({ sessionId, itemId: item.id, linearIdentifier });
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

// src/commands/bridge/conductor-watcher.ts
var TERMINAL = /* @__PURE__ */ new Set(["complete", "failed"]);
var ConductorWatcher = class {
  constructor(opts) {
    this.opts = opts;
    this.runs = /* @__PURE__ */ new Map();
    this.timer = null;
    this.base = opts.cockpitUrl.replace(/\/$/, "");
    this.interval = opts.pollIntervalMs ?? 3e4;
    this.log = opts.onLog ?? (() => {
    });
    this.doFetch = opts.fetchImpl ?? fetch;
  }
  /** Begin watching a run. Idempotent per bridge session. */
  watch(run) {
    if (this.runs.has(run.sessionId)) return;
    this.runs.set(run.sessionId, run);
    this.log(`watching ${run.linearIdentifier} (${this.runs.size} tracked)`);
    this.start();
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
    if (!res.ok) throw new Error(`conductor state \u2192 ${res.status}`);
    const state = await res.json();
    if (!state.status || !TERMINAL.has(state.status)) return;
    const success = state.status === "complete";
    const waves = state.completedWaves?.length ?? 0;
    const tasks = state.review?.plan?.waves?.reduce((n, w) => n + (w.tasks?.length ?? 0), 0) ?? 0;
    const summary = success ? `DevPilot completed ${waves} wave${waves === 1 ? "" : "s"}` + (tasks ? ` covering ${tasks} task${tasks === 1 ? "" : "s"}.` : ".") : `DevPilot run failed: ${state.errors?.[state.errors.length - 1] ?? "unknown error"}`;
    this.runs.delete(run.sessionId);
    await this.opts.client.reportSessionComplete(run.sessionId, {
      success,
      summary,
      ...success ? {} : { errorMessage: summary }
    });
    this.log(`${run.linearIdentifier}: reported ${success ? "complete" : "failed"} to the bridge`);
  }
  /** Test/introspection helper. */
  get tracked() {
    return this.runs.size;
  }
};

// src/commands/bridge/connect.ts
var connectCommand = new Command6("connect").description("Connect this machine to a DevPilot bridge and run dispatched work locally").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-n, --name <name>", "Name for this machine", os.hostname()).option("-r, --repos <repos>", "Comma-separated repos this machine handles").option("-m, --mode <mode>", "Local orchestrator mode (http|claude-session)", "http").option(
  "--transport <transport>",
  "realtime | poll \u2014 polling is fully correct, just higher latency",
  process.env.DEVPILOT_BRIDGE_TRANSPORT || "realtime"
).option("-j, --max-jobs <n>", "Max concurrent local jobs", "4").option("--http-url <url>", "Orchestrator URL (required for --mode http)").option("--ao-project <name>", "ao project name (for --mode ao-cli)").option("--ao-path <path>", "Path to the ao binary (default: ao on PATH)").option(
  "--plan",
  "Route dispatches through the conductor (plan \u2192 waves) instead of one session",
  process.env.DEVPILOT_BRIDGE_PLAN === "true"
).option(
  "--cockpit-url <url>",
  "Local cockpit base URL for --plan",
  process.env.DEVPILOT_COCKPIT_URL || "http://127.0.0.1:3000"
).action(async (options) => {
  if (!options.url) {
    console.error(chalk7.red("\u2717 Bridge URL required (--url or DEVPILOT_BRIDGE_URL)"));
    process.exit(1);
  }
  if (!options.token) {
    console.error(chalk7.red("\u2717 Token required (--token or DEVPILOT_BRIDGE_TOKEN)"));
    console.error(chalk7.gray("  Mint one in the dashboard under Settings \u2192 Tokens."));
    process.exit(1);
  }
  const repos = options.repos?.split(",").map((r) => r.trim()).filter(Boolean) ?? [];
  const maxConcurrentJobs = Math.max(1, parseInt(options.maxJobs, 10) || 4);
  console.log(chalk7.cyan("\u{1F309} DevPilot bridge"));
  console.log(chalk7.gray(`   ${options.url}`));
  console.log(chalk7.gray(`   machine: ${options.name}`));
  console.log("");
  if (options.mode === "ao-cli") {
    console.error(chalk7.red("\u2717 --mode ao-cli is deprecated and non-functional."));
    console.error(chalk7.gray("  `ao` is now a daemon on 127.0.0.1:3001; point http mode at it:"));
    console.error(chalk7.gray("    devpilot bridge connect --mode http --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  if (options.mode === "http" && !options.httpUrl) {
    console.error(chalk7.red("\u2717 --mode http requires --http-url"));
    console.error(chalk7.gray("  For the ao daemon: --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  const client = new BridgeClient({ bridgeUrl: options.url, token: options.token });
  let registration;
  try {
    registration = await client.register({ name: options.name, repos, maxConcurrentJobs });
  } catch (err) {
    console.error(chalk7.red("\u2717 Registration failed"));
    console.error(chalk7.red(`   ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }
  console.log(chalk7.green("\u2713 Registered"));
  console.log(chalk7.gray(`   orchestrator: ${registration.orchestratorId}`));
  console.log(chalk7.gray(`   repos: ${repos.join(", ") || "(none)"}`));
  if (repos.length === 0) {
    console.log(chalk7.yellow("   \u26A0 No repos specified \u2014 nothing can route to this machine."));
    console.log(chalk7.gray("     Re-run with --repos owner/name to receive dispatches."));
  }
  console.log("");
  const useRealtime = options.transport !== "poll" && registration.realtime !== null;
  if (options.transport !== "poll" && !registration.realtime) {
    console.log(chalk7.yellow("   Realtime unavailable from this bridge \u2014 polling instead."));
  }
  const conductorWatcher = options.plan ? new ConductorWatcher({
    client,
    cockpitUrl: options.cockpitUrl,
    onLog: (line) => console.log(chalk7.blue(`   ${line}`)),
    onLost: (run) => console.log(
      chalk7.yellow(
        `   ${run.linearIdentifier} was still running at shutdown \u2014 Linear will not be updated for it`
      )
    )
  }) : null;
  const loop = new DispatchLoop({
    client,
    orchestratorId: registration.orchestratorId,
    realtime: useRealtime && registration.realtime ? {
      supabaseUrl: registration.realtime.supabaseUrl,
      anonKey: registration.realtime.anonKey,
      jwt: registration.realtime.jwt
    } : null,
    maxConcurrent: maxConcurrentJobs,
    handler: options.plan ? createConductorDispatchHandler({
      client,
      cockpitUrl: options.cockpitUrl,
      watcher: conductorWatcher,
      onLog: (line) => console.log(chalk7.blue(`   ${line}`))
    }) : createBridgeDispatchHandler({
      client,
      orchestratorMode: options.mode,
      httpUrl: options.httpUrl,
      aoProjectName: options.aoProject,
      aoPath: options.aoPath,
      onLog: (line) => console.log(chalk7.blue(`   ${line}`))
    }),
    onLog: (line) => console.log(chalk7.gray(`   ${line}`)),
    onError: (e) => console.log(chalk7.yellow(`   ${e.message}`))
  });
  const heartbeat = new HeartbeatService({
    client,
    activeJobs: () => loop.activeJobs,
    onError: (e) => console.log(chalk7.gray(`   heartbeat: ${e.message}`))
  });
  await loop.start();
  heartbeat.start();
  console.log(chalk7.green(`\u2713 Listening (${useRealtime ? "realtime" : "poll"})`));
  console.log(chalk7.gray("   Agents run on THIS machine. Ctrl+C to disconnect."));
  console.log("");
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("");
    console.log(chalk7.yellow("Disconnecting\u2026"));
    heartbeat.stop();
    conductorWatcher?.stop();
    await loop.stop();
    console.log(chalk7.green("\u2713 Disconnected"));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  await new Promise(() => {
  });
});

// src/commands/bridge/disconnect.ts
import { Command as Command7 } from "commander";
import chalk8 from "chalk";
var disconnectCommand = new Command7("disconnect").description("Disconnect from DevPilot cloud bridge").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).option("-i, --orchestrator-id <id>", "Orchestrator ID to disconnect").action(async (options) => {
  if (!options.bridgeUrl || !options.orchestratorId) {
    console.error(chalk8.red("\u2717 Error: Bridge URL and orchestrator ID required"));
    console.error(chalk8.gray("   Use: devpilot bridge disconnect -u <url> -i <orchestrator-id>"));
    process.exit(1);
  }
  console.log(chalk8.cyan("\u{1F309} Disconnecting from DevPilot Bridge"));
  console.log("");
  console.log(chalk8.gray(`   Bridge URL: ${options.bridgeUrl}`));
  console.log(chalk8.gray(`   Orchestrator ID: ${options.orchestratorId}`));
  console.log("");
  try {
    const response = await fetch(
      `${options.bridgeUrl}/api/orchestrators/${options.orchestratorId}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${options.apiKey}`
        }
      }
    );
    if (response.ok) {
      console.log(chalk8.green("\u2713 Successfully disconnected from bridge"));
    } else {
      const errorText = await response.text();
      console.error(chalk8.red("\u2717 Failed to disconnect:"));
      console.error(chalk8.red(`   ${errorText}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk8.red("\u2717 Error disconnecting:"));
    console.error(chalk8.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge/status.ts
import { Command as Command8 } from "commander";
import chalk9 from "chalk";
var statusCommand2 = new Command8("status").description("Check bridge connection status").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-i, --orchestrator-id <id>", "Orchestrator ID").option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).action(async (options) => {
  if (!options.bridgeUrl) {
    console.error(chalk9.red("\u2717 Error: Bridge URL required"));
    console.error(chalk9.gray("   Use: devpilot bridge status -u <url>"));
    process.exit(1);
  }
  console.log(chalk9.cyan("\u{1F309} DevPilot Bridge Status"));
  console.log("");
  try {
    const healthRes = await fetch(`${options.bridgeUrl}/health`);
    const health = await healthRes.json();
    console.log(chalk9.white("Bridge Status:"));
    if (health.status === "ok") {
      console.log(chalk9.gray("  Status: ") + chalk9.green("\u2713 Online"));
    } else {
      console.log(chalk9.gray("  Status: ") + chalk9.red("\u2717 Offline"));
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
        console.log(chalk9.white("Orchestrator Status:"));
        console.log(chalk9.gray("  ID: ") + chalk9.cyan(orch.id));
        console.log(chalk9.gray("  Name: ") + chalk9.white(orch.name));
        if (orch.isOnline) {
          console.log(chalk9.gray("  Online: ") + chalk9.green("\u2713"));
        } else {
          console.log(chalk9.gray("  Online: ") + chalk9.red("\u2717"));
        }
        console.log(chalk9.gray("  Active Jobs: ") + chalk9.yellow(orch.activeJobs));
        console.log(chalk9.gray("  Last Heartbeat: ") + chalk9.white(orch.lastHeartbeat || "Never"));
        console.log(chalk9.gray("  Repos: ") + chalk9.cyan(orch.repos?.join(", ") || "None"));
      } else {
        console.log(chalk9.white("Orchestrator Status:"));
        console.log(chalk9.gray("  ") + chalk9.red("Not found or unauthorized"));
      }
    }
  } catch (error) {
    console.error(chalk9.red("\u2717 Error checking status:"));
    console.error(chalk9.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge.ts
var bridgeCommand = new Command9("bridge").description("Manage connection to DevPilot cloud bridge").addCommand(connectCommand).addCommand(disconnectCommand).addCommand(statusCommand2);

// src/commands/session.ts
import { Command as Command13 } from "commander";

// src/commands/session/new.ts
import { Command as Command10 } from "commander";
import chalk10 from "chalk";
import { sessionCrypto, buildJoinLink, formatApiError } from "@devpilot.sh/bridge-protocol";
var newCommand = new Command10("new").description("Create a shared session and print its join link").argument("<title>", "What this session is about (stored in plaintext \u2014 no secrets)").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-o, --org <orgId>", "Organization id that will own the session").option("--issue <identifier>", "Linear issue identifier to attach, e.g. ENG-394").action(async (title, options) => {
  if (!options.url || !options.token) {
    console.error(chalk10.red("\u2717 Bridge URL and token required"));
    console.error(chalk10.gray("  --url / DEVPILOT_BRIDGE_URL, --token / DEVPILOT_BRIDGE_TOKEN"));
    process.exit(1);
  }
  if (!options.org) {
    console.error(chalk10.red("\u2717 --org <orgId> is required"));
    console.error(chalk10.gray("  The token is bound to one org; this must be that org."));
    process.exit(1);
  }
  const key = sessionCrypto.generateKey();
  const { joinKeyHash } = await sessionCrypto.deriveJoinCredentials(key);
  const base = options.url.replace(/\/+$/, "");
  const res = await fetch(`${base}/api/sessions/shared`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.token}` },
    body: JSON.stringify({
      orgId: options.org,
      title,
      joinKeyHash,
      ...options.issue ? { linearIdentifier: options.issue } : {}
    })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    console.error(chalk10.red(`\u2717 Could not create session (${res.status})`));
    console.error(chalk10.gray(`  ${formatApiError(body, res.statusText)}`));
    process.exit(1);
  }
  const { session } = await res.json();
  const link = buildJoinLink(base, session.id, key);
  console.log("");
  console.log(chalk10.cyan(`  ${session.title}`));
  console.log(chalk10.bold(`  ${link}`));
  console.log("");
  console.log(chalk10.yellow("  Anyone with this link can read the whole transcript."));
  console.log(chalk10.gray("  It carries the encryption key after the #, which never reaches"));
  console.log(chalk10.gray("  devpilot.sh. Send it the way you would send a password \u2014 not to"));
  console.log(chalk10.gray("  a public channel. To revoke it, re-key the session; that ends"));
  console.log(chalk10.gray("  access for this link but cannot un-send what was already read."));
  console.log("");
  console.log(chalk10.gray(`  Others join with:  devpilot session join "${chalk10.italic("<link>")}"`));
  console.log("");
});

// src/commands/session/join.ts
import os2 from "os";
import { Command as Command11 } from "commander";
import chalk11 from "chalk";
import { SharedSessionClient } from "@devpilot.sh/bridge-client";
var joinCommand = new Command11("join").description("Join a shared session by link and post a message").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", os2.hostname()).option("-m, --message <text>", "Post this message after joining").action(async (url, options) => {
  try {
    const client = await SharedSessionClient.join({ link: url, displayName: options.name });
    const s = client.session;
    console.log(chalk11.cyan(`
  ${s.title}`));
    console.log(chalk11.gray(`  mode: ${s.mode}  \xB7  messages: ${s.lastSeq ?? 0}
`));
    if (options.message) {
      const posted = await client.post(options.message);
      console.log(chalk11.green(`  posted #${posted.seq}
`));
    }
    const participants = await client.who();
    for (const p of participants) {
      const agent = p.agentKind ? chalk11.gray(` [${p.agentKind}]`) : "";
      console.log(`  \xB7 ${p.displayName}${agent}${p.leftAt ? chalk11.gray(" (left)") : ""}`);
    }
    console.log("");
  } catch (err) {
    console.error(chalk11.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
});

// src/commands/session/tail.ts
import os3 from "os";
import { Command as Command12 } from "commander";
import chalk12 from "chalk";
import { SharedSessionClient as SharedSessionClient2 } from "@devpilot.sh/bridge-client";
var tailCommand = new Command12("tail").description("Follow a shared session transcript in the terminal").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", os3.hostname()).option("-i, --interval <seconds>", "Poll interval", "3").action(async (url, options) => {
  const intervalMs = Math.max(1, parseInt(options.interval, 10) || 3) * 1e3;
  let client;
  try {
    client = await SharedSessionClient2.join({ link: url, displayName: options.name });
  } catch (err) {
    console.error(chalk12.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
    return;
  }
  const names = /* @__PURE__ */ new Map();
  for (const p of await client.who()) names.set(p.id, p.displayName);
  console.log(chalk12.cyan(`
  ${client.session.title}`));
  console.log(chalk12.gray(`  following \xB7 ctrl-c to stop
`));
  let cursor = 0;
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
    console.log(chalk12.gray("\n  stopped\n"));
    process.exit(0);
  });
  while (!stopped) {
    try {
      const { entries, latestSeq } = await client.read(cursor);
      if (entries.length > 0) {
        if (entries.some((e) => e.participantId && !names.has(e.participantId))) {
          for (const p of await client.who()) names.set(p.id, p.displayName);
        }
        for (const e of entries) console.log(format(e, names));
        cursor = latestSeq;
      }
    } catch (err) {
      console.error(chalk12.gray(`  \u2026 ${err instanceof Error ? err.message : String(err)}`));
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
});
function format(e, names) {
  const who = e.participantId ? names.get(e.participantId) ?? e.participantId : "system";
  const seq = chalk12.gray(`#${String(e.seq).padStart(3)}`);
  if (e.status === "system") {
    const reason = e.systemNotice?.reason ? ` (${e.systemNotice.reason})` : "";
    return `  ${seq} ${chalk12.yellow(`\u2699 ${e.systemNotice?.type ?? e.text}${reason}`)}`;
  }
  if (e.status === "undecryptable") {
    return `  ${seq} ${chalk12.gray(`${who}: <sealed under an earlier key \u2014 not readable with this link>`)}`;
  }
  return `  ${seq} ${chalk12.bold(who)}: ${e.text}`;
}

// src/commands/session.ts
var sessionCommand = new Command13("session").description("Shared, end-to-end encrypted sessions across machines").addCommand(newCommand).addCommand(joinCommand).addCommand(tailCommand);

// src/commands/session-runner/index.ts
import { Command as Command14 } from "commander";
import chalk13 from "chalk";
import { resolve as resolve3 } from "path";

// src/commands/session-runner/server.ts
import { createServer } from "http";
import { randomUUID } from "crypto";
import { existsSync as existsSync6 } from "fs";
import { basename as basename2, isAbsolute, resolve as resolve2 } from "path";

// src/commands/session-runner/claude-runner.ts
import { spawn as spawn2, execFile } from "child_process";
import { promisify } from "util";
import { mkdtempSync, rmSync, writeFileSync as writeFileSync5 } from "fs";
import { tmpdir } from "os";
import { join as join6 } from "path";
var execFileAsync = promisify(execFile);
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
function writeSessionMcpConfig(sessionLink) {
  const dir = mkdtempSync(join6(tmpdir(), "devpilot-mcp-"));
  const file = join6(dir, "mcp.json");
  writeFileSync5(
    file,
    JSON.stringify(
      {
        mcpServers: {
          "devpilot-session": {
            command: "npx",
            args: ["-y", "@devpilot.sh/mcp-session"],
            env: { DEVPILOT_SESSION_LINK: sessionLink }
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
  const { workdir, prompt: prompt2, sessionLink, model, claudePath, permissionMode, timeoutMs, onLog, onSpawn } = options;
  const before = await snapshot(workdir);
  const startedAt = Date.now();
  const args = ["-p", "--output-format", "json", "--permission-mode", permissionMode];
  if (model) args.push("--model", model);
  let mcpDir;
  let effectivePrompt = prompt2;
  if (sessionLink) {
    const cfg = writeSessionMcpConfig(sessionLink);
    mcpDir = cfg.dir;
    args.push("--mcp-config", cfg.file, "--strict-mcp-config");
    effectivePrompt = sessionPreamble() + prompt2;
  }
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
      stdout += chunk.toString();
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
  });
  const after = await snapshot(workdir);
  const files = classify(before, after);
  const envelope = parseEnvelope(outcome.stdout);
  const usage = envelope?.usage ?? {};
  const tokensUsed = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const durationMs = envelope?.duration_ms ?? Date.now() - startedAt;
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

// src/commands/session-runner/server.ts
var VERSION2 = "1.0.0";
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
      return existsSync6(mapped) ? { workdir: mapped } : { error: `Mapped path for '${repo}' does not exist: ${mapped}` };
    }
    const candidate = isAbsolute(repo) ? repo : resolve2(this.config.workspace, basename2(repo));
    if (!existsSync6(candidate)) {
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
      session.progressPercent = 5;
      session.currentStep = "session started";
      this.reportStatus(session, callbackUrl, callbackToken, {
        currentStep: "session started",
        message: `Claude Code session running in ${session.workdir}`
      });
      const heartbeat = setInterval(() => {
        if (session.terminal) return;
        session.progressPercent = Math.min(90, session.progressPercent + 5);
        this.reportStatus(session, callbackUrl, callbackToken, {
          currentStep: "working",
          message: "Session in progress"
        });
      }, 9e4);
      heartbeat.unref();
      const outcome = await runClaudeSession({
        workdir: session.workdir,
        prompt: request.prompt,
        sessionLink: request.sessionLink,
        model: request.model,
        claudePath: this.config.claudePath,
        permissionMode: this.config.permissionMode,
        timeoutMs: this.config.timeoutMs,
        onLog: (line) => this.config.log(`[${session.externalSessionId}] ${line}`),
        onSpawn: (kill) => {
          session.kill = kill;
        }
      });
      clearInterval(heartbeat);
      session.terminal = true;
      session.status = outcome.success ? "complete" : "error";
      session.progressPercent = outcome.success ? 100 : session.progressPercent;
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
          filesModified: outcome.filesModified,
          filesCreated: outcome.filesCreated,
          filesDeleted: outcome.filesDeleted,
          summary: outcome.summary,
          tokensUsed: outcome.tokensUsed,
          costUsd: outcome.costUsd,
          durationMinutes: outcome.durationMinutes,
          error: outcome.error,
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
  handleGet(res, externalSessionId) {
    const session = this.sessions.get(externalSessionId);
    if (!session) return json(res, 404, { error: "NOT_FOUND" });
    json(res, 200, {
      status: session.status,
      progressPercent: session.progressPercent,
      currentStep: session.currentStep,
      message: session.message,
      filesModified: session.filesModified,
      tokensUsed: session.tokensUsed
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
        activeSessions: this.activeCount
      });
    }
    if (!this.authorized(req)) return json(res, 401, { error: "UNAUTHORIZED" });
    if (path === "/v1/sessions" && req.method === "POST") {
      return this.handleCreate(req, res);
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
var sessionRunnerCommand = new Command14("session-runner").description("Run Claude Code sessions dispatched by DevPilot (claude-session mode)").option("-p, --port <port>", "Port to listen on", "3900").option("--host <host>", "Interface to bind", "127.0.0.1").option("--token <token>", "Bearer token the dispatcher must present").option("-w, --workspace <dir>", "Directory containing repo checkouts", process.cwd()).option(
  "--repo <mapping>",
  "Explicit repo mapping, <owner/name>=<path> (repeatable)",
  (value, previous) => [...previous, value],
  []
).option("--claude-path <path>", "Path to the claude executable", "claude").option(
  "--permission-mode <mode>",
  "claude --permission-mode (acceptEdits | bypassPermissions | plan)",
  "acceptEdits"
).option("--max-concurrent <n>", "Max simultaneous sessions before answering 429", "3").option("--timeout <minutes>", "Wall-clock cap per session", "30").action(async (options) => {
  let repoMap;
  try {
    repoMap = parseRepoMap(options.repo ?? []);
  } catch (error) {
    console.error(chalk13.red(error instanceof Error ? error.message : String(error)));
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
    log: (line) => console.log(chalk13.dim(`[runner] ${line}`))
  };
  const runner = new SessionRunner(config);
  try {
    await runner.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk13.red(`Failed to start session runner: ${message}`));
    process.exitCode = 1;
    return;
  }
  const base = `http://${config.host}:${config.port}`;
  console.log(chalk13.bold("\n  DevPilot session runner\n"));
  console.log(`  ${chalk13.dim("listening")}   ${base}`);
  console.log(`  ${chalk13.dim("workspace")}   ${config.workspace}`);
  console.log(`  ${chalk13.dim("claude")}      ${config.claudePath} (${config.permissionMode})`);
  console.log(`  ${chalk13.dim("concurrency")} ${config.maxConcurrent}`);
  if (repoMap.size > 0) {
    for (const [repo, path] of repoMap) console.log(`  ${chalk13.dim("repo")}        ${repo} \u2192 ${path}`);
  }
  if (!config.apiKey) {
    console.log(chalk13.yellow("\n  No --token set: the dispatcher API is unauthenticated."));
  }
  console.log(chalk13.dim("\n  Point DevPilot at it:"));
  console.log(
    chalk13.dim(
      `    DEVPILOT_ORCHESTRATOR_MODE=claude-session DEVPILOT_SESSION_API_URL=${base} devpilot serve
`
    )
  );
  const shutdown = async () => {
    console.log(chalk13.dim("\n[runner] shutting down\u2026"));
    await runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});

// src/commands/update.ts
import { Command as Command15 } from "commander";
import { execSync as execSync2, spawn as spawn3 } from "child_process";
import chalk14 from "chalk";
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
var updateCommand = new Command15("update").description("Update DevPilot CLI to the latest version").option("-c, --check", "Only check for updates without installing").option("--force", "Force update even if already on latest version").action(async (options) => {
  console.log(chalk14.cyan("Checking for updates..."));
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    console.log(chalk14.yellow("Could not check for updates. Please check your network connection."));
    console.log(chalk14.gray("You can manually update with: npm install -g @devpilot.sh/cli@latest"));
    return;
  }
  const comparison = compareVersions(latestVersion, VERSION);
  if (comparison === 0 && !options.force) {
    console.log(chalk14.green(`You're already on the latest version (${VERSION})`));
    return;
  }
  if (comparison === -1 && !options.force) {
    console.log(chalk14.yellow(`You're on a newer version (${VERSION}) than the latest release (${latestVersion})`));
    console.log(chalk14.gray("This might be a pre-release or development version."));
    return;
  }
  if (options.check) {
    if (comparison === 1) {
      console.log(chalk14.yellow(`Update available: ${VERSION} \u2192 ${latestVersion}`));
      console.log(chalk14.gray('Run "devpilot update" to install the latest version.'));
    }
    return;
  }
  const pm = detectPackageManager();
  const updateCmd = getUpdateCommand(pm);
  console.log(chalk14.cyan(`Updating from ${VERSION} to ${latestVersion}...`));
  console.log(chalk14.gray(`Using: ${updateCmd}`));
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
        console.log(chalk14.green(`Successfully updated to ${latestVersion}`));
        console.log(chalk14.gray('Run "devpilot --version" to verify.'));
      } else {
        console.log("");
        console.log(chalk14.red("Update failed. Please try manually:"));
        console.log(chalk14.cyan(`  ${updateCmd}`));
      }
    });
    child.on("error", (err) => {
      console.log(chalk14.red(`Update failed: ${err.message}`));
      console.log(chalk14.gray("Please try manually:"));
      console.log(chalk14.cyan(`  ${updateCmd}`));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(chalk14.red(`Update failed: ${message}`));
    console.log(chalk14.gray("Please try manually:"));
    console.log(chalk14.cyan(`  ${updateCmd}`));
  }
});

// src/commands/wiki.ts
import { Command as Command16 } from "commander";
import { existsSync as existsSync7, mkdirSync as mkdirSync3, readFileSync as readFileSync4, writeFileSync as writeFileSync6 } from "fs";
import { join as join7 } from "path";
import chalk15 from "chalk";
import { resolveWikiModel } from "@devpilot.sh/core/wave-planner";
var wikiCommand = new Command16("wiki").description("LLM-compiled knowledge base \u2014 institutional memory for your codebase");
wikiCommand.command("init").description("Initialize the wiki system in the current repository").option("--wiki-dir <path>", "Wiki output directory", ".devpilot/wiki").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = join7(cwd, ".devpilot");
  const wikiDir = join7(cwd, options.wikiDir);
  if (!existsSync7(devpilotDir)) {
    console.log(
      chalk15.yellow("\u26A0\uFE0F  DevPilot not initialized. Run `devpilot init` first.")
    );
    return;
  }
  if (!existsSync7(wikiDir)) {
    mkdirSync3(wikiDir, { recursive: true });
  }
  const indexPath = join7(wikiDir, "index.md");
  if (!existsSync7(indexPath)) {
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
    writeFileSync6(indexPath, initialIndex);
  }
  const logPath = join7(wikiDir, "log.md");
  if (!existsSync7(logPath)) {
    writeFileSync6(
      logPath,
      `# Wiki Activity Log

> Append-only chronicle of wiki operations.

- **${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}** [init] Wiki initialized
`
    );
  }
  const gitignorePath = join7(cwd, ".gitignore");
  if (existsSync7(gitignorePath)) {
    const gitignore = readFileSync4(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/wiki")) {
    }
  }
  console.log(chalk15.green("\u2705 Wiki initialized!"));
  console.log("");
  console.log(chalk15.white("Wiki directory: ") + chalk15.cyan(wikiDir));
  console.log("");
  console.log(chalk15.white("Next steps:"));
  console.log(
    chalk15.gray("  1. ") + chalk15.cyan("devpilot wiki ingest --file <path>") + chalk15.gray(" to add source material")
  );
  console.log(
    chalk15.gray("  2. ") + chalk15.cyan('devpilot wiki query "How does auth work?"') + chalk15.gray(" to ask questions")
  );
  console.log(
    chalk15.gray("  3. ") + chalk15.cyan("devpilot wiki status") + chalk15.gray(" to check wiki health")
  );
  console.log("");
  console.log(
    chalk15.gray(
      "The wiki will grow automatically as agents work \u2014 each session compounds the knowledge base."
    )
  );
});
wikiCommand.command("ingest").description("Ingest a source document into the wiki").requiredOption("--type <type>", "Source type: session_log, commit, spec, decision, manual").requiredOption("--title <title>", "Human-readable title for the source").option("--file <path>", "Path to source file").option("--stdin", "Read source from stdin").option("--origin <origin>", "Origin identifier (e.g. session ID, commit SHA)").action(async (options) => {
  let content;
  if (options.file) {
    if (!existsSync7(options.file)) {
      console.log(chalk15.red(`\u274C File not found: ${options.file}`));
      return;
    }
    content = readFileSync4(options.file, "utf-8");
  } else if (options.stdin) {
    content = readFileSync4(0, "utf-8");
  } else {
    console.log(
      chalk15.red("\u274C Provide either --file <path> or --stdin")
    );
    return;
  }
  const validTypes = ["session_log", "commit", "spec", "decision", "manual"];
  if (!validTypes.includes(options.type)) {
    console.log(
      chalk15.red(
        `\u274C Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`
      )
    );
    return;
  }
  console.log(chalk15.gray(`Ingesting ${options.type}: "${options.title}"...`));
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
    console.log(chalk15.green("\u2705 Ingested successfully!"));
    console.log(
      chalk15.gray(`   Source ID: ${result.sourceId}`)
    );
    if (result.articlesCreated.length > 0) {
      console.log(
        chalk15.white(`   Articles created: `) + chalk15.cyan(result.articlesCreated.join(", "))
      );
    }
    if (result.articlesUpdated.length > 0) {
      console.log(
        chalk15.white(`   Articles updated: `) + chalk15.yellow(result.articlesUpdated.join(", "))
      );
    }
    console.log(
      chalk15.gray(`   Tokens used: ${result.tokensUsed}`)
    );
  } catch (error) {
    console.log(
      chalk15.red(
        `\u274C Ingest failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("query <question>").description("Ask a question against the wiki").action(async (question) => {
  console.log(chalk15.gray(`Searching wiki for: "${question}"...`));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.query(question);
    console.log("");
    console.log(chalk15.white(result.answer));
    console.log("");
    if (result.citedArticles.length > 0) {
      console.log(
        chalk15.gray("Cited: ") + chalk15.cyan(result.citedArticles.map((s) => `[[${s}]]`).join(", "))
      );
    }
    if (result.newArticleSlug) {
      console.log(
        chalk15.green(
          `\u{1F4DD} New article created from this query: [[${result.newArticleSlug}]]`
        )
      );
    }
    console.log(chalk15.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      chalk15.red(
        `\u274C Query failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("lint").description("Check wiki health \u2014 find stale content, orphans, and gaps").action(async () => {
  console.log(chalk15.gray("Linting wiki..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.lint();
    if (result.findings.length === 0) {
      console.log(chalk15.green("\u2705 Wiki is healthy \u2014 no issues found!"));
      return;
    }
    console.log(
      chalk15.yellow(`\u26A0\uFE0F  Found ${result.findings.length} issue(s):
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
        `  ${icon} ${chalk15.white(`[${finding.type}]`)} ${chalk15.cyan(`[[${finding.articleSlug}]]`)}`
      );
      console.log(chalk15.gray(`     ${finding.description}`));
      console.log(chalk15.gray(`     \u2192 ${finding.suggestion}`));
      console.log("");
    }
    if (result.articlesMarkedStale.length > 0) {
      console.log(
        chalk15.yellow(
          `Marked ${result.articlesMarkedStale.length} article(s) as stale.`
        )
      );
    }
    console.log(chalk15.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      chalk15.red(
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
    console.log(chalk15.white.bold("\n\u{1F4DA} Wiki Status\n"));
    console.log(
      chalk15.gray("  Sources:    ") + chalk15.white(String(status.totalSources))
    );
    console.log(
      chalk15.gray("  Articles:   ") + chalk15.white(String(status.totalArticles)) + chalk15.gray(" (") + chalk15.green(`${status.activeArticles} active`) + (status.staleArticles > 0 ? chalk15.yellow(`, ${status.staleArticles} stale`) : "") + (status.archivedArticles > 0 ? chalk15.gray(`, ${status.archivedArticles} archived`) : "") + chalk15.gray(")")
    );
    if (Object.keys(status.categories).length > 0) {
      console.log(chalk15.gray("\n  Categories:"));
      for (const [category, count] of Object.entries(status.categories).sort()) {
        console.log(
          chalk15.gray("    ") + chalk15.cyan(category) + chalk15.gray(": ") + chalk15.white(String(count))
        );
      }
    }
    if (status.lastActivity) {
      console.log(
        chalk15.gray("\n  Last activity: ") + chalk15.white(status.lastActivity.toISOString().split("T")[0])
      );
    }
    console.log("");
  } catch (error) {
    console.log(
      chalk15.red(
        `\u274C Status failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("flush").description("Export wiki to disk as markdown files").action(async () => {
  console.log(chalk15.gray("Flushing wiki to disk..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.flushToDisk();
    console.log(chalk15.green(`\u2705 Wrote ${result.filesWritten} files to ${result.wikiDir}`));
  } catch (error) {
    console.log(
      chalk15.red(
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
      console.log(chalk15.gray("Wiki is empty. Run `devpilot wiki ingest` to add sources."));
      return;
    }
    const byCategory = {};
    for (const entry of index) {
      if (!byCategory[entry.category]) {
        byCategory[entry.category] = [];
      }
      byCategory[entry.category].push(entry);
    }
    console.log(chalk15.white.bold("\n\u{1F4D6} Wiki Index\n"));
    for (const [category, entries] of Object.entries(byCategory).sort()) {
      console.log(
        chalk15.cyan.bold(
          `  ${category.charAt(0).toUpperCase() + category.slice(1)}`
        )
      );
      for (const entry of entries) {
        const statusColor = entry.status === "active" ? chalk15.green : entry.status === "stale" ? chalk15.yellow : chalk15.gray;
        const badge = statusColor(`[${entry.status}]`);
        console.log(
          `    ${badge} ${chalk15.white(entry.title)} ${chalk15.gray(`[[${entry.slug}]]`)}`
        );
      }
      console.log("");
    }
  } catch (error) {
    console.log(
      chalk15.red(
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
      console.log(chalk15.red(`\u274C Article not found: [[${slug}]]`));
      return;
    }
    console.log(chalk15.white.bold(`
# ${article.title}
`));
    console.log(
      chalk15.gray(
        `Category: ${article.category} | Status: ${article.status} | v${article.version}`
      )
    );
    if (article.backlinks.length > 0) {
      console.log(
        chalk15.gray(
          `Related: ${article.backlinks.map((b) => `[[${b}]]`).join(", ")}`
        )
      );
    }
    console.log(chalk15.gray("\u2500".repeat(60)));
    console.log(article.content);
    console.log("");
  } catch (error) {
    console.log(
      chalk15.red(
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
    wikiDir: join7(cwd, ".devpilot", "wiki")
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
var cli = new Command17();
cli.name("devpilot").description("DevPilot CLI - Manage your AI coding agent fleet").version(VERSION);
cli.addCommand(initCommand);
cli.addCommand(setupCommand);
cli.addCommand(serveCommand);
cli.addCommand(statusCommand);
cli.addCommand(configCommand);
cli.addCommand(bridgeCommand);
cli.addCommand(sessionCommand);
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
  cli,
  runCli
};
//# sourceMappingURL=cli.mjs.map