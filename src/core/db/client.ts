import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/** Database utama aplikasi, di-ignore Git. */
export const MAIN_DATABASE_PATH = join(process.cwd(), 'data', 'prd-generator.db');
export const MIGRATIONS_FOLDER = join(process.cwd(), 'drizzle');

/**
 * Membuka database di `path`, menyalakan foreign key (wajib per koneksi di SQLite agar cascade
 * berjalan), lalu menjalankan migrasi yang belum diterapkan. Aman dipanggil berulang.
 */
export function openDatabase(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

// Disimpan di globalThis agar satu koneksi per proses server walau modul dievaluasi ulang saat hot
// reload (temuan spike T-002).
const globalKey = Symbol.for('prd-generator.db');
const globalDb = globalThis as typeof globalThis & { [globalKey]?: Db };

/** Koneksi database utama. Test tidak boleh memakainya; pakai test/helpers/db.ts. */
export function getDb(): Db {
  if (process.env.NODE_ENV === 'test') {
    throw new Error('getDb() dipanggil saat NODE_ENV=test; test harus memakai createTestDb().');
  }
  globalDb[globalKey] ??= openDatabase(MAIN_DATABASE_PATH);
  return globalDb[globalKey];
}
