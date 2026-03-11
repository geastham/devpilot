import { z } from 'zod';

export const databaseConfigSchema = z.object({
  type: z.enum(['sqlite', 'postgres']).default('sqlite'),
  // SQLite options
  sqlitePath: z.string().optional(),
  // Postgres options
  postgresUrl: z.string().optional(),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export function getDatabaseConfig(): DatabaseConfig {
  const type = (process.env.DEVPILOT_DB_TYPE as 'sqlite' | 'postgres') || 'sqlite';

  return {
    type,
    sqlitePath: process.env.DEVPILOT_SQLITE_PATH || '.devpilot/data.db',
    postgresUrl: process.env.DATABASE_URL,
  };
}
