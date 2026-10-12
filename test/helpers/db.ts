import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Db, openDatabase } from '../../src/core/db/client.ts';

export type TestDb = { db: Db; path: string; dir: string; close: () => void };

/** Database baru yang sudah dimigrasi, di folder sementara OS; tidak pernah database utama. */
export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'prd-generator-db-'));
  const path = join(dir, 'test.db');
  const db = openDatabase(path);
  return {
    db,
    path,
    dir,
    close: () => {
      db.$client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
