import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { startServer } from '../server';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export const serveCommand = new Command('serve')
  .description('Start the local DevPilot Conductor API server')
  .option('-p, --port <port>', 'Port to run the server on', '3847')
  .option('--no-open', 'Do not open browser automatically')
  .option('--sync', 'Enable cloud sync')
  .option('--db <path>', 'Path to SQLite database', '.devpilot/data.db')
  .action(async (options) => {
    const port = parseInt(options.port, 10);

    console.log(chalk.cyan('🚀 Starting DevPilot Conductor...'));
    console.log('');
    console.log(chalk.gray(`   Port: ${port}`));
    console.log(chalk.gray(`   Database: ${options.db}`));
    console.log(chalk.gray(`   Sync: ${options.sync ? 'enabled' : 'disabled'}`));
    console.log('');

    // Ensure the database directory exists
    const dbDir = join(process.cwd(), '.devpilot');
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
      console.log(chalk.gray(`   Created: ${dbDir}`));
    }

    try {
      const dbPath = options.db.startsWith('/')
        ? options.db
        : join(process.cwd(), options.db);

      const { url, close } = await startServer({
        port,
        dbPath,
      });

      console.log(chalk.green('✓ Server started successfully'));
      console.log('');
      console.log(chalk.cyan(`   API: ${url}`));
      console.log(chalk.gray(`   Health: ${url}/api/health`));
      console.log('');
      console.log(chalk.gray('   Press Ctrl+C to stop'));
      console.log('');

      // Open browser if requested
      if (options.open) {
        // Note: In a full implementation, this would open the UI
        // For now, just log the URL since we don't have static UI bundled
        console.log(chalk.yellow('   Note: Static UI not bundled yet.'));
        console.log(chalk.gray('   To view the UI, run the Next.js app:'));
        console.log(chalk.cyan('   cd apps/web && pnpm dev'));
        console.log('');
      }

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('');
        console.log(chalk.yellow('Shutting down...'));
        await close();
        console.log(chalk.green('✓ Server stopped'));
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        await close();
        process.exit(0);
      });

      // Keep the process alive
      await new Promise(() => {});
    } catch (error) {
      console.error(chalk.red('✗ Failed to start server:'));
      console.error(chalk.red(`   ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });
