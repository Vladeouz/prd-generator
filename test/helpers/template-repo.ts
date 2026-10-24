// Repo template buatan untuk test: folder sementara berisi kedua file penanda dan file kode (D-15),
// sudah di-commit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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
    S.contract,
  ].join('\n\n'),
  review2: [S.auth, S.pagination, S.database, S.errors, S.architecture, S.contract].join('\n\n'),
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

/**
 * File kode di repo template palsu (di-commit). `TEMPLATE_FILES` adalah yang harus terbaca
 * `templateFiles()` (D-15); `TEMPLATE_OTHER_FILES` di-commit tetapi tidak dibawa: fitur contoh notes,
 * file hasil generate, dan file di luar folder kode aplikasi.
 */
export const TEMPLATE_FILES = [
  'apps/api/src/app.ts',
  'apps/api/src/db/schema/users.ts',
  'apps/api/src/features/users/http/me.route.ts',
  'apps/api/src/features/users/infrastructure/drizzle-user-repository.ts',
  'apps/api/test/int/users/me.int.test.ts',
  'apps/api/test/unit/features/users/http/me.route.test.ts',
  'apps/app/lib/main.dart',
  'apps/app/test/core/l10n/failure_messages_test.dart',
];
export const TEMPLATE_OTHER_FILES = [
  'apps/api/src/db/schema/notes.ts',
  'apps/api/src/features/notes/http/notes.route.ts',
  'apps/api/test/int/notes/notes.int.test.ts',
  'apps/app/lib/features/notes/notes_dependencies.dart',
  'apps/app/lib/core/config/app_config.g.dart',
  'packages/contract/openapi.json',
];
/** File yang ada di folder kode tetapi belum di-commit: tidak dibawa. */
export const TEMPLATE_UNTRACKED_FILE = 'apps/api/src/belum-di-commit.ts';

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
  for (const file of [...TEMPLATE_FILES, ...TEMPLATE_OTHER_FILES]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), '// isi\n');
  }
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('add', '.');
  git('commit', '-q', '-m', 'awal');
  writeFileSync(join(dir, TEMPLATE_UNTRACKED_FILE), '// belum di-commit\n');
  return {
    dir,
    commit: git('rev-parse', 'HEAD'),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
