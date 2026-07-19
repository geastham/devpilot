import { DatabaseConfig } from '../config';
import { createSQLiteAdapter, SQLiteDatabase, closeSQLiteConnection } from './sqlite';
import { createPostgresAdapter, PostgresDatabase, closePostgresConnection } from './postgres';

// The SQLite adapter is the primary/default runtime (in-memory tests and
// better-sqlite3 both resolve to it). Typing the shared handle as SQLiteDatabase
// keeps Drizzle's query-builder signatures callable; the Postgres adapter still
// exists at runtime and is structurally compatible for the queries we issue.
export type Database = SQLiteDatabase;

export function createDatabase(config: DatabaseConfig): Database {
  switch (config.type) {
    case 'sqlite':
      if (!config.sqlitePath) {
        throw new Error('SQLite path is required for SQLite database');
      }
      return createSQLiteAdapter(config.sqlitePath);

    case 'postgres':
      if (!config.postgresUrl) {
        throw new Error('Postgres connection URL is required for Postgres database');
      }
      // Database is typed as the SQLite handle (see the note on the type alias).
      // The Postgres adapter is structurally compatible for the queries we issue;
      // cast at this single boundary rather than threading a union everywhere.
      return createPostgresAdapter(config.postgresUrl) as unknown as Database;

    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

export async function closeDatabase(config: DatabaseConfig): Promise<void> {
  switch (config.type) {
    case 'sqlite':
      closeSQLiteConnection();
      break;
    case 'postgres':
      await closePostgresConnection();
      break;
  }
}

export type { SQLiteDatabase, PostgresDatabase };
export { createSQLiteAdapter, closeSQLiteConnection } from './sqlite';
export { createPostgresAdapter, closePostgresConnection } from './postgres';
