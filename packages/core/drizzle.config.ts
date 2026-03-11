import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations/sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DEVPILOT_SQLITE_PATH || '.devpilot/data.db',
  },
});
