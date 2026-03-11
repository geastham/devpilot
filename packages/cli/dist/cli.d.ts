import { Command } from 'commander';

declare const cli: Command;
declare function runCli(args?: string[]): void;

export { cli, runCli };
