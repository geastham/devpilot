#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/cli.ts
var cli_exports = {};
__export(cli_exports, {
  cli: () => cli,
  runCli: () => runCli
});
module.exports = __toCommonJS(cli_exports);
var import_commander18 = require("commander");
var import_update_notifier = __toESM(require("update-notifier"));

// src/version.ts
var VERSION = "0.5.10";

// src/commands/init.ts
var import_commander = require("commander");
var import_fs = require("fs");
var import_path = require("path");
var import_chalk = __toESM(require("chalk"));
var initCommand = new import_commander.Command("init").description("Initialize DevPilot in the current repository").option("-f, --force", "Overwrite existing configuration").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = (0, import_path.join)(cwd, ".devpilot");
  const configPath = (0, import_path.join)(devpilotDir, "config.yaml");
  if ((0, import_fs.existsSync)(configPath) && !options.force) {
    console.log(
      import_chalk.default.yellow("\u26A0\uFE0F  DevPilot is already initialized in this directory.")
    );
    console.log(import_chalk.default.gray("   Use --force to reinitialize."));
    return;
  }
  if (!(0, import_fs.existsSync)(devpilotDir)) {
    (0, import_fs.mkdirSync)(devpilotDir, { recursive: true });
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
  (0, import_fs.writeFileSync)(configPath, defaultConfig);
  const gitignorePath = (0, import_path.join)(cwd, ".gitignore");
  if ((0, import_fs.existsSync)(gitignorePath)) {
    const gitignore = require("fs").readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/data.db")) {
      const addition = "\n# DevPilot\n.devpilot/data.db\n";
      require("fs").appendFileSync(gitignorePath, addition);
      console.log(import_chalk.default.gray("   Added .devpilot/data.db to .gitignore"));
    }
  }
  console.log(import_chalk.default.green("\u2705 DevPilot initialized successfully!"));
  console.log("");
  console.log(import_chalk.default.white("Next steps:"));
  console.log(import_chalk.default.gray("  1. Run ") + import_chalk.default.cyan("devpilot setup") + import_chalk.default.gray(" to configure Linear and agent-orchestrator"));
  console.log(import_chalk.default.gray("  2. Run ") + import_chalk.default.cyan("devpilot serve") + import_chalk.default.gray(" to start the local UI"));
  console.log(import_chalk.default.gray("  3. Run ") + import_chalk.default.cyan("devpilot status") + import_chalk.default.gray(" to see fleet status"));
});

