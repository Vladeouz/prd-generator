import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getDb,
  MAIN_DATABASE_PATH,
  MIGRATIONS_FOLDER,
  openDatabase,
} from '../../../src/core/db/client.ts';

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'prd-generator-mig-'));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const journalEntries = () =>
  JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')).entries
    .length as number;

/** Isi sqlite_master (tanpa tabel catatan migrasi), untuk membandingkan skema. */
function schemaOf(path: string) {
  const sqlite = new Database(path, { readonly: true });
  const rows = sqlite
    .prepare(
      "select type, name, sql from sqlite_master where name not like '%drizzle%' order by name",
    )
    .all();
  sqlite.close();
  return rows;
}

describe('migrasi', () => {
  it('idempoten: membuka database yang sama berulang tidak mengubah skema atau catatan migrasi', () => {
    const path = join(tempDir(), 'app.db');
    const first = openDatabase(path);
    first.$client.close();
    const before = schemaOf(path);

    const second = openDatabase(path);
    const applied = second.$client.prepare('select count(*) as n from __drizzle_migrations').get();
    second.$client.close();

    expect(applied).toEqual({ n: journalEntries() });
    expect(schemaOf(path)).toEqual(before);
  });

  it('drizzle-kit generate ulang tidak menghasilkan perubahan', () => {
    // drizzle-kit 0.31 di Windows salah menggabungkan `--out` absolut dengan cwd, lalu tetap exit 0.
    // Karena itu salinan migrasi ditaruh di path relatif (node_modules/.cache, di-ignore Git), dan
    // hasilnya diperiksa dari pesan, bukan hanya exit code.
    const out = `node_modules/.cache/drizzle-check-${process.pid}`;
    dirs.push(out);
    cpSync(MIGRATIONS_FOLDER, out, { recursive: true });
    const before = readdirSync(out, { recursive: true }).sort();

    const result = spawnSync(
      `pnpm exec drizzle-kit generate --dialect sqlite --schema ./src/core/db/schema.ts --out ${out}`,
      { shell: true, encoding: 'utf8' },
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout, result.stdout + result.stderr).toContain('No schema changes');
    expect(readdirSync(out, { recursive: true }).sort()).toEqual(before);
  });
});

describe('database utama', () => {
  it('getDb() menolak dipakai saat NODE_ENV=test', () => {
    const existedBefore = existsSync(MAIN_DATABASE_PATH);
    expect(() => getDb()).toThrow(/NODE_ENV=test/);
    expect(existsSync(MAIN_DATABASE_PATH)).toBe(existedBefore);
  });
});
