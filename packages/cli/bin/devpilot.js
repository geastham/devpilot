#!/usr/bin/env node
// The bare `devpilot statusline` runs on every assistant message in Claude
// Code, so it takes a path that does not load the rest of the CLI. Its
// subcommands (install, uninstall, status) are ordinary commands.
const [, , command, sub] = process.argv;
if (command === 'statusline' && (!sub || sub.startsWith('--'))) {
  require('../dist/statusline-fast.js')
    .main()
    .catch(() => process.exit(0));
} else {
  require('../dist/cli.js').runCli();
}
