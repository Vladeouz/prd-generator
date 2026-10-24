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
