import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, describe, expect, it } from 'vitest';
import {
  databasePath,
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

describe('migrasi 0002 (stage7a, stage7b, scope; T-026)', () => {
  /** Database dalam keadaan sebelum T-026: hanya migrasi 0000 dan 0001. */
  function databaseBeforeT026(path: string) {
    const folder = join(tempDir(), 'drizzle');
    cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 1);
    writeFileSync(journalPath, JSON.stringify(journal));
    const sqlite = new Database(path);
    migrate(drizzle(sqlite), { migrationsFolder: folder });
    return sqlite;
  }

  it('run stage7 lama menjadi stage7b tanpa scope yang tidak berlaku, tanpa error; data lain tetap', () => {
    const path = join(tempDir(), 'lama.db');
    const sqlite = databaseBeforeT026(path);
    const now = '2026-10-14T00:00:00.000Z';
    sqlite
      .prepare(
        "insert into projects (id, name, idea, current_stage, created_at, updated_at) values ('p1', 'Uji', 'Ide', 'export', ?, ?)",
      )
      .run(now, now);
    const run = sqlite.prepare(
      "insert into stage_runs (id, project_id, stage, attempt, prompt_version, status, output_raw, is_current, created_at) values (?, 'p1', ?, ?, '1', ?, ?, ?, ?)",
    );
    run.run('r6', 'stage6', 1, 'succeeded', '# PRD', 1, now);
    run.run('r7-gagal', 'stage7', 1, 'failed', '# TASKS rusak', 0, now);
    run.run('r7', 'stage7', 2, 'succeeded', '# TASKS', 1, now);
    sqlite
      .prepare(
        "insert into documents (id, project_id, kind, version, content, created_at) values ('d1', 'p1', 'tasks', 1, '# TASKS', ?)",
      )
      .run(now);
    sqlite.close();

    const db = openDatabase(path);
    const rows = db.$client
      .prepare(
        'select id, stage, scope, attempt, status, output_raw, is_current from stage_runs order by id',
      )
      .all();
    const documents = db.$client.prepare('select id, kind from documents').all();
    db.$client.close();

    expect(rows).toEqual([
      {
        id: 'r6',
        stage: 'stage6',
        scope: null,
        attempt: 1,
        status: 'succeeded',
        output_raw: '# PRD',
        is_current: 1,
      },
      {
        id: 'r7',
        stage: 'stage7b',
        scope: null,
        attempt: 2,
        status: 'succeeded',
        output_raw: '# TASKS',
        is_current: 0,
      },
      {
        id: 'r7-gagal',
        stage: 'stage7b',
        scope: null,
        attempt: 1,
        status: 'failed',
        output_raw: '# TASKS rusak',
        is_current: 0,
      },
    ]);
    // Dokumen TASKS yang sudah ada tidak dihapus migrasi.
    expect(documents).toEqual([{ id: 'd1', kind: 'tasks' }]);
  });

  it('indeks unik baru memakai scope, termasuk NULL', () => {
    const path = join(tempDir(), 'baru.db');
    const db = openDatabase(path);
    const index = db.$client
      .prepare("select sql from sqlite_master where name = 'stage_runs_one_current_idx'")
      .get() as { sql: string };
    db.$client.close();
    expect(index.sql).toBe(
      'CREATE UNIQUE INDEX `stage_runs_one_current_idx` ON `stage_runs` (`project_id`,`stage`,ifnull("scope", \'\')) WHERE "stage_runs"."is_current" = 1',
    );
  });
});

describe('migrasi 0003 (stage_runs.model dan effort; T-035)', () => {
  it('run lama tetap utuh dengan model dan effort null; membuka ulang tidak mengubah apa pun', () => {
    const path = join(tempDir(), 'sebelum-t035.db');
    const folder = join(tempDir(), 'drizzle');
    cpSync(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 2);
    writeFileSync(journalPath, JSON.stringify(journal));
    const sqlite = new Database(path);
    migrate(drizzle(sqlite), { migrationsFolder: folder });
    const now = '2026-10-22T00:00:00.000Z';
    sqlite
      .prepare(
        "insert into projects (id, name, idea, current_stage, created_at, updated_at) values ('p1', 'Uji', 'Ide', 'stage6', ?, ?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "insert into stage_runs (id, project_id, stage, attempt, prompt_version, status, duration_ms, is_current, created_at) values ('r5', 'p1', 'stage5', 1, '2', 'succeeded', 23000, 1, ?)",
      )
      .run(now);
    sqlite.close();

    const select =
      'select id, stage, prompt_version, duration_ms, is_current, model, effort from stage_runs';
    const expected = [
      {
        id: 'r5',
        stage: 'stage5',
        prompt_version: '2',
        duration_ms: 23000,
        is_current: 1,
        model: null,
        effort: null,
      },
    ];
    const first = openDatabase(path);
    expect(first.$client.prepare(select).all()).toEqual(expected);
    first.$client.close();
    const before = schemaOf(path);
    const second = openDatabase(path);
    expect(second.$client.prepare(select).all()).toEqual(expected);
    second.$client.close();
    expect(schemaOf(path)).toEqual(before);
  });
});

describe('database utama', () => {
  it('getDb() menolak dipakai saat NODE_ENV=test', () => {
    const existedBefore = existsSync(MAIN_DATABASE_PATH);
    expect(() => getDb()).toThrow(/NODE_ENV=test/);
    expect(existsSync(MAIN_DATABASE_PATH)).toBe(existedBefore);
  });

  it('DATABASE_PATH (opsional) mengganti path database utama, misalnya untuk test end-to-end', () => {
    expect(databasePath({})).toBe(MAIN_DATABASE_PATH);
    expect(databasePath({ DATABASE_PATH: '  ' })).toBe(MAIN_DATABASE_PATH);
    expect(databasePath({ DATABASE_PATH: 'D:/tmp/e2e.db' })).toBe('D:/tmp/e2e.db');
  });
});
