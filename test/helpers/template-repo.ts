// Repo template buatan untuk test: folder sementara berisi kedua file penanda, sudah di-commit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Konvensi dengan CRLF, Unicode, dan spasi di akhir, untuk membuktikan dipakai apa adanya. */
export const TEMPLATE_CONVENTIONS =
  '# Konvensi Proyek\r\n\r\n- Clean Architecture per fitur ✓  \r\n- Pesan commit: `<type>: <ringkasan> (T-xxx)`\n';

export type TemplateRepo = { dir: string; commit: string; remove(): void };

export function createTemplateRepo(conventions = TEMPLATE_CONVENTIONS): TemplateRepo {
  const dir = mkdtempSync(join(tmpdir(), 'prd-generator-template-'));
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'docs', 'conventions.md'), conventions);
  writeFileSync(join(dir, 'scripts', 'init-project.mjs'), '// init\n');
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('add', '.');
  git('commit', '-q', '-m', 'awal');
  return {
    dir,
    commit: git('rev-parse', 'HEAD'),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
