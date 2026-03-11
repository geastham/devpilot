import { DatabaseConfig } from '../config';
import { createSQLiteAdapter, SQLiteDatabase, closeSQLiteConnection } from './sqlite';
import { createPostgresAdapter, PostgresDatabase, closePostgresConnection } from './postgres';

export type Database = SQLiteDatabase | PostgresDatabase;

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
      return createPostgresAdapter(config.postgresUrl);

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
