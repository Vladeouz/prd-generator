// `templateFiles()` (D-15) dan `templateSchema()` (T-043) dengan repo git sungguhan dari test/helpers/template-repo.ts.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { templateFiles, templateSchema } from '../../../src/template/files.ts';
import {
  createTemplateRepo,
  TEMPLATE_FILES,
  TEMPLATE_MIGRATIONS,
  TEMPLATE_TABLES,
  type TemplateRepo,
} from '../../helpers/template-repo.ts';

let template: TemplateRepo;
beforeEach(() => {
  template = createTemplateRepo();
});
afterEach(() => template.remove());

describe('templateFiles', () => {
  it('file kode yang di-commit, terurut; tanpa notes, hasil generate, file di luar folder, dan file belum di-commit', async () => {
    expect(await templateFiles(template.dir)).toEqual([...TEMPLATE_FILES].sort());
  });

  it('git ls-files gagal (index rusak) → error', async () => {
    writeFileSync(join(template.dir, '.git', 'index'), 'rusak');
    await expect(templateFiles(template.dir)).rejects.toThrow();
  });
});

describe('templateSchema (T-043)', () => {
  it('tabel dan kolom dari skema yang di-commit (tanpa notes), migrasi tanpa meta/, dan nomor berikutnya', async () => {
    expect(await templateSchema(template.dir)).toEqual({
      tables: TEMPLATE_TABLES,
      migrations: TEMPLATE_MIGRATIONS,
      nextMigration: '0003',
    });
  });

  it('isi skema dari commit, bukan file kerja yang belum di-commit', async () => {
    writeFileSync(
      join(template.dir, 'apps/api/src/db/schema/users.ts'),
      "export const users = pgTable('users', {\n  baru: text('kolom_baru'),\n});\n",
    );
    expect((await templateSchema(template.dir)).tables).toEqual(TEMPLATE_TABLES);
  });
});
