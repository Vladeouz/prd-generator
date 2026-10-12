// Pembaca salinan lokal repo template (D-06): `docs/conventions.md` apa adanya dan commit Git yang
// sedang di-checkout, agar setiap PRD bisa ditelusuri ke versi konvensinya (NFR-04).
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** File yang menandai salinan lokal repo template (PRD bagian 3). */
export const TEMPLATE_MARKERS = ['docs/conventions.md', 'scripts/init-project.mjs'] as const;

export type TemplateInfo = {
  dir: string;
  /** Isi `docs/conventions.md` byte demi byte (UTF-8), tanpa normalisasi baris. */
  conventions: string;
  /** Hash commit penuh dari `git rev-parse HEAD`. */
  commit: string;
};

export type TemplateResult =
  | { ok: true; template: TemplateInfo }
  | { ok: false; problems: string[] };

const isDirectory = async (path: string) => {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
};

const isFile = async (path: string) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

async function gitCommit(dir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: dir,
      windowsHide: true,
      timeout: 10_000,
    });
    const commit = stdout.trim();
    return /^[0-9a-f]{40,64}$/.test(commit) ? commit : null;
  } catch {
    return null;
  }
}

/** Memeriksa dan membaca template di `dir`; semua masalah dikumpulkan, bukan hanya yang pertama. */
export async function readTemplate(dir: string | undefined): Promise<TemplateResult> {
  const value = dir?.trim() ?? '';
  if (!value) {
    return {
      ok: false,
      problems: [
        '`TEMPLATE_DIR` belum diisi di `.env`. Isi dengan path absolut salinan lokal repo template.',
      ],
    };
  }
  if (!isAbsolute(value)) {
    return { ok: false, problems: [`\`TEMPLATE_DIR\` (${value}) bukan path absolut.`] };
  }
  if (!(await isDirectory(value))) {
    return { ok: false, problems: [`Folder \`TEMPLATE_DIR\` (${value}) tidak ditemukan.`] };
  }

  const problems: string[] = [];
  for (const marker of TEMPLATE_MARKERS) {
    if (!(await isFile(join(value, marker)))) {
      problems.push(`\`${marker}\` tidak ada di ${value}; folder ini bukan repo template.`);
    }
  }
  const commit = await gitCommit(value);
  if (!commit) {
    problems.push(
      `Commit Git di ${value} tidak terbaca; template harus berupa repo Git agar PRD bisa ditelusuri ke commit-nya.`,
    );
  }
  if (problems.length > 0 || !commit) return { ok: false, problems };

  const conventions = await readFile(join(value, 'docs', 'conventions.md'), 'utf8');
  return { ok: true, template: { dir: value, conventions, commit } };
}
