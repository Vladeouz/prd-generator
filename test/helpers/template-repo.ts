// Repo template buatan untuk test: folder sementara berisi kedua file penanda, sudah di-commit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Bagian konvensi buatan, dengan CRLF, Unicode, spasi di akhir, sub-heading, dan heading palsu di
 * dalam blok kode, untuk membuktikan bagian terpilih dipakai apa adanya. Baris di dalam bagian
 * memakai CRLF; antarbagian dipisah `\n\n`, sehingga bagian terpilih = bagiannya digabung `\n\n`.
 */
export const TEMPLATE_SECTIONS = {
  intro: ['# Konvensi Proyek', '', 'Rujukan untuk manusia dan agent ✓  '].join('\r\n'),
  structure: [
    '## Struktur repo',
    '',
    '```',
    '## bukan heading (di dalam blok kode)',
    'apps/api/',
    '```',
  ].join('\r\n'),
  git: ['## Git', '', '- Pesan commit: `<type>: <ringkasan> (T-xxx)`'].join('\r\n'),
  tasks: ['## Memulai proyek dan log task', '', 'Satu task per sesi; log di `docs/logs/`.'].join(
    '\r\n',
  ),
  scripts: [
    '## Script dan perintah root',
    '',
    '`pnpm check` menjalankan semua pemeriksaan.',
    '',
    '### `pnpm check` dan CI',
    '',
    'CI menjalankan perintah yang sama.',
  ].join('\r\n'),
  job: ['## Job (pg-boss)', '', 'Job terjadwal.', '', '### Shutdown', '', 'Berhenti rapi.'].join(
    '\r\n',
  ),
  auth: ['## Autentikasi', '', 'Firebase Auth; backend memverifikasi ID token.'].join('\r\n'),
  ports: ['## Port push dan storage', '', 'Port FCM dan storage.'].join('\r\n'),
  pagination: ['## Pagination', '', 'Cursor `{ items, nextCursor }`.'].join('\r\n'),
  database: ['## Database', '', 'PostgreSQL + Drizzle.'].join('\r\n'),
  errors: ['## Format error', '', '`{ error: { code, message } }`.'].join('\r\n'),
  architecture: [
    '## Clean Architecture API',
    '',
    'Per fitur.',
    '',
    '### Aturan bisnis: API vs client',
    '',
    'Aturan di API.',
  ].join('\r\n'),
  testApi: ['## Test API', '', '`pnpm --filter api test`.'].join('\r\n'),
  contract: ['## Kontrak dan client Dart', '', '`pnpm contract:generate`.'].join('\r\n'),
  flutter: [
    '## Flutter',
    '',
    'Bloc/Cubit per fitur.',
    '',
    '### Test Flutter',
    '',
    '`flutter test`.',
  ].join('\r\n'),
  notes: ['## Menghapus fitur contoh notes', '', '1. Hapus `features/notes/`.'].join('\r\n'),
};

const S = TEMPLATE_SECTIONS;

export const TEMPLATE_CONVENTIONS = `${Object.values(S).join('\n\n')}\n`;

/** Bagian yang harus ada di prompt tahap 6 dan review kedua (`CONVENTION_SECTIONS`). */
export const EXPECTED_SECTIONS = {
  stage6: [
    S.structure,
    S.job,
    S.auth,
    S.ports,
    S.pagination,
    S.database,
    S.errors,
    S.architecture,
  ].join('\n\n'),
  review2: [S.auth, S.pagination, S.database, S.errors, S.architecture].join('\n\n'),
  stage7a: [S.structure, S.tasks, S.scripts, S.database, S.contract, S.notes].join('\n\n'),
  stage7b: [
    S.structure,
    S.scripts,
    S.database,
    S.architecture,
    S.testApi,
    S.contract,
    S.flutter,
  ].join('\n\n'),
};

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