// src/commands/serve.ts
var import_commander2 = require("commander");
var import_chalk2 = __toESM(require("chalk"));
var import_open = __toESM(require("open"));
var import_child_process = require("child_process");
var import_fs2 = require("fs");
var import_path2 = require("path");
function cockpitEntry() {
  for (const rel of ["../ui/server.js", "../../ui/server.js", "./ui/server.js"]) {
    const entry = (0, import_path2.resolve)(__dirname, rel);
    if ((0, import_fs2.existsSync)(entry)) return entry;
  }
  return null;
}
var serveCommand = new import_commander2.Command("serve").description("Start the local DevPilot Conductor API server").option("-p, --port <port>", "Port to run the server on", "3847").option("--no-open", "Do not open browser automatically").option("--sync", "Enable cloud sync").option("--db <path>", "Path to SQLite database", ".devpilot/data.db").option(
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
  const dbPath = options.db.startsWith("/") ? options.db : (0, import_path2.join)(process.cwd(), options.db);
  console.log(import_chalk2.default.cyan("\u{1F680} Starting DevPilot Conductor..."));
  console.log("");
  console.log(import_chalk2.default.gray(`   Port: ${port}`));
  console.log(import_chalk2.default.gray(`   Database: ${dbPath}`));
  console.log("");
  const dbDir = (0, import_path2.join)(process.cwd(), ".devpilot");
  if (!(0, import_fs2.existsSync)(dbDir)) {
    (0, import_fs2.mkdirSync)(dbDir, { recursive: true });
    console.log(import_chalk2.default.gray(`   Created: ${dbDir}`));
  }
  const entry = cockpitEntry();
  if (!entry) {
    console.error(import_chalk2.default.red("\u2717 The cockpit bundle is missing from this install."));
    console.error("");
    console.error(import_chalk2.default.gray("  Expected: <package>/ui/server.js"));
    console.error(import_chalk2.default.gray("  From a repo checkout, build it with:"));
    console.error(import_chalk2.default.cyan("    pnpm --filter @devpilot.sh/cli bundle:cockpit"));
    console.error("");
    console.error(import_chalk2.default.gray("  If you installed from npm, this is a packaging bug \u2014 please file"));
    console.error(import_chalk2.default.gray("  an issue at https://github.com/geastham/devpilot/issues"));
    process.exit(1);
    return;
  }
  const child = (0, import_child_process.spawn)(process.execPath, [entry], {
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
    process.stdout.write(import_chalk2.default.gray(text.replace(/^/gm, "   ")));
    if (!opened && /Ready in|started server|Local:/i.test(text)) {
      opened = true;
      console.log("");
      console.log(import_chalk2.default.green("\u2713 Cockpit ready"));
      console.log("");
      console.log(import_chalk2.default.cyan(`   ${url}`));
      console.log("");
      console.log(import_chalk2.default.gray("   Press Ctrl+C to stop"));
      console.log("");
      if (options.open) void (0, import_open.default)(url);
    }
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(import_chalk2.default.red(`
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
var import_commander3 = require("commander");
var import_chalk3 = __toESM(require("chalk"));
var statusCommand = new import_commander3.Command("status").description("Show current fleet and runway status").option("-v, --verbose", "Show detailed information").action(async (options) => {
  console.log(import_chalk3.default.cyan("\u{1F4CA} DevPilot Status"));
  console.log("");
  console.log(import_chalk3.default.white("Fleet Status:"));
  console.log(import_chalk3.default.gray("  Active Sessions: ") + import_chalk3.default.green("3"));
  console.log(import_chalk3.default.gray("  Needs Spec: ") + import_chalk3.default.yellow("1"));
  console.log(import_chalk3.default.gray("  Fleet Utilization: ") + import_chalk3.default.cyan("75%"));
  console.log("");
  console.log(import_chalk3.default.white("Runway:"));
  console.log(import_chalk3.default.gray("  Ready Items: ") + import_chalk3.default.green("2"));
  console.log(import_chalk3.default.gray("  Refining: ") + import_chalk3.default.blue("1"));
  console.log(import_chalk3.default.gray("  Shaping: ") + import_chalk3.default.magenta("2"));
  console.log(import_chalk3.default.gray("  Directional: ") + import_chalk3.default.gray("3"));
  console.log(import_chalk3.default.gray("  Runway Hours: ") + import_chalk3.default.green("4.2h"));
  console.log("");
  console.log(import_chalk3.default.white("Conductor Score:"));
  console.log(import_chalk3.default.gray("  Total: ") + import_chalk3.default.magenta("742") + import_chalk3.default.gray("/1000"));
  console.log(import_chalk3.default.gray("  Rank: ") + import_chalk3.default.cyan("#23"));
  if (options.verbose) {
    console.log("");
    console.log(import_chalk3.default.white("Score Breakdown:"));
    console.log(import_chalk3.default.gray("  Fleet Utilization: ") + import_chalk3.default.white("156/200"));
    console.log(import_chalk3.default.gray("  Runway Health: ") + import_chalk3.default.white("148/200"));
    console.log(import_chalk3.default.gray("  Plan Accuracy: ") + import_chalk3.default.white("162/200"));
    console.log(import_chalk3.default.gray("  Cost Efficiency: ") + import_chalk3.default.white("138/200"));
    console.log(import_chalk3.default.gray("  Velocity Trend: ") + import_chalk3.default.white("138/200"));
  }
});

// src/commands/config.ts
var import_commander4 = require("commander");
var import_fs3 = require("fs");
var import_path3 = require("path");
var import_chalk4 = __toESM(require("chalk"));
var import_yaml = __toESM(require("yaml"));
var import_core = require("@devpilot.sh/core");
var linearCommand = new import_commander4.Command("linear").description("Configure Linear integration").option("--api-key <key>", "Linear API key").option("--team-id <id>", "Linear team ID").option("--test", "Test the connection").action(async (options) => {
  const configPath = (0, import_path3.join)(process.cwd(), ".devpilot", "config.yaml");
  if (!(0, import_fs3.existsSync)(configPath)) {
    console.log(import_chalk4.default.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = (0, import_fs3.readFileSync)(configPath, "utf-8");
  const config = import_yaml.default.parse(configContent);
  if (!config.integrations) config.integrations = {};
  if (!config.integrations.linear) config.integrations.linear = {};
  if (options.apiKey) {
    config.integrations.linear.apiKey = options.apiKey;
    (0, import_fs3.writeFileSync)(configPath, import_yaml.default.stringify(config));
    console.log(import_chalk4.default.green("Linear API key saved."));
  }
  if (options.teamId) {
    config.integrations.linear.teamId = options.teamId;
    (0, import_fs3.writeFileSync)(configPath, import_yaml.default.stringify(config));
    console.log(import_chalk4.default.green("Linear team ID saved."));
  }
  if (options.test || options.apiKey && options.teamId) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    if (!apiKey || !teamId) {
      console.log(import_chalk4.default.yellow("Missing API key or team ID. Set both to test connection."));
      return;
    }
    console.log(import_chalk4.default.cyan("Testing Linear connection..."));
    try {
      const client2 = import_core.linear.initLinearClient({ apiKey, teamId });
      const team = await client2.getTeam();
      console.log(import_chalk4.default.green(`Connected to Linear team: ${team.name} (${team.key})`));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(import_chalk4.default.red(`Connection failed: ${message}`));
    }
  }
  if (!options.apiKey && !options.teamId && !options.test) {
    const apiKey = config.integrations.linear.apiKey;
    const teamId = config.integrations.linear.teamId;
    console.log(import_chalk4.default.cyan("Linear Configuration:"));
    console.log(`  API Key: ${apiKey ? import_chalk4.default.green("configured") : import_chalk4.default.yellow("not set")}`);
    console.log(`  Team ID: ${teamId || import_chalk4.default.yellow("not set")}`);
  }
});
var configCommand = new import_commander4.Command("config").description("Manage DevPilot configuration").argument("[key]", "Configuration key (e.g., ui.port)").argument("[value]", "Value to set").option("-l, --list", "List all configuration").action(async (key, value, options) => {
  const configPath = (0, import_path3.join)(process.cwd(), ".devpilot", "config.yaml");
  if (!(0, import_fs3.existsSync)(configPath)) {
    console.log(import_chalk4.default.red('\u274C DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  const configContent = (0, import_fs3.readFileSync)(configPath, "utf-8");
  const config = import_yaml.default.parse(configContent);
  if (options.list || !key && !value) {
    console.log(import_chalk4.default.cyan("DevPilot Configuration:"));
    console.log("");
    console.log(import_yaml.default.stringify(config));
    return;
  }
  if (key && !value) {
    const keys = key.split(".");
    let current = config;
    for (const k of keys) {
      if (current && typeof current === "object" && k in current) {
        current = current[k];
      } else {
        console.log(import_chalk4.default.red(`\u274C Key "${key}" not found.`));
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
    (0, import_fs3.writeFileSync)(configPath, import_yaml.default.stringify(config));
    console.log(import_chalk4.default.green(`\u2705 Set ${key} = ${JSON.stringify(parsedValue)}`));
  }
}).addCommand(linearCommand);

// src/commands/setup.ts
var import_commander5 = require("commander");
var import_fs5 = require("fs");
var import_path5 = require("path");
var import_chalk6 = __toESM(require("chalk"));
var import_yaml2 = __toESM(require("yaml"));
var readline = __toESM(require("readline"));
var import_core2 = require("@devpilot.sh/core");

// src/utils/orchestrator.ts
var import_child_process2 = require("child_process");
var import_fs4 = require("fs");
var import_path4 = require("path");
var import_os = require("os");
var import_chalk5 = __toESM(require("chalk"));
function checkCommand(cmd, versionArg = "--version") {
  try {
    const result = (0, import_child_process2.spawnSync)(cmd, [versionArg], { encoding: "utf-8", stdio: "pipe" });
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
      const result = (0, import_child_process2.spawnSync)("gh", ["auth", "status"], { encoding: "utf-8", stdio: "pipe" });
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
  console.log(import_chalk5.default.cyan("\nSystem Requirements:"));
  console.log("");
  if (reqs.node.installed && reqs.node.meetsMinimum) {
    console.log(import_chalk5.default.green(`  \u2713 Node.js ${reqs.node.version}`));
  } else if (reqs.node.installed) {
    console.log(import_chalk5.default.yellow(`  \u26A0 Node.js ${reqs.node.version} (requires 20.0.0+)`));
  } else {
    console.log(import_chalk5.default.red("  \u2717 Node.js not found"));
  }
  if (reqs.git.installed && reqs.git.meetsMinimum) {
    console.log(import_chalk5.default.green(`  \u2713 Git ${reqs.git.version}`));
  } else if (reqs.git.installed) {
    console.log(import_chalk5.default.yellow(`  \u26A0 Git ${reqs.git.version} (requires 2.25.0+)`));
  } else {
    console.log(import_chalk5.default.red("  \u2717 Git not found"));
  }
  if (reqs.tmux.installed) {
    console.log(import_chalk5.default.green("  \u2713 tmux"));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 tmux not found (optional, for session management)"));
  }
  if (reqs.gh.installed && reqs.gh.authenticated) {
    console.log(import_chalk5.default.green("  \u2713 GitHub CLI (authenticated)"));
  } else if (reqs.gh.installed) {
    console.log(import_chalk5.default.yellow("  \u26A0 GitHub CLI (not authenticated - run: gh auth login)"));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 GitHub CLI not found (optional, for PR creation)"));
  }
  if (reqs.rtk.installed) {
    console.log(import_chalk5.default.green(`  \u2713 RTK ${reqs.rtk.version || ""} (token optimization)`));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 RTK not found (recommended, for 60-90% token savings)"));
  }
  if (reqs.caveman.installed) {
    console.log(import_chalk5.default.green("  \u2713 Caveman plugin (output token compression)"));
  } else {
    console.log(import_chalk5.default.yellow("  \u26A0 Caveman not found (optional, for ~65-75% output token savings)"));
  }
}
function isOrchestratorInstalled() {
  try {
    const result = (0, import_child_process2.spawnSync)("npx", ["@composio/ao-cli", "--version"], {
      encoding: "utf-8",
      stdio: "pipe"
    });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installOrchestrator() {
  console.log(import_chalk5.default.cyan("\nInstalling @composio/ao-cli..."));
  try {
    (0, import_child_process2.execSync)("npm install -g @composio/ao-cli", { stdio: "inherit" });
    console.log(import_chalk5.default.green("\u2713 @composio/ao-cli installed successfully"));
    return true;
  } catch {
    console.log(import_chalk5.default.red("\u2717 Failed to install @composio/ao-cli"));
    console.log(import_chalk5.default.gray("  Try manually: npm install -g @composio/ao-cli"));
    return false;
  }
}
function isRtkInstalled() {
  try {
    const result = (0, import_child_process2.spawnSync)("rtk", ["--version"], { encoding: "utf-8", stdio: "pipe" });
    return result.status === 0;
  } catch {
    return false;
  }
}
function installRtk() {
  const hasCargo = (0, import_child_process2.spawnSync)("cargo", ["--version"], { encoding: "utf-8", stdio: "pipe" }).status === 0;
  if (hasCargo) {
    console.log(import_chalk5.default.cyan("\n  Installing RTK via cargo (this may take a few minutes)..."));
    try {
      (0, import_child_process2.execSync)("cargo install --git https://github.com/rtk-ai/rtk", { stdio: "inherit" });
      console.log(import_chalk5.default.green("  \u2713 RTK installed successfully"));
      return true;
    } catch {
      console.log(import_chalk5.default.red("  \u2717 Failed to install RTK via cargo"));
    }
  }
  console.log(import_chalk5.default.cyan("\n  Installing RTK via install script..."));
  try {
    (0, import_child_process2.execSync)("curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh", {
      stdio: "inherit"
    });
    console.log(import_chalk5.default.green("  \u2713 RTK installed successfully"));
    return true;
  } catch {
    console.log(import_chalk5.default.red("  \u2717 Failed to install RTK"));
    console.log(import_chalk5.default.gray("  Install manually: cargo install --git https://github.com/rtk-ai/rtk"));
    console.log(import_chalk5.default.gray("  Or: brew install rtk"));
    return false;
  }
}
function initRtkHook() {
  console.log(import_chalk5.default.cyan("\n  Initializing RTK hook for Claude Code..."));
  try {
    (0, import_child_process2.execSync)("rtk init -g", { encoding: "utf-8", stdio: "pipe" });
    console.log(import_chalk5.default.green("  \u2713 RTK hook initialized"));
    return true;
  } catch {
    console.log(import_chalk5.default.yellow("  \u26A0 RTK hook init requires manual step: rtk init -g"));
    return false;
  }
}
function isCavemanInstalled() {
  const claudeDir = (0, import_path4.join)((0, import_os.homedir)(), ".claude");
  if ((0, import_fs4.existsSync)((0, import_path4.join)(claudeDir, "hooks", "caveman-activate.js"))) {
    return true;
  }
  const settingsPath = (0, import_path4.join)(claudeDir, "settings.json");
  if ((0, import_fs4.existsSync)(settingsPath)) {
    try {
      const settings = JSON.parse((0, import_fs4.readFileSync)(settingsPath, "utf-8"));
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
  console.log(import_chalk5.default.cyan("\n  Installing Caveman plugin for Claude Code..."));
  try {
    (0, import_child_process2.execSync)("npx -y skills add JuliusBrussee/caveman", {
      stdio: "inherit",
      timeout: 12e4
    });
    console.log(import_chalk5.default.green("  \u2713 Caveman plugin installed successfully"));
    return true;
  } catch {
    console.log(import_chalk5.default.yellow("  npx skills add failed, trying hook install script..."));
    try {
      (0, import_child_process2.execSync)(
        "bash <(curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/hooks/install.sh)",
        { stdio: "inherit", shell: "/bin/bash", timeout: 6e4 }
      );
      console.log(import_chalk5.default.green("  \u2713 Caveman hooks installed successfully"));
      return true;
    } catch {
      console.log(import_chalk5.default.red("  \u2717 Failed to install Caveman plugin"));
      console.log(import_chalk5.default.gray("  Install manually: npx skills add JuliusBrussee/caveman"));
      return false;
    }
  }
}
function detectRepoInfo(cwd) {
  try {
    const remoteResult = (0, import_child_process2.spawnSync)("git", ["remote", "get-url", "origin"], {
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
    const branchResult = (0, import_child_process2.spawnSync)("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
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
  const projectName = (0, import_path4.basename)(cwd);
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
  const YAML3 = require("yaml");
  const configPath = (0, import_path4.join)(cwd, "agent-orchestrator.yaml");
  const yamlContent = YAML3.stringify(config);
  (0, import_fs4.writeFileSync)(configPath, yamlContent);
}
function orchestratorConfigExists(cwd) {
  return (0, import_fs4.existsSync)((0, import_path4.join)(cwd, "agent-orchestrator.yaml"));
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
var setupCommand = new import_commander5.Command("setup").description("Interactive setup wizard for DevPilot and agent-orchestrator").option("--linear-only", "Only configure Linear integration").option("--orchestrator-only", "Only configure agent-orchestrator").option("--check", "Only check system requirements").option("-y, --yes", "Accept all defaults (non-interactive mode)").action(async (options) => {
  const nonInteractive = options.yes;
  const cwd = process.cwd();
  const configPath = (0, import_path5.join)(cwd, ".devpilot", "config.yaml");
  if (!(0, import_fs5.existsSync)(configPath)) {
    console.log(import_chalk6.default.red('DevPilot not initialized. Run "devpilot init" first.'));
    return;
  }
  console.log(import_chalk6.default.bold.cyan("\n DevPilot Setup Wizard\n"));
  console.log(import_chalk6.default.gray("This wizard will help you configure DevPilot and agent-orchestrator.\n"));
  console.log(import_chalk6.default.bold("Step 1: Checking System Requirements"));
  const reqs = checkSystemRequirements();
  printRequirementsStatus(reqs);
  if (!reqs.node.meetsMinimum) {
    console.log(import_chalk6.default.red("\nNode.js 20+ is required. Please upgrade and try again."));
    return;
  }
  if (!reqs.git.meetsMinimum) {
    console.log(import_chalk6.default.red("\nGit 2.25+ is required. Please upgrade and try again."));
    return;
  }
  const instructions = getInstallInstructions(reqs);
  if (instructions.length > 0) {
    console.log(import_chalk6.default.yellow("\nOptional installations:"));
    instructions.forEach((inst) => console.log(import_chalk6.default.gray(`  - ${inst}`)));
  }
  if (options.check) {
    return;
  }
  console.log("");
  if (!options.orchestratorOnly) {
    console.log(import_chalk6.default.bold("Step 2: Linear Integration"));
    console.log(import_chalk6.default.gray("Linear integration enables ticket tracking and auto-status updates.\n"));
    const configContent = (0, import_fs5.readFileSync)(configPath, "utf-8");
    const config = import_yaml2.default.parse(configContent);
    const existingApiKey = config.integrations?.linear?.apiKey;
    const existingTeamId = config.integrations?.linear?.teamId;
    if (existingApiKey && existingTeamId) {
      console.log(import_chalk6.default.green("  Linear is already configured."));
      if (!nonInteractive) {
        const reconfigure = await confirm("  Reconfigure Linear?", false);
        if (reconfigure) {
          await configureLinear(configPath, config);
        }
      }
      console.log("");
    } else if (nonInteractive) {
      console.log(import_chalk6.default.gray("  Skipping Linear setup (non-interactive mode).\n"));
    } else {
      const setupLinear = await confirm("  Would you like to set up Linear integration?");
      if (setupLinear) {
        await configureLinear(configPath, config);
      } else {
        console.log(import_chalk6.default.gray("  Skipping Linear setup.\n"));
      }
    }
  }
  if (!options.linearOnly) {
    console.log(import_chalk6.default.bold("Step 3: Agent Orchestrator"));
    console.log(import_chalk6.default.gray("Agent orchestrator manages parallel AI coding agents.\n"));
    const installed = isOrchestratorInstalled();
    if (!installed) {
      console.log(import_chalk6.default.yellow("  @composio/ao-cli is not installed."));
      if (nonInteractive) {
        console.log(import_chalk6.default.gray("  Skipping installation (non-interactive mode)."));
        console.log(import_chalk6.default.gray("  Install later with: npm install -g @composio/ao-cli\n"));
      } else {
        const install = await confirm("  Install @composio/ao-cli globally?");
        if (install) {
          const success = installOrchestrator();
          if (!success) {
            console.log(import_chalk6.default.yellow("  Continuing without agent-orchestrator CLI...\n"));
          }
        } else {
          console.log(import_chalk6.default.gray("  Skipping installation. You can install later with:"));
          console.log(import_chalk6.default.cyan("    npm install -g @composio/ao-cli\n"));
        }
      }
    } else {
      console.log(import_chalk6.default.green("  @composio/ao-cli is installed."));
    }
    if (orchestratorConfigExists(cwd)) {
      console.log(import_chalk6.default.green("  agent-orchestrator.yaml already exists."));
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
          console.log(import_chalk6.default.gray("  Skipping config generation.\n"));
        }
      }
    }
  }
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(import_chalk6.default.bold("Step 4: RTK Token Optimization"));
    console.log(import_chalk6.default.gray("RTK reduces LLM token consumption by 60-90% across fleet agents.\n"));
    const rtkInstalled = isRtkInstalled();
    if (rtkInstalled) {
      console.log(import_chalk6.default.green("  RTK is already installed."));
      console.log(import_chalk6.default.gray("  Ensuring Claude Code hook is configured..."));
      initRtkHook();
    } else if (nonInteractive) {
      console.log(import_chalk6.default.gray("  Installing RTK (non-interactive mode)..."));
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
        console.log(import_chalk6.default.gray("  Skipping RTK installation. Install later with:"));
        console.log(import_chalk6.default.cyan("    cargo install --git https://github.com/rtk-ai/rtk"));
        console.log(import_chalk6.default.cyan("    rtk init -g\n"));
      }
    }
    console.log("");
  }
  if (!options.linearOnly && !options.orchestratorOnly) {
    console.log(import_chalk6.default.bold("Step 5: Caveman Output Compression"));
    console.log(import_chalk6.default.gray("Caveman reduces output token usage by ~65-75% across fleet agents.\n"));
    const cavemanInstalled = isCavemanInstalled();
    if (cavemanInstalled) {
      console.log(import_chalk6.default.green("  Caveman plugin is already installed."));
      console.log(import_chalk6.default.gray("  Activate in any session with /caveman (modes: lite, full, ultra)"));
    } else if (nonInteractive) {
      console.log(import_chalk6.default.gray("  Installing Caveman plugin (non-interactive mode)..."));
      installCaveman();
    } else {
      const install = await confirm("  Install Caveman plugin for compressed agent output?");
      if (install) {
        installCaveman();
      } else {
        console.log(import_chalk6.default.gray("  Skipping Caveman installation. Install later with:"));
        console.log(import_chalk6.default.cyan("    npx skills add JuliusBrussee/caveman\n"));
      }
    }
    console.log("");
  }
  console.log(import_chalk6.default.bold.green("\nSetup Complete!\n"));
  console.log(import_chalk6.default.white("Next steps:"));
  console.log(import_chalk6.default.gray("  1. Run ") + import_chalk6.default.cyan("devpilot serve") + import_chalk6.default.gray(" to start the UI"));
  console.log(import_chalk6.default.gray("  2. Run ") + import_chalk6.default.cyan("ao start") + import_chalk6.default.gray(" to start agent orchestrator"));
  console.log(import_chalk6.default.gray("  3. Use the UI to create items and dispatch to the fleet"));
  console.log(import_chalk6.default.gray("  4. Run ") + import_chalk6.default.cyan("rtk gain") + import_chalk6.default.gray(" to monitor token savings"));
  console.log(import_chalk6.default.gray("  5. Use ") + import_chalk6.default.cyan("/caveman") + import_chalk6.default.gray(" in sessions for compressed output\n"));
});
async function configureLinear(configPath, config) {
  console.log("");
  console.log(import_chalk6.default.gray("  Get your API key from: https://linear.app/settings/api\n"));
  const apiKey = await prompt("  Linear API key: ");
  if (!apiKey) {
    console.log(import_chalk6.default.yellow("  No API key provided. Skipping Linear setup.\n"));
    return;
  }
  console.log(import_chalk6.default.cyan("\n  Connecting to Linear..."));
  try {
    const tempClient = import_core2.linear.initLinearClient({ apiKey, teamId: "" });
    const teams = await tempClient.getTeams();
    if (teams.length === 0) {
      console.log(import_chalk6.default.yellow("  No teams found. Make sure you have access to at least one team."));
      return;
    }
    console.log(import_chalk6.default.green(`  Found ${teams.length} team(s):
`));
    teams.forEach((team, i) => {
      console.log(import_chalk6.default.white(`    ${i + 1}. ${team.name} (${team.key})`));
    });
    const teamChoice = await prompt("\n  Select team number: ");
    const teamIndex = parseInt(teamChoice, 10) - 1;
    if (isNaN(teamIndex) || teamIndex < 0 || teamIndex >= teams.length) {
      console.log(import_chalk6.default.yellow("  Invalid selection. Skipping Linear setup."));
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
    (0, import_fs5.writeFileSync)(configPath, import_yaml2.default.stringify(config));
    console.log(import_chalk6.default.green(`
  Linear configured for team: ${selectedTeam.name}
`));
    console.log(import_chalk6.default.gray("  For agent-orchestrator, also set the LINEAR_API_KEY environment variable:"));
    console.log(import_chalk6.default.cyan(`    export LINEAR_API_KEY="${apiKey}"
`));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(import_chalk6.default.red(`  Failed to connect: ${message}`));
    console.log(import_chalk6.default.gray("  You can configure Linear later with: devpilot config linear\n"));
  }
}
async function configureOrchestrator(cwd, configPath, nonInteractive = false) {
  const config = import_yaml2.default.parse((0, import_fs5.readFileSync)(configPath, "utf-8"));
  const linearTeamId = config.integrations?.linear?.teamId;
  const aoConfig = generateOrchestratorConfig({
    cwd,
    linearTeamId
  });
  if (!nonInteractive) {
    const customRules = await confirm("\n  Would you like to customize agent rules?", false);
    if (customRules) {
      console.log(import_chalk6.default.gray("  Enter rules (one per line, empty line to finish):"));
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
  console.log(import_chalk6.default.green("\n  Created agent-orchestrator.yaml"));
  console.log(import_chalk6.default.gray("\n  Configuration preview:"));
  console.log(import_chalk6.default.gray("  " + "-".repeat(40)));
  const preview = import_yaml2.default.stringify(aoConfig).split("\n").slice(0, 15).join("\n");
  preview.split("\n").forEach((line) => console.log(import_chalk6.default.gray(`  ${line}`)));
  console.log(import_chalk6.default.gray("  ...\n"));
}

// src/commands/bridge.ts
var import_commander9 = require("commander");

// src/commands/bridge/connect.ts
var import_os2 = __toESM(require("os"));
var import_commander6 = require("commander");
var import_chalk10 = __toESM(require("chalk"));
var import_bridge_client = require("@devpilot.sh/bridge-client");

// src/commands/bridge/dispatch-handler.ts
var import_core3 = require("@devpilot.sh/core");
var inFlight = /* @__PURE__ */ new Map();
function service(opts) {
  const existing = import_core3.orchestrator.getOrchestratorServiceOrNull();
  if (existing) return existing;
  return import_core3.orchestrator.initOrchestratorService({
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
  if (import_core3.orchestrator.isStatusPollerInitialized()) return;
  const log = opts.onLog ?? (() => {
  });
  const poller = import_core3.orchestrator.initStatusPoller(svc, {
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
      const request = import_core3.orchestrator.buildDispatchRequest({
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
      import_core3.orchestrator.getStatusPoller().trackSession(sessionId, response.orchestratorJobId ?? sessionId);
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

// src/commands/bridge/connect.ts
var import_node_os2 = require("os");
var import_node_path4 = require("path");
var import_node_fs4 = require("fs");

// src/commands/bridge/conductor-watcher.ts
var import_node_fs = require("fs");
var import_node_path = require("path");
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
    return o.filesChanged ? `${head}

**No files were changed.** Worth checking whether the plan matched the intent.` : head;
  }
  const shown = files.slice(0, MAX_LISTED_FILES).map((f) => `- \`${f}\``);
  const more = files.length > MAX_LISTED_FILES ? `
- \u2026and ${files.length - MAX_LISTED_FILES} more` : "";
  return `${head}

**${files.length} file${files.length === 1 ? "" : "s"} changed**
${shown.join("\n")}${more}`;
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
${lines.join("\n")}`;
  }
  return last ? `${head}

${last}` : head;
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
    if (!path || !(0, import_node_fs.existsSync)(path)) return 0;
    let entries = [];
    try {
      const parsed = JSON.parse((0, import_node_fs.readFileSync)(path, "utf8"));
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
      let costUsd = 0;
      let estimated = false;
      let elapsedMs = 0;
      let idleMs = Number.MAX_SAFE_INTEGER;
      let action;
      for (const s of sessions) {
        const t = s.telemetry;
        if (!t) continue;
        toolCalls += t.toolCalls ?? 0;
        costUsd += t.costUsd ?? 0;
        estimated = estimated || Boolean(t.costIsEstimate);
        elapsedMs = Math.max(elapsedMs, t.elapsedMs ?? 0);
        idleMs = Math.min(idleMs, t.idleMs ?? Number.MAX_SAFE_INTEGER);
        for (const f of t.filesTouched ?? []) files.add(f);
        if (!action && t.lastAction) {
          const file = t.lastAction.path?.split("/").slice(-1)[0];
          action = t.lastAction.tool === "Bash" ? (t.commands?.at(-1) ?? "shell").split(/\s+/).slice(0, 3).join(" ") : `${t.lastAction.tool.toLowerCase()}${file ? ` ${file}` : ""}`;
        }
      }
      if (toolCalls === 0 && files.size === 0) return;
      await this.opts.client.reportTelemetry(run.sessionId, {
        toolCalls,
        filesTouched: [...files],
        currentAction: action,
        costUsd: costUsd > 0 ? costUsd : void 0,
        costEstimated: estimated,
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
        if ((0, import_node_fs.existsSync)(path)) (0, import_node_fs.unlinkSync)(path);
        return;
      }
      (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(path), { recursive: true });
      (0, import_node_fs.writeFileSync)(path, JSON.stringify([...this.runs.values()], null, 2), "utf8");
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
      await this.apply(command);
    }
  }
  async apply(command) {
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
var import_node_fs3 = require("fs");
var import_node_path2 = require("path");

// src/commands/bridge/transcript-tail.ts
var import_node_fs2 = require("fs");
var IDLE_MS = 5 * 60 * 1e3;
var PAUSE_BEAT_MS = 30 * 1e3;
function initialTailState() {
  return { byteOffset: 0, remainder: "", seq: 0, lastEventMs: null, activeMs: 0 };
}
function pathFromCommand(command) {
  if (typeof command !== "string") return null;
  const m = command.match(/[\w./-]+\.(?:ts|tsx|js|jsx|py|sql|md|json|css|sh|mjs|go|rs)\b/);
  return m ? m[0] : null;
}
function tailTranscript(transcriptPath, state, cwd) {
  let fd;
  try {
    fd = (0, import_node_fs2.openSync)(transcriptPath, "r");
  } catch {
    return [];
  }
  let chunk;
  try {
    const size = (0, import_node_fs2.fstatSync)(fd).size;
    if (size < state.byteOffset) {
      state.byteOffset = 0;
      state.remainder = "";
    }
    if (size === state.byteOffset) {
      return [];
    }
    const buf = Buffer.alloc(size - state.byteOffset);
    (0, import_node_fs2.readSync)(fd, buf, 0, buf.length, state.byteOffset);
    state.byteOffset = size;
    chunk = state.remainder + buf.toString("utf8");
  } finally {
    (0, import_node_fs2.closeSync)(fd);
  }
  const lines = chunk.split("\n");
  state.remainder = lines.pop() ?? "";
  const events = [];
  for (const line of lines) {
    if (!line) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type !== "assistant") continue;
    const ms = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (!Number.isFinite(ms)) continue;
    for (const block of o.message?.content ?? []) {
      if (block.type !== "tool_use" || !block.name) continue;
      const input = block.input ?? {};
      let path = typeof input.file_path === "string" && input.file_path || typeof input.path === "string" && input.path || typeof input.notebook_path === "string" && input.notebook_path || null;
      if (!path && block.name === "Bash") path = pathFromCommand(input.command);
      if (path && cwd && path.startsWith(cwd)) path = path.slice(cwd.length + 1);
      if (path && path.startsWith("/")) path = null;
      if (state.lastEventMs !== null) {
        const gap = ms - state.lastEventMs;
        state.activeMs += gap >= IDLE_MS ? PAUSE_BEAT_MS : Math.max(gap, 0);
      }
      state.lastEventMs = ms;
      events.push({
        seq: state.seq++,
        t: Math.round(state.activeMs / 1e3),
        tool: block.name,
        path
      });
    }
  }
  return events;
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
      if (!(0, import_node_fs3.existsSync)(this.config.statePath)) return 0;
      const parsed = JSON.parse((0, import_node_fs3.readFileSync)(this.config.statePath, "utf8"));
      if (parsed?.version !== 1 || !parsed.entries) return 0;
      let restored = 0;
      for (const entry of Object.values(parsed.entries)) {
        if (entry.settled) continue;
        if (!(0, import_node_fs3.existsSync)(entry.transcriptPath)) continue;
        this.entries.set(entry.adoptionKey, entry);
        restored++;
      }
      if (restored > 0) this.start();
      return restored;
    } catch {
      return 0;
    }
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
        mtimeMs = (0, import_node_fs3.statSync)(entry.transcriptPath).mtimeMs;
      } catch {
        this.entries.delete(entry.adoptionKey);
        this.persist();
        continue;
      }
      const neverDerived = entry.tail === void 0;
      if (mtimeMs > entry.lastMtimeMs || neverDerived) {
        const grew = mtimeMs > entry.lastMtimeMs;
        entry.lastMtimeMs = mtimeMs;
        entry.lastReportedAt = new Date(now).toISOString();
        const canStream = typeof this.config.client.streamEvents === "function";
        entry.tail ?? (entry.tail = initialTailState());
        const derived = canStream ? tailTranscript(entry.transcriptPath, entry.tail, entry.cwd) : [];
        this.persist();
        if (derived.length > 0) {
          const sent = await this.config.client.streamEvents(entry.sessionId, derived);
          if (!sent) {
            this.config.onLog?.(`stream for ${entry.identifier} did not land; will catch up next tick`);
          }
          const latest = derived[derived.length - 1];
          const files = /* @__PURE__ */ new Set();
          for (const e of derived) if (e.path) files.add(e.path);
          if (typeof this.config.client.reportTelemetry === "function")
            await this.config.client.reportTelemetry(entry.sessionId, {
              toolCalls: entry.tail.seq,
              filesTouched: [...files].slice(0, 500),
              currentAction: latest.path ? `${latest.tool} \xB7 ${latest.path.split("/").slice(-2).join("/")}` : latest.tool,
              elapsedMs: Math.round(entry.tail.activeMs),
              // mtimeMs is fractional on macOS; the schema's int() refuses a
              // float and the client swallows the 400 — a silently empty table.
              idleMs: Math.round(Math.max(0, now - mtimeMs))
            });
        }
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
      (0, import_node_fs3.mkdirSync)((0, import_node_path2.dirname)(this.config.statePath), { recursive: true });
      const ledger = { version: 1, entries: Object.fromEntries(this.entries) };
      (0, import_node_fs3.writeFileSync)(this.config.statePath, JSON.stringify(ledger, null, 2), "utf8");
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
var import_chalk8 = __toESM(require("chalk"));

// src/commands/sessions/scan-pipeline.ts
var import_node_os = require("os");
var import_node_path3 = require("path");
var import_chalk7 = __toESM(require("chalk"));
var import_core4 = require("@devpilot.sh/core");
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
  const scan = import_core4.adoption.scanSessions({
    machineName: options.machineName,
    repos,
    // `--repo x` is an explicit narrowing, so it must not be widened by
    // `--all-repos` arriving from a config file or an alias.
    allRepos: options.onlyRepo ? false : options.allRepos,
    sinceMs: options.sinceMs,
    includePaths: options.includePaths,
    excludeSessionUuids: import_core4.adoption.loadOwnedSessionIds(
      (0, import_node_path3.join)((0, import_node_os.homedir)(), ".devpilot", "owned-sessions.json")
    )
  });
  let modelTitles = 0;
  if (options.summarize && scan.candidates.length > 0) {
    const jobs = scan.candidates.filter((c) => !options.skipSummaryFor?.has(c.adoptionKey)).map((candidate) => {
      const observation = observationFor(candidate, scan);
      return observation ? { candidate, observation } : null;
    }).filter((j) => j !== null);
    const summaries = await import_core4.adoption.summarizeSessions(
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
    withheldOwners: import_core4.adoption.withheldOwners(scan.skipped),
    modelTitles,
    transcriptPaths: scan.transcriptPaths
  };
}
function observationFor(candidate, scan) {
  const path = scan.transcriptPaths?.get(candidate.adoptionKey);
  if (!path) return null;
  return import_core4.adoption.probeTranscript(path.transcriptPath, path.sessionUuid);
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
    import_chalk7.default.gray(
      `  Scanned ${result.projectDirCount} project director${result.projectDirCount === 1 ? "y" : "ies"} \xB7 ${result.candidates.length} session${result.candidates.length === 1 ? "" : "s"} in scope`
    )
  );
  lines.push("");
  if (rows.length > 0) {
    lines.push(
      import_chalk7.default.gray(`  ${pad("REPO", 30)} ${pad("SESSION", 44)} ${pad("LAST", 6)} \u2192 BOARD`)
    );
    for (const row of rows) {
      lines.push(
        `  ${import_chalk7.default.cyan(pad(row.repo, 30))} ${pad(row.title, 44)} ${row.live ? import_chalk7.default.green(pad(relativeAge(row.lastActivityAt), 5)) + "\u25CF" : import_chalk7.default.gray(pad(relativeAge(row.lastActivityAt), 6))} \u2192 ${row.destination}`
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
    lines.push(import_chalk7.default.gray(`  Skipped: ${parts.join(", ")}`));
    if (reasons.has("not-routed")) {
      lines.push(import_chalk7.default.gray("           Run with --all-repos to include the others."));
    }
  }
  return lines.join("\n");
}

// src/commands/bridge/observer.ts
var DEFAULT_INTERVAL_MS = 6e4;
var DEFAULT_SINCE_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_SUMMARISE_BUDGET = 10;
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
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.sinceMs = config.sinceMs ?? DEFAULT_SINCE_MS;
    this.summariseBudget = config.summariseBudget ?? DEFAULT_SUMMARISE_BUDGET;
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
      result.candidates.forEach((c) => this.seen.add(c.adoptionKey));
      const live = new Set(result.candidates.filter((c) => c.live).map((c) => c.adoptionKey));
      const ended = [...this.lastLive].filter((key) => !live.has(key));
      const response = await this.config.client.reportObservations({
        machineName: this.config.machineName,
        sessions: result.candidates,
        endedKeys: ended
      });
      this.lastLive = live;
      if (response) {
        return { observed: response.observed, ended: response.ended };
      }
      return null;
    } catch (err) {
      this.config.onLog?.(
        import_chalk8.default.gray(`observation sweep failed: ${err instanceof Error ? err.message : err}`)
      );
      return null;
    } finally {
      this.running = false;
    }
  }
};

// src/commands/bridge/introspect.ts
var import_chalk9 = __toESM(require("chalk"));
var import_core5 = require("@devpilot.sh/core");
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
      onWarn: (line) => console.log(import_chalk9.default.gray(`   ${line}`))
    });
  } catch (err) {
    console.log(import_chalk9.default.gray(`   Could not look around this machine: ${describe2(err)}`));
    return;
  }
  if (result.projectDirCount === 0) {
    return;
  }
  const live = result.discovered.reduce((n, r) => n + r.liveSessionCount, 0);
  const owners = import_core5.adoption.groupByOwner(result.discovered);
  console.log(
    import_chalk9.default.cyan(
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
      `     ${import_chalk9.default.bold(owner.padEnd(18))} ${String(repos.length).padStart(2)} repo${repos.length === 1 ? " " : "s"}   ${String(sessions).padStart(4)} session${sessions === 1 ? " " : "s"}` + (liveHere > 0 ? import_chalk9.default.green(`   \u25CF ${liveHere} live`) : "")
    );
  }
  if (sorted.length > 8) {
    console.log(import_chalk9.default.gray(`     \u2026 and ${sorted.length - 8} more`));
  }
  console.log("");
  const discovery = await options.client.reportDiscovery({
    machineName: options.machineName,
    repos: result.discovered,
    unmappedProjectCount: result.unmappedProjectCount
  });
  if (discovery && discovery.proposed > 0) {
    console.log(
      import_chalk9.default.gray(
        `     ${discovery.proposed} repo${discovery.proposed === 1 ? "" : "s"} not yet routed \u2014 review at ${options.client.hostedUrl()}/fleet/discovered`
      )
    );
    console.log("");
  } else if (!discovery) {
    console.log(import_chalk9.default.gray("     (could not report the inventory \u2014 the bridge is still fine)"));
    console.log("");
  }
  if (live > 0 && !options.adopt) {
    console.log(
      import_chalk9.default.gray(
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
      import_chalk9.default.green(
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
        import_chalk9.default.gray(
          `     Watching ${options.watcher.size()} of them. They are observed, not dispatched \u2014 no ticket will be moved.`
        )
      );
    }
    console.log("");
  } catch (err) {
    console.log(import_chalk9.default.yellow(`   Could not adopt: ${describe2(err)}`));
    console.log("");
  }
}
function describe2(err) {
  return err instanceof Error ? err.message : String(err);
}

// src/commands/bridge/connect.ts
function stableMachineName() {
  const path = (0, import_node_path4.join)((0, import_node_os2.homedir)(), ".devpilot", "machine.json");
  try {
    if ((0, import_node_fs4.existsSync)(path)) {
      const saved = JSON.parse((0, import_node_fs4.readFileSync)(path, "utf8"));
      if (saved.name) return saved.name;
    }
  } catch {
  }
  const name = import_os2.default.hostname();
  try {
    (0, import_node_fs4.mkdirSync)((0, import_node_path4.dirname)(path), { recursive: true });
    (0, import_node_fs4.writeFileSync)(path, JSON.stringify({ name }, null, 2), "utf8");
  } catch {
  }
  return name;
}
var connectCommand = new import_commander6.Command("connect").description("Connect this machine to a DevPilot bridge and run dispatched work locally").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-n, --name <name>", "Name for this machine (defaults to a stable name for this machine)").option("-r, --repos <repos>", "Comma-separated repos this machine handles").option("-m, --mode <mode>", "Local orchestrator mode (http|claude-session)", "http").option(
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
).option("--no-discover", "Do not report which repos this machine has agent history for").option(
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
  if (!options.url) {
    console.error(import_chalk10.default.red("\u2717 Bridge URL required (--url or DEVPILOT_BRIDGE_URL)"));
    process.exit(1);
  }
  if (!options.token) {
    console.error(import_chalk10.default.red("\u2717 Token required (--token or DEVPILOT_BRIDGE_TOKEN)"));
    console.error(import_chalk10.default.gray("  Mint one in the dashboard under Settings \u2192 Tokens."));
    process.exit(1);
  }
  const repos = options.repos?.split(",").map((r) => r.trim()).filter(Boolean) ?? [];
  const maxConcurrentJobs = Math.max(1, parseInt(options.maxJobs, 10) || 4);
  console.log(import_chalk10.default.cyan("\u{1F309} DevPilot bridge"));
  console.log(import_chalk10.default.gray(`   ${options.url}`));
  console.log(import_chalk10.default.gray(`   machine: ${options.name}`));
  console.log("");
  const usesLocalOrchestrator = !options.plan;
  if (usesLocalOrchestrator && options.mode === "ao-cli") {
    console.error(import_chalk10.default.red("\u2717 --mode ao-cli is deprecated and non-functional."));
    console.error(import_chalk10.default.gray("  `ao` is now a daemon on 127.0.0.1:3001; point http mode at it:"));
    console.error(import_chalk10.default.gray("    devpilot bridge connect --mode http --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  if (usesLocalOrchestrator && options.mode === "http" && !options.httpUrl) {
    console.error(import_chalk10.default.red("\u2717 --mode http requires --http-url"));
    console.error(import_chalk10.default.gray("  For the ao daemon: --http-url http://127.0.0.1:3001"));
    process.exit(1);
  }
  if (usesLocalOrchestrator && options.mode === "claude-session" && !options.sessionApiUrl) {
    console.error(import_chalk10.default.red("\u2717 --mode claude-session requires --session-api-url"));
    console.error(import_chalk10.default.gray("  Start the runner, then point at it:"));
    console.error(import_chalk10.default.gray("    devpilot session-runner --port 3900 --token <t>"));
    console.error(import_chalk10.default.gray("    \u2026 --session-api-url http://127.0.0.1:3900 --session-api-key <t>"));
    process.exit(1);
  }
  const client2 = new import_bridge_client.BridgeClient({ bridgeUrl: options.url, token: options.token });
  let registration;
  try {
    const machineName = options.name ?? stableMachineName();
    registration = await client2.register({ name: machineName, repos, maxConcurrentJobs });
  } catch (err) {
    console.error(import_chalk10.default.red("\u2717 Registration failed"));
    console.error(import_chalk10.default.red(`   ${err instanceof Error ? err.message : err}`));
    process.exit(1);
  }
  console.log(import_chalk10.default.green("\u2713 Registered"));
  console.log(import_chalk10.default.gray(`   orchestrator: ${registration.orchestratorId}`));
  console.log(import_chalk10.default.gray(`   repos: ${repos.join(", ") || "(none)"}`));
  if (repos.length === 0) {
    console.log(import_chalk10.default.yellow("   \u26A0 No repos specified \u2014 nothing can route to this machine."));
    console.log(import_chalk10.default.gray("     Re-run with --repos owner/name to receive dispatches."));
  }
  console.log("");
  const useRealtime = options.transport !== "poll" && registration.realtime !== null;
  if (options.transport !== "poll" && !registration.realtime) {
    console.log(import_chalk10.default.yellow("   Realtime unavailable from this bridge \u2014 polling instead."));
  }
  const conductorWatcher = options.plan ? new ConductorWatcher({
    client: client2,
    cockpitUrl: options.cockpitUrl,
    // Survives a restart. Without this, upgrading the CLI or closing a
    // laptop lid orphaned every in-flight run: the cockpit kept working
    // and Linear was never told how any of it ended.
    statePath: (0, import_node_path4.join)((0, import_node_os2.homedir)(), ".devpilot", "conductor-watch.json"),
    onLog: (line) => console.log(import_chalk10.default.blue(`   ${line}`)),
    onLost: (run) => console.log(
      import_chalk10.default.yellow(
        `   ${run.linearIdentifier} still running at shutdown \u2014 it will be picked up on the next start`
      )
    )
  }) : null;
  const commandApplier = options.plan && conductorWatcher ? new CommandApplier({
    client: client2,
    cockpitUrl: options.cockpitUrl,
    resolveItemId: (sessionId) => conductorWatcher.itemFor(sessionId),
    onLog: (line) => console.log(import_chalk10.default.blue(`   ${line}`))
  }) : null;
  if (commandApplier) {
    const tick = () => void commandApplier.sweep();
    setInterval(tick, 15e3).unref?.();
    tick();
  }
  const readopted = conductorWatcher?.restore() ?? 0;
  if (readopted > 0) {
    console.log(
      import_chalk10.default.blue(
        `   Resumed watching ${readopted} run${readopted === 1 ? "" : "s"} from a previous session`
      )
    );
  }
  const adoptionWatcher = new AdoptionWatcher({
    client: client2,
    statePath: (0, import_node_path4.join)((0, import_node_os2.homedir)(), ".devpilot", "adoption-watch.json"),
    onLog: (line) => console.log(import_chalk10.default.blue(`   ${line}`))
  });
  const resumedAdoptions = adoptionWatcher.restore();
  if (resumedAdoptions > 0) {
    console.log(
      import_chalk10.default.blue(
        `   Watching ${resumedAdoptions} adopted session${resumedAdoptions === 1 ? "" : "s"} from a previous run`
      )
    );
  }
  const observer = options.observe !== false ? new SessionObserver({
    client: client2,
    machineName: options.name ?? stableMachineName(),
    repos,
    onLog: (line) => console.log(import_chalk10.default.gray(`   ${line}`))
  }) : null;
  if (observer) {
    const first = await observer.sweep();
    if (first && first.observed > 0) {
      console.log(
        import_chalk10.default.green(
          `   \u2713 Observing ${first.observed} agent session${first.observed === 1 ? "" : "s"} on this machine`
        )
      );
      console.log(import_chalk10.default.gray(`     ${client2.hostedUrl()}/cockpit`));
      console.log("");
    }
    observer.start();
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
  const loop = new import_bridge_client.DispatchLoop({
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
      onLog: (line) => console.log(import_chalk10.default.blue(`   ${line}`))
    }) : createBridgeDispatchHandler({
      client: client2,
      orchestratorMode: options.mode,
      httpUrl: options.httpUrl,
      sessionApiUrl: options.sessionApiUrl,
      sessionApiKey: options.sessionApiKey,
      aoProjectName: options.aoProject,
      aoPath: options.aoPath,
      onLog: (line) => console.log(import_chalk10.default.blue(`   ${line}`))
    }),
    onLog: (line) => console.log(import_chalk10.default.gray(`   ${line}`)),
    onError: (e) => console.log(import_chalk10.default.yellow(`   ${e.message}`))
  });
  const heartbeat = new import_bridge_client.HeartbeatService({
    client: client2,
    activeJobs: () => loop.activeJobs,
    onError: (e) => console.log(import_chalk10.default.gray(`   heartbeat: ${e.message}`))
  });
  await loop.start();
  heartbeat.start();
  console.log(import_chalk10.default.green(`\u2713 Listening (${useRealtime ? "realtime" : "poll"})`));
  console.log(import_chalk10.default.gray("   Agents run on THIS machine. Ctrl+C to disconnect."));
  console.log("");
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("");
    console.log(import_chalk10.default.yellow("Disconnecting\u2026"));
    heartbeat.stop();
    observer?.stop();
    conductorWatcher?.stop();
    await loop.stop();
    console.log(import_chalk10.default.green("\u2713 Disconnected"));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  await new Promise(() => {
  });
});

// src/commands/bridge/disconnect.ts
var import_commander7 = require("commander");
var import_chalk11 = __toESM(require("chalk"));
var disconnectCommand = new import_commander7.Command("disconnect").description("Disconnect from DevPilot cloud bridge").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).option("-i, --orchestrator-id <id>", "Orchestrator ID to disconnect").action(async (options) => {
  if (!options.bridgeUrl || !options.orchestratorId) {
    console.error(import_chalk11.default.red("\u2717 Error: Bridge URL and orchestrator ID required"));
    console.error(import_chalk11.default.gray("   Use: devpilot bridge disconnect -u <url> -i <orchestrator-id>"));
    process.exit(1);
  }
  console.log(import_chalk11.default.cyan("\u{1F309} Disconnecting from DevPilot Bridge"));
  console.log("");
  console.log(import_chalk11.default.gray(`   Bridge URL: ${options.bridgeUrl}`));
  console.log(import_chalk11.default.gray(`   Orchestrator ID: ${options.orchestratorId}`));
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
      console.log(import_chalk11.default.green("\u2713 Successfully disconnected from bridge"));
    } else {
      const errorText = await response.text();
      console.error(import_chalk11.default.red("\u2717 Failed to disconnect:"));
      console.error(import_chalk11.default.red(`   ${errorText}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(import_chalk11.default.red("\u2717 Error disconnecting:"));
    console.error(import_chalk11.default.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge/status.ts
var import_commander8 = require("commander");
var import_chalk12 = __toESM(require("chalk"));
var statusCommand2 = new import_commander8.Command("status").description("Check bridge connection status").option("-u, --bridge-url <url>", "Bridge service URL", process.env.DEVPILOT_BRIDGE_URL).option("-i, --orchestrator-id <id>", "Orchestrator ID").option("-k, --api-key <key>", "API key", process.env.DEVPILOT_BRIDGE_API_KEY).action(async (options) => {
  if (!options.bridgeUrl) {
    console.error(import_chalk12.default.red("\u2717 Error: Bridge URL required"));
    console.error(import_chalk12.default.gray("   Use: devpilot bridge status -u <url>"));
    process.exit(1);
  }
  console.log(import_chalk12.default.cyan("\u{1F309} DevPilot Bridge Status"));
  console.log("");
  try {
    const healthRes = await fetch(`${options.bridgeUrl}/health`);
    const health = await healthRes.json();
    console.log(import_chalk12.default.white("Bridge Status:"));
    if (health.status === "ok") {
      console.log(import_chalk12.default.gray("  Status: ") + import_chalk12.default.green("\u2713 Online"));
    } else {
      console.log(import_chalk12.default.gray("  Status: ") + import_chalk12.default.red("\u2717 Offline"));
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
        console.log(import_chalk12.default.white("Orchestrator Status:"));
        console.log(import_chalk12.default.gray("  ID: ") + import_chalk12.default.cyan(orch.id));
        console.log(import_chalk12.default.gray("  Name: ") + import_chalk12.default.white(orch.name));
        if (orch.isOnline) {
          console.log(import_chalk12.default.gray("  Online: ") + import_chalk12.default.green("\u2713"));
        } else {
          console.log(import_chalk12.default.gray("  Online: ") + import_chalk12.default.red("\u2717"));
        }
        console.log(import_chalk12.default.gray("  Active Jobs: ") + import_chalk12.default.yellow(orch.activeJobs));
        console.log(import_chalk12.default.gray("  Last Heartbeat: ") + import_chalk12.default.white(orch.lastHeartbeat || "Never"));
        console.log(import_chalk12.default.gray("  Repos: ") + import_chalk12.default.cyan(orch.repos?.join(", ") || "None"));
      } else {
        console.log(import_chalk12.default.white("Orchestrator Status:"));
        console.log(import_chalk12.default.gray("  ") + import_chalk12.default.red("Not found or unauthorized"));
      }
    }
  } catch (error) {
    console.error(import_chalk12.default.red("\u2717 Error checking status:"));
    console.error(import_chalk12.default.red(`   ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
});

// src/commands/bridge.ts
var bridgeCommand = new import_commander9.Command("bridge").description("Manage connection to DevPilot cloud bridge").addCommand(connectCommand).addCommand(disconnectCommand).addCommand(statusCommand2);

// src/commands/session.ts
var import_commander13 = require("commander");

// src/commands/session/new.ts
var import_commander10 = require("commander");
var import_chalk13 = __toESM(require("chalk"));
var import_bridge_protocol = require("@devpilot.sh/bridge-protocol");
var newCommand = new import_commander10.Command("new").description("Create a shared session and print its join link").argument("<title>", "What this session is about (stored in plaintext \u2014 no secrets)").option("-u, --url <url>", "Bridge URL", process.env.DEVPILOT_BRIDGE_URL).option("-t, --token <token>", "Orchestrator token (dp_orch_\u2026)", process.env.DEVPILOT_BRIDGE_TOKEN).option("-o, --org <orgId>", "Organization id that will own the session").option("--issue <identifier>", "Linear issue identifier to attach, e.g. ENG-394").action(async (title, options) => {
  if (!options.url || !options.token) {
    console.error(import_chalk13.default.red("\u2717 Bridge URL and token required"));
    console.error(import_chalk13.default.gray("  --url / DEVPILOT_BRIDGE_URL, --token / DEVPILOT_BRIDGE_TOKEN"));
    process.exit(1);
  }
  if (!options.org) {
    console.error(import_chalk13.default.red("\u2717 --org <orgId> is required"));
    console.error(import_chalk13.default.gray("  The token is bound to one org; this must be that org."));
    process.exit(1);
  }
  const key = import_bridge_protocol.sessionCrypto.generateKey();
  const { joinKeyHash } = await import_bridge_protocol.sessionCrypto.deriveJoinCredentials(key);
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
    console.error(import_chalk13.default.red(`\u2717 Could not create session (${res.status})`));
    console.error(import_chalk13.default.gray(`  ${(0, import_bridge_protocol.formatApiError)(body, res.statusText)}`));
    process.exit(1);
  }
  const { session } = await res.json();
  const link = (0, import_bridge_protocol.buildJoinLink)(base, session.id, key);
  console.log("");
  console.log(import_chalk13.default.cyan(`  ${session.title}`));
  console.log(import_chalk13.default.bold(`  ${link}`));
  console.log("");
  console.log(import_chalk13.default.yellow("  Anyone with this link can read the whole transcript."));
  console.log(import_chalk13.default.gray("  It carries the encryption key after the #, which never reaches"));
  console.log(import_chalk13.default.gray("  devpilot.sh. Send it the way you would send a password \u2014 not to"));
  console.log(import_chalk13.default.gray("  a public channel. To revoke it, re-key the session; that ends"));
  console.log(import_chalk13.default.gray("  access for this link but cannot un-send what was already read."));
  console.log("");
  console.log(import_chalk13.default.gray(`  Others join with:  devpilot session join "${import_chalk13.default.italic("<link>")}"`));
  console.log("");
});

// src/commands/session/join.ts
var import_os3 = __toESM(require("os"));
var import_commander11 = require("commander");
var import_chalk14 = __toESM(require("chalk"));
var import_bridge_client2 = require("@devpilot.sh/bridge-client");
var joinCommand = new import_commander11.Command("join").description("Join a shared session by link and post a message").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", import_os3.default.hostname()).option("-m, --message <text>", "Post this message after joining").action(async (url, options) => {
  try {
    const client2 = await import_bridge_client2.SharedSessionClient.join({ link: url, displayName: options.name });
    const s = client2.session;
    console.log(import_chalk14.default.cyan(`
  ${s.title}`));
    console.log(import_chalk14.default.gray(`  mode: ${s.mode}  \xB7  messages: ${s.lastSeq ?? 0}
`));
    if (options.message) {
      const posted = await client2.post(options.message);
      console.log(import_chalk14.default.green(`  posted #${posted.seq}
`));
    }
    const participants = await client2.who();
    for (const p of participants) {
      const agent = p.agentKind ? import_chalk14.default.gray(` [${p.agentKind}]`) : "";
      console.log(`  \xB7 ${p.displayName}${agent}${p.leftAt ? import_chalk14.default.gray(" (left)") : ""}`);
    }
    console.log("");
  } catch (err) {
    console.error(import_chalk14.default.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
});

// src/commands/session/tail.ts
var import_os4 = __toESM(require("os"));
var import_commander12 = require("commander");
var import_chalk15 = __toESM(require("chalk"));
var import_bridge_client3 = require("@devpilot.sh/bridge-client");
var tailCommand = new import_commander12.Command("tail").description("Follow a shared session transcript in the terminal").argument("<url>", "Join link, including the #k=\u2026 fragment").option("-n, --name <name>", "Display name in the transcript", import_os4.default.hostname()).option("-i, --interval <seconds>", "Poll interval", "3").action(async (url, options) => {
  const intervalMs = Math.max(1, parseInt(options.interval, 10) || 3) * 1e3;
  let client2;
  try {
    client2 = await import_bridge_client3.SharedSessionClient.join({ link: url, displayName: options.name });
  } catch (err) {
    console.error(import_chalk15.default.red(`\u2717 ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
    return;
  }
  const names = /* @__PURE__ */ new Map();
  for (const p of await client2.who()) names.set(p.id, p.displayName);
  console.log(import_chalk15.default.cyan(`
  ${client2.session.title}`));
  console.log(import_chalk15.default.gray(`  following \xB7 ctrl-c to stop
`));
  let cursor = 0;
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
    console.log(import_chalk15.default.gray("\n  stopped\n"));
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
      console.error(import_chalk15.default.gray(`  \u2026 ${err instanceof Error ? err.message : String(err)}`));
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
});
function format(e, names) {
  const who = e.participantId ? names.get(e.participantId) ?? e.participantId : "system";
  const seq = import_chalk15.default.gray(`#${String(e.seq).padStart(3)}`);
  if (e.status === "system") {
    const reason = e.systemNotice?.reason ? ` (${e.systemNotice.reason})` : "";
    return `  ${seq} ${import_chalk15.default.yellow(`\u2699 ${e.systemNotice?.type ?? e.text}${reason}`)}`;
  }
  if (e.status === "undecryptable") {
    return `  ${seq} ${import_chalk15.default.gray(`${who}: <sealed under an earlier key \u2014 not readable with this link>`)}`;
  }
  return `  ${seq} ${import_chalk15.default.bold(who)}: ${e.text}`;
}

// src/commands/session.ts
var sessionCommand = new import_commander13.Command("session").description("Shared, end-to-end encrypted sessions across machines").addCommand(newCommand).addCommand(joinCommand).addCommand(tailCommand);

// src/commands/sessions/index.ts
var import_os5 = __toESM(require("os"));
var import_node_os3 = require("os");
var import_node_path5 = require("path");
var import_node_fs5 = require("fs");
var import_commander14 = require("commander");
var import_chalk16 = __toESM(require("chalk"));
var import_inquirer = __toESM(require("inquirer"));
var import_bridge_client4 = require("@devpilot.sh/bridge-client");
function stableMachineName2() {
  const path = (0, import_node_path5.join)((0, import_node_os3.homedir)(), ".devpilot", "machine.json");
  try {
    if ((0, import_node_fs5.existsSync)(path)) {
      const saved = JSON.parse((0, import_node_fs5.readFileSync)(path, "utf8"));
      if (saved.name) return saved.name;
    }
  } catch {
  }
  const name = import_os5.default.hostname();
  try {
    (0, import_node_fs5.mkdirSync)((0, import_node_path5.dirname)(path), { recursive: true });
    (0, import_node_fs5.writeFileSync)(path, JSON.stringify({ name }, null, 2), "utf8");
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
      if (!options.json) console.log(import_chalk16.default.gray(`   ${message}`));
    }
  });
  return { machineName, result };
}
function destinationFor(outcome) {
  if (!outcome) return import_chalk16.default.gray("\u2014");
  switch (outcome.status) {
    case "duplicate":
      return import_chalk16.default.gray(`${outcome.linearIdentifier ?? "already adopted"} (tracked)`);
    case "attached":
      return import_chalk16.default.green(`${outcome.linearIdentifier} (${outcome.matchedBy})`);
    case "adopted":
      return outcome.linearIdentifier ? import_chalk16.default.green(outcome.linearIdentifier) : import_chalk16.default.yellow("create");
    case "skipped":
      return import_chalk16.default.yellow(outcome.reason ? `skip \u2014 ${outcome.reason.slice(0, 60)}` : "skip");
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
  return new import_bridge_client4.BridgeClient({ bridgeUrl: options.url, token: options.token });
}
var scanCommand = withCommonOptions(
  new import_commander14.Command("scan").description(
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
        console.log(import_chalk16.default.yellow(`   Could not preview against the bridge: ${describe3(err)}`));
        console.log(import_chalk16.default.gray("   Showing the local scan only."));
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
      import_chalk16.default.gray(
        "  No bridge credentials, so this is a local listing only. Pass --url and --token"
      )
    );
    console.log(import_chalk16.default.gray("  to see which Linear issues these would attach to."));
  } else if (result.candidates.length > 0) {
    console.log(import_chalk16.default.gray("  Nothing was written. Run `devpilot sessions adopt` to act on this."));
  }
  console.log("");
});
var adoptCommand = withCommonOptions(
  new import_commander14.Command("adopt").description("Put agent sessions running on this machine onto the board")
).option("-y, --yes", "Skip the confirmation").action(async (options) => {
  const bridge = client(options);
  if (!bridge) {
    console.error(import_chalk16.default.red("\u2717 Bridge URL and token required (--url / --token)"));
    console.error(import_chalk16.default.gray("  Mint a token in the dashboard under Settings \u2192 Tokens."));
    process.exit(1);
  }
  const { machineName, result } = await pipeline(options);
  if (result.candidates.length === 0) {
    console.log("");
    console.log(renderPreview([], result));
    console.log("");
    console.log(import_chalk16.default.gray("  No sessions to adopt."));
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
    console.error(import_chalk16.default.red(`\u2717 ${describe3(err)}`));
    process.exit(1);
  }
  console.log("");
  console.log(renderPreview(rowsFrom(result, preview.outcomes), result));
  console.log("");
  const willCreate = preview.outcomes.filter((o) => o.status === "adopted").length;
  const willAttach = preview.outcomes.filter((o) => o.status === "attached").length;
  if (willCreate === 0 && willAttach === 0) {
    console.log(import_chalk16.default.gray("  Nothing new to adopt \u2014 everything here is already tracked."));
    console.log("");
    return;
  }
  console.log(
    `  This creates ${import_chalk16.default.bold(String(willCreate))} Linear issue${willCreate === 1 ? "" : "s"} and attaches ${import_chalk16.default.bold(String(willAttach))} existing.`
  );
  console.log("");
  if (!options.yes) {
    const { proceed } = await import_inquirer.default.prompt([
      { type: "confirm", name: "proceed", message: "Continue?", default: false }
    ]);
    if (!proceed) {
      console.log(import_chalk16.default.gray("  Nothing was written."));
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
    console.error(import_chalk16.default.red(`\u2717 ${describe3(err)}`));
    process.exit(1);
  }
  console.log("");
  for (const outcome of response.outcomes) {
    if (outcome.status === "skipped") {
      console.log(import_chalk16.default.yellow(`   \u25CB skipped \u2014 ${outcome.reason ?? "no reason given"}`));
    } else if (outcome.status === "duplicate") {
      console.log(import_chalk16.default.gray(`   \xB7 ${outcome.linearIdentifier ?? "?"} already tracked`));
    } else {
      console.log(
        import_chalk16.default.green(
          `   \u2713 ${outcome.linearIdentifier}${outcome.status === "attached" ? ` (attached, ${outcome.matchedBy})` : ""}`
        )
      );
    }
  }
  console.log("");
  console.log(
    import_chalk16.default.green(
      `\u2713 ${response.adopted} adopted, ${response.attached} attached, ${response.duplicates} already tracked, ${response.skipped} skipped`
    )
  );
  console.log(
    import_chalk16.default.gray(
      "  These are observed, not dispatched: DevPilot is watching them and will not move a ticket."
    )
  );
  console.log("");
});
function describe3(err) {
  return err instanceof Error ? err.message : String(err);
}
var sessionsCommand = new import_commander14.Command("sessions").description("Agent sessions running on this machine").addCommand(scanCommand).addCommand(adoptCommand);

// src/commands/session-runner/index.ts
var import_commander15 = require("commander");
var import_chalk17 = __toESM(require("chalk"));
var import_path8 = require("path");

// src/commands/session-runner/server.ts
var import_http = require("http");
var import_crypto = require("crypto");
var import_fs7 = require("fs");
var import_path7 = require("path");

// src/commands/session-runner/claude-runner.ts
var import_child_process3 = require("child_process");
var import_util = require("util");
var import_fs6 = require("fs");
var import_os6 = require("os");
var import_path6 = require("path");

// src/commands/session-runner/stream-events.ts
var PRICE_PER_MTOK = {
  input: 5,
  output: 25,
  cacheWrite: 6.25,
  cacheRead: 0.5
};
function priceUsage(usage) {
  const m = 1e6;
  return (usage.input_tokens ?? 0) * PRICE_PER_MTOK.input / m + (usage.output_tokens ?? 0) * PRICE_PER_MTOK.output / m + (usage.cache_creation_input_tokens ?? 0) * PRICE_PER_MTOK.cacheWrite / m + (usage.cache_read_input_tokens ?? 0) * PRICE_PER_MTOK.cacheRead / m;
}
var MAX_ACTIONS = 200;
var WRITE_TOOLS = /* @__PURE__ */ new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
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
    this.costUsd = 0;
    this.costIsEstimate = true;
    this.tokensIn = 0;
    this.tokensOut = 0;
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
        this.costUsd += priceUsage(usage);
        this.tokensIn += usage.input_tokens ?? 0;
        this.tokensOut += usage.output_tokens ?? 0;
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
      this.tokensIn = event.usage?.input_tokens ?? this.tokensIn;
      this.tokensOut = event.usage?.output_tokens ?? this.tokensOut;
    }
  }
  recordTool(tool, input) {
    this.toolCalls++;
    const raw = typeof input.file_path === "string" ? input.file_path : typeof input.path === "string" ? input.path : void 0;
    const path = raw ? relativize(raw, this.workdir) : void 0;
    if (path) {
      const list = WRITE_TOOLS.has(tool) ? this.touched : READ_TOOLS.has(tool) ? this.read : null;
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
  snapshot() {
    const now = this.now();
    return {
      toolCalls: this.toolCalls,
      filesTouched: [...this.touched],
      filesRead: [...this.read],
      commands: [...this.commands],
      lastText: this.lastText,
      lastAction: this.lastAction,
      actions: [...this.actions],
      costUsd: this.costUsd,
      costIsEstimate: this.costIsEstimate,
      tokensIn: this.tokensIn,
      tokensOut: this.tokensOut,
      turns: this.turns,
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
var execFileAsync = (0, import_util.promisify)(import_child_process3.execFile);
var OWNED_SESSION_LIMIT = 5e3;
function recordOwnedSession(sessionId) {
  try {
    const dir = (0, import_path6.join)((0, import_os6.homedir)(), ".devpilot");
    const path = (0, import_path6.join)(dir, "owned-sessions.json");
    let ids = [];
    if ((0, import_fs6.existsSync)(path)) {
      const parsed = JSON.parse((0, import_fs6.readFileSync)(path, "utf8"));
      if (Array.isArray(parsed.sessionIds)) {
        ids = parsed.sessionIds.filter((v) => typeof v === "string");
      }
    }
    if (ids.includes(sessionId)) return;
    ids.push(sessionId);
    if (ids.length > OWNED_SESSION_LIMIT) ids = ids.slice(-OWNED_SESSION_LIMIT);
    (0, import_fs6.mkdirSync)(dir, { recursive: true });
    (0, import_fs6.writeFileSync)(path, JSON.stringify({ version: 1, sessionIds: ids }, null, 2), "utf8");
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
  const dir = (0, import_fs6.mkdtempSync)((0, import_path6.join)((0, import_os6.tmpdir)(), "devpilot-mcp-"));
  const file = (0, import_path6.join)(dir, "mcp.json");
  (0, import_fs6.writeFileSync)(
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
  const { workdir, prompt: prompt2, sessionLink: sessionLink2, model, claudePath, permissionMode, timeoutMs, onLog, onSpawn } = options;
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
  let mcpDir;
  let effectivePrompt = prompt2;
  if (sessionLink2) {
    const cfg = writeSessionMcpConfig(sessionLink2);
    mcpDir = cfg.dir;
    args.push("--mcp-config", cfg.file, "--strict-mcp-config");
    effectivePrompt = sessionPreamble() + prompt2;
  }
  const outcome = await new Promise((resolve4) => {
    const child = (0, import_child_process3.spawn)(claudePath, args, {
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
      if (lines.length > 0) options.onTelemetry?.(collector.snapshot());
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
    if (mcpDir) (0, import_fs6.rmSync)(mcpDir, { recursive: true, force: true });
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
      return (0, import_fs7.existsSync)(mapped) ? { workdir: mapped } : { error: `Mapped path for '${repo}' does not exist: ${mapped}` };
    }
    const candidate = (0, import_path7.isAbsolute)(repo) ? repo : (0, import_path7.resolve)(this.config.workspace, (0, import_path7.basename)(repo));
    if (!(0, import_fs7.existsSync)(candidate)) {
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
        this.reportStatus(session, callbackUrl, callbackToken, {
          currentStep: session.currentStep ?? "working",
          message: session.message ?? "Session in progress"
        });
      }, 9e4);
      heartbeat.unref();
      let lastReportAt = 0;
      const REPORT_INTERVAL_MS = 3e3;
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
    const externalSessionId = `run_${(0, import_crypto.randomUUID)()}`;
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
      this.server = (0, import_http.createServer)((req, res) => {
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
    map.set(entry.slice(0, idx).trim(), (0, import_path8.resolve)(entry.slice(idx + 1).trim()));
  }
  return map;
}
var sessionRunnerCommand = new import_commander15.Command("session-runner").description("Run Claude Code sessions dispatched by DevPilot (claude-session mode)").option("-p, --port <port>", "Port to listen on", "3900").option("--host <host>", "Interface to bind", "127.0.0.1").option("--token <token>", "Bearer token the dispatcher must present").option("-w, --workspace <dir>", "Directory containing repo checkouts", process.cwd()).option(
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
    console.error(import_chalk17.default.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
    return;
  }
  const config = {
    port: parseInt(options.port, 10),
    host: options.host,
    apiKey: options.token ?? process.env.DEVPILOT_SESSION_API_KEY,
    workspace: (0, import_path8.resolve)(options.workspace),
    repoMap,
    claudePath: options.claudePath,
    permissionMode: options.permissionMode,
    maxConcurrent: parseInt(options.maxConcurrent, 10),
    timeoutMs: parseInt(options.timeout, 10) * 6e4,
    log: (line) => console.log(import_chalk17.default.dim(`[runner] ${line}`))
  };
  const runner = new SessionRunner(config);
  try {
    await runner.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(import_chalk17.default.red(`Failed to start session runner: ${message}`));
    process.exitCode = 1;
    return;
  }
  const base = `http://${config.host}:${config.port}`;
  console.log(import_chalk17.default.bold("\n  DevPilot session runner\n"));
  console.log(`  ${import_chalk17.default.dim("listening")}   ${base}`);
  console.log(`  ${import_chalk17.default.dim("workspace")}   ${config.workspace}`);
  console.log(`  ${import_chalk17.default.dim("claude")}      ${config.claudePath} (${config.permissionMode})`);
  console.log(`  ${import_chalk17.default.dim("concurrency")} ${config.maxConcurrent}`);
  if (repoMap.size > 0) {
    for (const [repo, path] of repoMap) console.log(`  ${import_chalk17.default.dim("repo")}        ${repo} \u2192 ${path}`);
  }
  if (!config.apiKey) {
    console.log(import_chalk17.default.yellow("\n  No --token set: the dispatcher API is unauthenticated."));
  }
  console.log(import_chalk17.default.dim("\n  Point DevPilot at it:"));
  console.log(
    import_chalk17.default.dim(
      `    DEVPILOT_ORCHESTRATOR_MODE=claude-session DEVPILOT_SESSION_API_URL=${base} devpilot serve
`
    )
  );
  const shutdown = async () => {
    console.log(import_chalk17.default.dim("\n[runner] shutting down\u2026"));
    await runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
});

// src/commands/update.ts
var import_commander16 = require("commander");
var import_child_process4 = require("child_process");
var import_chalk18 = __toESM(require("chalk"));
async function getLatestVersion() {
  try {
    const result = (0, import_child_process4.execSync)("npm view @devpilot.sh/cli version", {
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
    const pnpmList = (0, import_child_process4.execSync)("pnpm list -g @devpilot.sh/cli 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (pnpmList.includes("@devpilot.sh/cli")) return "pnpm";
  } catch {
  }
  try {
    const yarnList = (0, import_child_process4.execSync)("yarn global list 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (yarnList.includes("@devpilot.sh/cli")) return "yarn";
  } catch {
  }
  try {
    (0, import_child_process4.execSync)("bun --version", { stdio: ["pipe", "pipe", "pipe"] });
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
var updateCommand = new import_commander16.Command("update").description("Update DevPilot CLI to the latest version").option("-c, --check", "Only check for updates without installing").option("--force", "Force update even if already on latest version").action(async (options) => {
  console.log(import_chalk18.default.cyan("Checking for updates..."));
  const latestVersion = await getLatestVersion();
  if (!latestVersion) {
    console.log(import_chalk18.default.yellow("Could not check for updates. Please check your network connection."));
    console.log(import_chalk18.default.gray("You can manually update with: npm install -g @devpilot.sh/cli@latest"));
    return;
  }
  const comparison = compareVersions(latestVersion, VERSION);
  if (comparison === 0 && !options.force) {
    console.log(import_chalk18.default.green(`You're already on the latest version (${VERSION})`));
    return;
  }
  if (comparison === -1 && !options.force) {
    console.log(import_chalk18.default.yellow(`You're on a newer version (${VERSION}) than the latest release (${latestVersion})`));
    console.log(import_chalk18.default.gray("This might be a pre-release or development version."));
    return;
  }
  if (options.check) {
    if (comparison === 1) {
      console.log(import_chalk18.default.yellow(`Update available: ${VERSION} \u2192 ${latestVersion}`));
      console.log(import_chalk18.default.gray('Run "devpilot update" to install the latest version.'));
    }
    return;
  }
  const pm = detectPackageManager();
  const updateCmd = getUpdateCommand(pm);
  console.log(import_chalk18.default.cyan(`Updating from ${VERSION} to ${latestVersion}...`));
  console.log(import_chalk18.default.gray(`Using: ${updateCmd}`));
  console.log("");
  try {
    const [cmd, ...args] = updateCmd.split(" ");
    const child = (0, import_child_process4.spawn)(cmd, args, {
      stdio: "inherit",
      shell: true
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log("");
        console.log(import_chalk18.default.green(`Successfully updated to ${latestVersion}`));
        console.log(import_chalk18.default.gray('Run "devpilot --version" to verify.'));
      } else {
        console.log("");
        console.log(import_chalk18.default.red("Update failed. Please try manually:"));
        console.log(import_chalk18.default.cyan(`  ${updateCmd}`));
      }
    });
    child.on("error", (err) => {
      console.log(import_chalk18.default.red(`Update failed: ${err.message}`));
      console.log(import_chalk18.default.gray("Please try manually:"));
      console.log(import_chalk18.default.cyan(`  ${updateCmd}`));
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.log(import_chalk18.default.red(`Update failed: ${message}`));
    console.log(import_chalk18.default.gray("Please try manually:"));
    console.log(import_chalk18.default.cyan(`  ${updateCmd}`));
  }
});

// src/commands/wiki.ts
var import_commander17 = require("commander");
var import_fs8 = require("fs");
var import_path9 = require("path");
var import_chalk19 = __toESM(require("chalk"));
var import_wave_planner = require("@devpilot.sh/core/wave-planner");
var wikiCommand = new import_commander17.Command("wiki").description("LLM-compiled knowledge base \u2014 institutional memory for your codebase");
wikiCommand.command("init").description("Initialize the wiki system in the current repository").option("--wiki-dir <path>", "Wiki output directory", ".devpilot/wiki").action(async (options) => {
  const cwd = process.cwd();
  const devpilotDir = (0, import_path9.join)(cwd, ".devpilot");
  const wikiDir = (0, import_path9.join)(cwd, options.wikiDir);
  if (!(0, import_fs8.existsSync)(devpilotDir)) {
    console.log(
      import_chalk19.default.yellow("\u26A0\uFE0F  DevPilot not initialized. Run `devpilot init` first.")
    );
    return;
  }
  if (!(0, import_fs8.existsSync)(wikiDir)) {
    (0, import_fs8.mkdirSync)(wikiDir, { recursive: true });
  }
  const indexPath = (0, import_path9.join)(wikiDir, "index.md");
  if (!(0, import_fs8.existsSync)(indexPath)) {
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
    (0, import_fs8.writeFileSync)(indexPath, initialIndex);
  }
  const logPath = (0, import_path9.join)(wikiDir, "log.md");
  if (!(0, import_fs8.existsSync)(logPath)) {
    (0, import_fs8.writeFileSync)(
      logPath,
      `# Wiki Activity Log

> Append-only chronicle of wiki operations.

- **${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}** [init] Wiki initialized
`
    );
  }
  const gitignorePath = (0, import_path9.join)(cwd, ".gitignore");
  if ((0, import_fs8.existsSync)(gitignorePath)) {
    const gitignore = (0, import_fs8.readFileSync)(gitignorePath, "utf-8");
    if (!gitignore.includes(".devpilot/wiki")) {
    }
  }
  console.log(import_chalk19.default.green("\u2705 Wiki initialized!"));
  console.log("");
  console.log(import_chalk19.default.white("Wiki directory: ") + import_chalk19.default.cyan(wikiDir));
  console.log("");
  console.log(import_chalk19.default.white("Next steps:"));
  console.log(
    import_chalk19.default.gray("  1. ") + import_chalk19.default.cyan("devpilot wiki ingest --file <path>") + import_chalk19.default.gray(" to add source material")
  );
  console.log(
    import_chalk19.default.gray("  2. ") + import_chalk19.default.cyan('devpilot wiki query "How does auth work?"') + import_chalk19.default.gray(" to ask questions")
  );
  console.log(
    import_chalk19.default.gray("  3. ") + import_chalk19.default.cyan("devpilot wiki status") + import_chalk19.default.gray(" to check wiki health")
  );
  console.log("");
  console.log(
    import_chalk19.default.gray(
      "The wiki will grow automatically as agents work \u2014 each session compounds the knowledge base."
    )
  );
});
wikiCommand.command("ingest").description("Ingest a source document into the wiki").requiredOption("--type <type>", "Source type: session_log, commit, spec, decision, manual").requiredOption("--title <title>", "Human-readable title for the source").option("--file <path>", "Path to source file").option("--stdin", "Read source from stdin").option("--origin <origin>", "Origin identifier (e.g. session ID, commit SHA)").action(async (options) => {
  let content;
  if (options.file) {
    if (!(0, import_fs8.existsSync)(options.file)) {
      console.log(import_chalk19.default.red(`\u274C File not found: ${options.file}`));
      return;
    }
    content = (0, import_fs8.readFileSync)(options.file, "utf-8");
  } else if (options.stdin) {
    content = (0, import_fs8.readFileSync)(0, "utf-8");
  } else {
    console.log(
      import_chalk19.default.red("\u274C Provide either --file <path> or --stdin")
    );
    return;
  }
  const validTypes = ["session_log", "commit", "spec", "decision", "manual"];
  if (!validTypes.includes(options.type)) {
    console.log(
      import_chalk19.default.red(
        `\u274C Invalid type "${options.type}". Must be one of: ${validTypes.join(", ")}`
      )
    );
    return;
  }
  console.log(import_chalk19.default.gray(`Ingesting ${options.type}: "${options.title}"...`));
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
    console.log(import_chalk19.default.green("\u2705 Ingested successfully!"));
    console.log(
      import_chalk19.default.gray(`   Source ID: ${result.sourceId}`)
    );
    if (result.articlesCreated.length > 0) {
      console.log(
        import_chalk19.default.white(`   Articles created: `) + import_chalk19.default.cyan(result.articlesCreated.join(", "))
      );
    }
    if (result.articlesUpdated.length > 0) {
      console.log(
        import_chalk19.default.white(`   Articles updated: `) + import_chalk19.default.yellow(result.articlesUpdated.join(", "))
      );
    }
    console.log(
      import_chalk19.default.gray(`   Tokens used: ${result.tokensUsed}`)
    );
  } catch (error) {
    console.log(
      import_chalk19.default.red(
        `\u274C Ingest failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("query <question>").description("Ask a question against the wiki").action(async (question) => {
  console.log(import_chalk19.default.gray(`Searching wiki for: "${question}"...`));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.query(question);
    console.log("");
    console.log(import_chalk19.default.white(result.answer));
    console.log("");
    if (result.citedArticles.length > 0) {
      console.log(
        import_chalk19.default.gray("Cited: ") + import_chalk19.default.cyan(result.citedArticles.map((s) => `[[${s}]]`).join(", "))
      );
    }
    if (result.newArticleSlug) {
      console.log(
        import_chalk19.default.green(
          `\u{1F4DD} New article created from this query: [[${result.newArticleSlug}]]`
        )
      );
    }
    console.log(import_chalk19.default.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      import_chalk19.default.red(
        `\u274C Query failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("lint").description("Check wiki health \u2014 find stale content, orphans, and gaps").action(async () => {
  console.log(import_chalk19.default.gray("Linting wiki..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.lint();
    if (result.findings.length === 0) {
      console.log(import_chalk19.default.green("\u2705 Wiki is healthy \u2014 no issues found!"));
      return;
    }
    console.log(
      import_chalk19.default.yellow(`\u26A0\uFE0F  Found ${result.findings.length} issue(s):
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
        `  ${icon} ${import_chalk19.default.white(`[${finding.type}]`)} ${import_chalk19.default.cyan(`[[${finding.articleSlug}]]`)}`
      );
      console.log(import_chalk19.default.gray(`     ${finding.description}`));
      console.log(import_chalk19.default.gray(`     \u2192 ${finding.suggestion}`));
      console.log("");
    }
    if (result.articlesMarkedStale.length > 0) {
      console.log(
        import_chalk19.default.yellow(
          `Marked ${result.articlesMarkedStale.length} article(s) as stale.`
        )
      );
    }
    console.log(import_chalk19.default.gray(`Tokens used: ${result.tokensUsed}`));
  } catch (error) {
    console.log(
      import_chalk19.default.red(
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
    console.log(import_chalk19.default.white.bold("\n\u{1F4DA} Wiki Status\n"));
    console.log(
      import_chalk19.default.gray("  Sources:    ") + import_chalk19.default.white(String(status.totalSources))
    );
    console.log(
      import_chalk19.default.gray("  Articles:   ") + import_chalk19.default.white(String(status.totalArticles)) + import_chalk19.default.gray(" (") + import_chalk19.default.green(`${status.activeArticles} active`) + (status.staleArticles > 0 ? import_chalk19.default.yellow(`, ${status.staleArticles} stale`) : "") + (status.archivedArticles > 0 ? import_chalk19.default.gray(`, ${status.archivedArticles} archived`) : "") + import_chalk19.default.gray(")")
    );
    if (Object.keys(status.categories).length > 0) {
      console.log(import_chalk19.default.gray("\n  Categories:"));
      for (const [category, count] of Object.entries(status.categories).sort()) {
        console.log(
          import_chalk19.default.gray("    ") + import_chalk19.default.cyan(category) + import_chalk19.default.gray(": ") + import_chalk19.default.white(String(count))
        );
      }
    }
    if (status.lastActivity) {
      console.log(
        import_chalk19.default.gray("\n  Last activity: ") + import_chalk19.default.white(status.lastActivity.toISOString().split("T")[0])
      );
    }
    console.log("");
  } catch (error) {
    console.log(
      import_chalk19.default.red(
        `\u274C Status failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
wikiCommand.command("flush").description("Export wiki to disk as markdown files").action(async () => {
  console.log(import_chalk19.default.gray("Flushing wiki to disk..."));
  try {
    const { createWikiCompiler } = await import("@devpilot.sh/core/wiki");
    const config = getWikiConfig();
    const compiler = createWikiCompiler(config);
    const result = await compiler.flushToDisk();
    console.log(import_chalk19.default.green(`\u2705 Wrote ${result.filesWritten} files to ${result.wikiDir}`));
  } catch (error) {
    console.log(
      import_chalk19.default.red(
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
      console.log(import_chalk19.default.gray("Wiki is empty. Run `devpilot wiki ingest` to add sources."));
      return;
    }
    const byCategory = {};
    for (const entry of index) {
      if (!byCategory[entry.category]) {
        byCategory[entry.category] = [];
      }
      byCategory[entry.category].push(entry);
    }
    console.log(import_chalk19.default.white.bold("\n\u{1F4D6} Wiki Index\n"));
    for (const [category, entries] of Object.entries(byCategory).sort()) {
      console.log(
        import_chalk19.default.cyan.bold(
          `  ${category.charAt(0).toUpperCase() + category.slice(1)}`
        )
      );
      for (const entry of entries) {
        const statusColor = entry.status === "active" ? import_chalk19.default.green : entry.status === "stale" ? import_chalk19.default.yellow : import_chalk19.default.gray;
        const badge = statusColor(`[${entry.status}]`);
        console.log(
          `    ${badge} ${import_chalk19.default.white(entry.title)} ${import_chalk19.default.gray(`[[${entry.slug}]]`)}`
        );
      }
      console.log("");
    }
  } catch (error) {
    console.log(
      import_chalk19.default.red(
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
      console.log(import_chalk19.default.red(`\u274C Article not found: [[${slug}]]`));
      return;
    }
    console.log(import_chalk19.default.white.bold(`
# ${article.title}
`));
    console.log(
      import_chalk19.default.gray(
        `Category: ${article.category} | Status: ${article.status} | v${article.version}`
      )
    );
    if (article.backlinks.length > 0) {
      console.log(
        import_chalk19.default.gray(
          `Related: ${article.backlinks.map((b) => `[[${b}]]`).join(", ")}`
        )
      );
    }
    console.log(import_chalk19.default.gray("\u2500".repeat(60)));
    console.log(article.content);
    console.log("");
  } catch (error) {
    console.log(
      import_chalk19.default.red(
        `\u274C Read failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
});
function getWikiConfig() {
  const cwd = process.cwd();
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: (0, import_wave_planner.resolveWikiModel)(),
    maxTokens: parseInt(process.env.WIKI_MAX_TOKENS || "8192", 10),
    repo: getRepoName(cwd),
    wikiDir: (0, import_path9.join)(cwd, ".devpilot", "wiki")
  };
}
function getRepoName(cwd) {
  try {
    const { execSync: execSync3 } = require("child_process");
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
var import_cli = require("@devpilot.sh/benchmarks/cli");
var pkg = {
  name: "@devpilot.sh/cli",
  version: VERSION
};
var cli = new import_commander18.Command();
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
cli.addCommand(import_cli.benchCommand);
function runCli(args = process.argv) {
  const notifier = (0, import_update_notifier.default)({
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cli,
  runCli
});
//# sourceMappingURL=cli.js.map