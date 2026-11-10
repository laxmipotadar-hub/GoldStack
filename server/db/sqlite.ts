import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export class SqliteManager {
  private db: Database.Database | null = null;
  public dbPath: string;

  constructor(customPath?: string) {
    this.dbPath = customPath || path.resolve(process.cwd(), 'data', 'goldstack.sqlite');
  }

  init(): Database.Database {
    if (this.db) return this.db;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.runMigrations();
    return this.db;
  }

  private runMigrations(): void {
    if (!this.db) return;

    // Table to track applied migrations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), 'migrations');
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const getMigration = this.db.prepare('SELECT version FROM schema_migrations WHERE version = ?');
    const recordMigration = this.db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');

    for (const file of files) {
      const alreadyApplied = getMigration.get(file);
      if (!alreadyApplied) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        this.db.pragma('foreign_keys = OFF');
        const migrateTx = this.db.transaction(() => {
          this.db!.exec(sql);
          recordMigration.run(file);
        });
        migrateTx();
        this.db.pragma('foreign_keys = ON');
        console.log(`[SQLite Migration] Applied ${file}`);
      }
    }
  }

  getDb(): Database.Database {
    if (!this.db) {
      return this.init();
    }
    return this.db;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const sqliteManager = new SqliteManager();

