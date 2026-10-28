// Daftar file sumber dan test yang sudah ada di template (D-15), untuk prompt dan validator tahap 7b:
// task yang mengubah fitur template memakai file yang sudah ada, bukan membuat file baru dengan
// peran yang sama (uji ulang T-018: `users.route.ts` padahal template punya `me.route.ts`).
// - Sumbernya `git ls-files` di `TEMPLATE_DIR` (D-06): hanya file yang di-commit, sesuai
//   `template_commit`, tanpa cache, build, atau file lokal yang belum di-commit.
// - Hanya folder kode aplikasi (`TEMPLATE_FILE_DIRS`).
// - Tanpa fitur contoh notes, yang dihapus salah satu task (`## Menghapus fitur contoh notes`), dan
//   tanpa file hasil generate.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Folder template yang file-nya dibawa ke prompt 7b. */
export const TEMPLATE_FILE_DIRS = [
  'apps/api/src',
  'apps/api/test',
  'apps/app/lib',
  'apps/app/test',
];

/** File fitur contoh notes: path dengan segmen `notes`, atau file bernama `notes.*` / `notes_*`. */
export const isNotesExample = (path: string) =>
  path.split('/').some((segment) => segment === 'notes' || /^notes[._]/.test(segment));

/** File hasil generate (Dart `build_runner`). */
export const isGenerated = (path: string) => /\.(g|freezed|gen)\.dart$/.test(path);

/**
 * Path relatif (garis miring `/`) file template di `TEMPLATE_FILE_DIRS`, terurut. Melempar error bila
 * `git ls-files` gagal; pemanggil mengubahnya menjadi pesan tahap (FR-11).
 */
export async function templateFiles(dir: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-files', '-z', '--', ...TEMPLATE_FILE_DIRS],
    { cwd: dir, windowsHide: true, timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout
    .split('\0')
    .filter((path) => path && !isNotesExample(path) && !isGenerated(path))
    .sort();
}

/** Folder migrasi drizzle-kit dan skema Drizzle API template (T-043). */
export const TEMPLATE_MIGRATIONS_DIR = 'apps/api/drizzle';
export const TEMPLATE_SCHEMA_DIR = 'apps/api/src/db/schema';

export type TemplateTable = { name: string; columns: string[] };

/**
 * Skema database yang sudah ada di template, untuk prompt dan validator 7b (T-043; uji ulang ketiga
 * T-018: `files` menyebut migrasi `0001_…` padahal template sudah punya 0000–0002, dan meminta
 * menambah `display_name` yang sudah ada).
 */
export type TemplateSchema = {
  /** Tabel beserta nama kolom database-nya, tanpa tabel fitur contoh notes. */
  tables: TemplateTable[];
  /** Path migrasi `.sql` yang di-commit (tanpa `meta/`), termasuk migrasi notes: nomornya terpakai. */
  migrations: string[];
  /** Nomor migrasi berikutnya, 4 digit (`0003`). */
  nextMigration: string;
};

const snakeCase = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * Tabel `pgTable('<nama>', { … })` di file skema Drizzle. Nama kolom dari argumen pertama pemanggil
 * kolom (`text('display_name')`), atau dari nama properti dalam snake_case bila helper tanpa nama
 * (`id()`, `createdAt()`).
 */
export function parseSchemaTables(source: string): TemplateTable[] {
  return [...source.matchAll(/pgTable\(\s*'([^']+)'\s*,\s*\{([\s\S]*?)\n\s*\}/g)].map(
    ([, name, body]) => ({
      name: name as string,
      columns: [...(body ?? '').matchAll(/^\s*(\w+)\s*:\s*\w+\(\s*(?:'([^']+)')?/gm)].map(
        ([, key, column]) => column ?? snakeCase(key as string),
      ),
    }),
  );
}

/** Nomor 4 digit dari nama file migrasi (`0002_timestamp_precision.sql` → 2), atau null. */
export const migrationNumber = (path: string) => {
  const match = path
    .split('/')
    .at(-1)
    ?.match(/^(\d{4})_/);
  return match ? Number(match[1]) : null;
};

export function nextMigrationNumber(migrations: readonly string[]): string {
  const numbers = migrations.map(migrationNumber).filter((n): n is number => n !== null);
  return String(numbers.length ? Math.max(...numbers) + 1 : 0).padStart(4, '0');
}

/** Skema dan migrasi template dari isi yang di-commit (`git show HEAD:<path>`, D-06). */
export async function templateSchema(dir: string): Promise<TemplateSchema> {
  const git = async (args: string[]) =>
    (
      await execFileAsync('git', ['-c', 'core.quotepath=false', ...args], {
        cwd: dir,
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 10 * 1024 * 1024,
      })
    ).stdout;
  const paths = (await git(['ls-files', '-z', '--', TEMPLATE_MIGRATIONS_DIR, TEMPLATE_SCHEMA_DIR]))
    .split('\0')
    .filter(Boolean)
    .sort();
  const migrations = paths.filter((path) =>
    new RegExp(`^${TEMPLATE_MIGRATIONS_DIR}/[^/]+\\.sql$`).test(path),
  );
  const schemaFiles = paths.filter(
    (path) =>
      path.startsWith(`${TEMPLATE_SCHEMA_DIR}/`) && path.endsWith('.ts') && !isNotesExample(path),
  );
  const tables: TemplateTable[] = [];
  for (const path of schemaFiles)
    tables.push(...parseSchemaTables(await git(['show', `HEAD:${path}`])));
  return { tables, migrations, nextMigration: nextMigrationNumber(migrations) };
}

/** Teks skema template untuk prompt 7b. */
export function formatTemplateSchema(schema: TemplateSchema): string {
  const tables = schema.tables.length
    ? schema.tables.map((table) => `- ${table.name}: ${table.columns.join(', ')}`).join('\n')
    : '- (tidak ada)';
  const migrations = schema.migrations.length ? schema.migrations.join('\n') : '(tidak ada)';
  return [
    'Tabel dan kolom yang sudah ada (tanpa fitur contoh notes):',
    tables,
    '',
    'Migrasi yang sudah ada:',
    migrations,
    '',
    `Nomor migrasi berikutnya: ${schema.nextMigration}`,
  ].join('\n');
}

/** Akhiran file yang perannya unik per folder: file baru dengan akhiran ini menduplikasi template. */
export const SINGLE_ROLE_SUFFIXES = ['.route.test.ts', '.route.ts', '-repository.ts'] as const;

const roleOf = (path: string) => SINGLE_ROLE_SUFFIXES.find((suffix) => path.endsWith(suffix));
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);

/**
 * File template yang perannya sama dengan `path` di folder yang sama, bila `path` file baru (tidak
 * ada di template); null bila tidak ada. Contoh: `…/users/http/users.route.ts` → `…/users/http/me.route.ts`.
 */
export function duplicatedTemplateFile(path: string, files: readonly string[]): string | null {
  const role = roleOf(path);
  if (!role || files.includes(path)) return null;
  const folder = folderOf(path);
  return files.find((file) => folderOf(file) === folder && roleOf(file) === role) ?? null;
}
