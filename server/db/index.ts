import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { sqliteManager } from './sqlite.js';

const { Pool } = pg;

export interface DbConfig {
  connectionString?: string;
  isPostgres: boolean;
  isSqlite: boolean;
}

class DatabaseManager {
  private pool: pg.Pool | null = null;
  public isPostgres = false;
  public isSqlite = false;

  async init(): Promise<boolean> {
    const connStr = process.env.DATABASE_URL;

    if (connStr) {
      try {
        this.pool = new Pool({
          connectionString: connStr,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
        });

        // Test connection
        const client = await this.pool.connect();
        await client.query('SELECT 1');
        client.release();

        this.isPostgres = true;
        this.isSqlite = false;
        console.log('[DB] Connected to PostgreSQL database successfully.');

        // Execute migrations
        await this.runMigrations();
        return true;
      } catch (err) {
        console.warn('[DB] PostgreSQL connection failed. Falling back to persistent local storage adapter:', (err as Error).message);
        this.pool = null;
        this.isPostgres = false;
      }
    }

    // Default to SQLite via better-sqlite3 when no DATABASE_URL exists
    try {
      sqliteManager.init();
      this.isSqlite = true;
      this.isPostgres = false;
      console.log('[DB] Connected to SQLite store (data/goldstack.sqlite).');
      return true;
    } catch (err: any) {
      console.warn('[DB] SQLite initialization failed:', err?.message);
      console.log('[DB] No DATABASE_URL provided. Using in-memory / file-backed ledger store with seed data.');
      this.isSqlite = false;
      this.isPostgres = false;
    }

    return false;
  }

  private async runMigrations(): Promise<void> {
    if (!this.pool) return;
    try {
      const schemaPath = path.resolve(process.cwd(), 'database', 'schema.sql');
      const schemaSql = await fs.readFile(schemaPath, 'utf8');
      await this.pool.query(schemaSql);
      console.log('[DB] PostgreSQL schema & immutability triggers verified.');
    } catch (err) {
      console.error('[DB] Error applying schema migrations:', err);
    }
  }

  getPool(): pg.Pool | null {
    return this.pool;
  }

  async query<R extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<R>> {
    if (!this.pool) {
      throw new Error('Database pool not connected');
    }
    return this.pool.query<R>(text, params);
  }
}

export const dbManager = new DatabaseManager();
