// Export PRD dan TASKS (FR-09, NFR-01).
// - Unduh: `GET /api/projects/{id}/documents/{kind}` mengembalikan Markdown versi terbaru; dengan
//   `download=1` sebagai lampiran `PRD.md` atau `TASKS.md`.
// - Tulis ke folder proyek: `POST /api/projects/{id}/export` `{ targetDir, overwrite? }`.
//   - `targetDir` harus path absolut yang diketik user (tidak pernah dibentuk dari output AI) dan
//     folder proyek turunan template: ada `scripts/init-project.mjs` dan `.firebaserc` yang tidak
//     lagi berisi `demo-template` (penanda `pnpm init-project` sudah dijalankan). Selain itu 422.
//   - `docs/PRD.md` di tujuan yang bukan placeholder `init-project` → 409, kecuali `overwrite`.
//   - Semua pemeriksaan selesai sebelum file pertama ditulis, jadi penolakan tidak menulis apa pun.
//   - Hanya `docs/PRD.md` dan `docs/TASKS.md` yang ditulis.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../core/db/client.ts';
import { projects } from '../core/db/schema.ts';
import { AppError } from '../core/errors.ts';
import { type DocumentKind, latestDocument } from './documents.ts';

export const EXPORT_FILES: Record<DocumentKind, string> = { prd: 'PRD.md', tasks: 'TASKS.md' };

/** Penanda placeholder yang ditulis `pnpm init-project` di repo template. */
export const PLACEHOLDER_MARKER = '> Placeholder dari `pnpm init-project`.';
const TEMPLATE_PROJECT_ID = 'demo-template';

export const exportSchema = z.object({
  targetDir: z
    .string({ error: 'Isi path folder proyek.' })
    .trim()
    .min(1, 'Isi path folder proyek.'),
  overwrite: z.boolean().optional(),
});

export type ExportInput = z.infer<typeof exportSchema>;

const invalid = (message: string) =>
  new AppError('VALIDATION_ERROR', message, { targetDir: message });

function isDirectory(path: string) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Memastikan `targetDir` adalah folder proyek turunan template; mengembalikan path absolutnya. */
export function checkTargetDir(targetDir: string): string {
  if (!isAbsolute(targetDir)) {
    throw invalid('Path folder harus absolut, misalnya D:\\dev\\nama-proyek.');
  }
  const dir = resolve(targetDir);
  if (!isDirectory(dir)) throw invalid(`Folder ${dir} tidak ditemukan.`);
  if (!existsSync(join(dir, 'scripts', 'init-project.mjs'))) {
    throw invalid(
      'Folder ini bukan proyek dari repo template (tidak ada scripts/init-project.mjs).',
    );
  }
  const firebaserc = join(dir, '.firebaserc');
  if (!existsSync(firebaserc)) {
    throw invalid('Folder ini bukan proyek dari repo template (tidak ada .firebaserc).');
  }
  if (readFileSync(firebaserc, 'utf8').includes(TEMPLATE_PROJECT_ID)) {
    throw invalid(
      'Folder ini masih repo template atau belum diinisialisasi. Jalankan `pnpm init-project <nama>` di salinan baru template dulu.',
    );
  }
  return dir;
}

/** Isi dokumen untuk ditulis ke file: diakhiri satu baris baru (file di template memakai LF). */
const fileContent = (content: string) => `${content.replace(/\r\n/g, '\n').trimEnd()}\n`;

function exportDocuments(db: Db, projectId: string) {
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  const prd = latestDocument(db, projectId, 'prd');
  const tasks = latestDocument(db, projectId, 'tasks');
  if (!prd || !tasks) {
    throw new AppError('CONFLICT', 'PRD dan TASKS harus selesai dulu sebelum diekspor.');
  }
  return { prd, tasks };
}

export function exportToProject(
  { db }: { db: Db },
  projectId: string,
  input: ExportInput,
): { written: string[] } {
  const docs = exportDocuments(db, projectId);
  const dir = checkTargetDir(input.targetDir);
  const prdPath = join(dir, 'docs', EXPORT_FILES.prd);
  if (existsSync(prdPath) && !input.overwrite) {
    const current = readFileSync(prdPath, 'utf8');
    if (!current.includes(PLACEHOLDER_MARKER)) {
      throw new AppError(
        'CONFLICT',
        'docs/PRD.md di folder itu sudah berisi PRD, bukan placeholder dari init-project. Centang "Timpa" bila memang ingin menggantinya.',
        { targetDir: prdPath },
      );
    }
  }
  mkdirSync(join(dir, 'docs'), { recursive: true });
  const written: string[] = [];
  for (const kind of ['prd', 'tasks'] as const) {
    const path = join(dir, 'docs', EXPORT_FILES[kind]);
    writeFileSync(path, fileContent(docs[kind].content));
    written.push(path);
  }
  return { written };
}

/** Dokumen terbaru untuk `GET …/documents/{kind}`. */
export function documentForDownload({ db }: { db: Db }, projectId: string, kind: string) {
  if (kind !== 'prd' && kind !== 'tasks') {
    throw new AppError('NOT_FOUND', `Dokumen tidak dikenal: ${kind}.`);
  }
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  const doc = latestDocument(db, projectId, kind);
  if (!doc) {
    throw new AppError('NOT_FOUND', `${EXPORT_FILES[kind]} belum ada untuk proyek ini.`);
  }
  return { filename: EXPORT_FILES[kind], content: fileContent(doc.content) };
}
