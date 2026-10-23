// `templateFiles()` (D-15) dengan repo git sungguhan dari test/helpers/template-repo.ts.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { templateFiles } from '../../../src/template/files.ts';
import {
  createTemplateRepo,
  TEMPLATE_FILES,
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
