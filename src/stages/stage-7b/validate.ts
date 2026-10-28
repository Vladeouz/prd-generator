// Kontrak output tahap 7b (FR-08, D-11): detail task satu fase dalam JSON. Bagian baku tidak ditulis
// AI tetapi ditambahkan aplikasi saat menyusun `docs/TASKS.md` (`composeTasks`):
// - `pnpm check` hijau di akhir setiap *done when*;
// - persiapan manual (`.env`, layanan Docker, perintah Flutter web dengan
//   `--web-browser-flag=--incognito`).
// Aturan:
// - setiap task fase itu (dari 7a) muncul tepat sekali, tanpa task lain;
// - `files` berisi minimal satu path, tanpa file setup yang sudah disediakan template;
// - `done_when` berisi minimal satu kriteria, tanpa perintah `pnpm check` (ditambahkan aplikasi);
//   menyebutnya dalam kalimat larangan diterima (T-033);
// - `manual` (opsional) berisi kriteria dan langkah spesifik task itu, tanpa langkah persiapan baku.
// Tambahan dari uji nyata T-018 (prompt versi 2):
// - `files` berisi path saja; keterangan di `file_notes` (path → keterangan), agar path bisa disalin;
// - path skema mengikuti konvensi Database template (satu file per tabel di `schema/`);
// - perintah test tanpa `--` sebelum filter: pnpm meneruskan `--` ke vitest sehingga filternya tidak
//   berlaku dan semua test dijalankan (terbukti di proyek uji T-018).
// Tambahan dari uji ulang T-018 (prompt versi 4, T-036):
// - file baru dengan peran yang sama dengan file template di folder yang sama ditolak (D-15);
// - kriteria unit test API yang menguji request HTTP beserta status responsnya ditolak, karena
//   perilaku route diuji di integration test (konvensi Test API).
import {
  duplicatedTemplateFile,
  migrationNumber,
  TEMPLATE_MIGRATIONS_DIR,
  type TemplateSchema,
} from '../../template/files.ts';
import type { StageValidation } from '../run-stage.ts';
import type { Stage7aTask } from '../stage-7a/validate.ts';
import { templateSetupOf } from '../task-rules.ts';

export type TaskManual = { criterion: string; steps: string[] };

export type TaskDetail = {
  id: string;
  files: string[];
  /** Keterangan singkat per path di `files` (opsional). */
  file_notes?: Record<string, string> | null;
  done_when: string[];
  manual?: TaskManual | null;
};

/** Path yang bertentangan dengan konvensi template, beserta bentuk yang benar. */
const CONVENTION_PATHS: { pattern: RegExp; correct: string }[] = [
  {
    pattern: /(^|\/)apps\/api\/src\/db\/schema\.ts$/,
    correct: 'satu file per tabel di apps/api/src/db/schema/<tabel>.ts (konvensi Database)',
  },
];

/** `pnpm … test -- <filter>` / `test:int -- <filter>`: `--` membuat filter tidak berlaku. */
const TEST_DASH = /\btest(?::[\w-]+)?\s+--\s/;

/** Path tanpa spasi, tanda kurung, atau backtick (keterangan ditulis di `file_notes`). */
const isPlainPath = (file: string) => !/[\s()`]/.test(file);

export type Stage7bOutput = { tasks: TaskDetail[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isTextArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === 'string' && item.trim() !== '');

const PNPM_CHECK = /pnpm check/i;
const NEGATION = /\b(tidak|jangan|bukan|tanpa)\b/i;

/**
 * True bila kriteria menyebut `pnpm check` sebagai sesuatu yang dijalankan, bukan hanya dalam
 * kalimat larangan ("pnpm check lain tidak dipakai; jalankan flutter test …", uji ulang T-018 fase 4
 * percobaan 2). Diperiksa per anak kalimat (dipisah `;`, `,`, akhir kalimat, atau baris baru), agar
 * larangan di anak kalimat lain tidak membenarkan perintah `pnpm check`.
 */
export function requiresPnpmCheck(criterion: string): boolean {
  return criterion
    .split(/[;,\n]|\.(?:\s|$)/)
    .some((clause) => PNPM_CHECK.test(clause) && !NEGATION.test(clause));
}
const PREPARATION = /\.env\b|docker compose|flutter run/i;

const API_UNIT_TEST = /pnpm --filter api test(?=[\s`]|$)/;
const HTTP_REQUEST = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/v1\//;
const STATUS_CODE = /\b[1-5]\d{2}\b/;
const OPENAPI_DOC = /OpenAPI|operationId|dokumen/i;

/**
 * True bila kriteria unit test API (`pnpm --filter api test <filter>`, bukan `test:int`) menguji
 * request HTTP ke `/v1/…` beserta status responsnya. Menurut konvensi Test API template, perilaku
 * route yang butuh login atau database diuji di integration test; unit test route hanya memeriksa
 * DTO dan dokumen OpenAPI (uji ulang T-018, keputusan 3 T-002).
 */
export function unitTestsHttpBehavior(criterion: string): boolean {
  return (
    API_UNIT_TEST.test(criterion) &&
    HTTP_REQUEST.test(criterion) &&
    STATUS_CODE.test(criterion) &&
    !OPENAPI_DOC.test(criterion)
  );
}

/**
 * `templateFiles`: file sumber dan test yang sudah ada di template (D-15, `templateFiles()` di
 * `src/template/files.ts`); file baru yang menduplikasi peran file template di folder yang sama
 * ditolak.
 */
export function validateStage7b(
  output: unknown,
  phaseTasks: Stage7aTask[],
  templateFiles: readonly string[] = [],
  schema?: TemplateSchema,
): StageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = isRecord(output) ? output.tasks : undefined;
  if (!Array.isArray(raw)) return { errors: ['tasks bukan array'] };

  const expected = new Map(phaseTasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  raw.forEach((item, i) => {
    if (!isRecord(item) || typeof item.id !== 'string') {
      errors.push(`tasks[${i}] tanpa id`);
      return;
    }
    const id = item.id;
    const task = expected.get(id);
    if (!task) {
      errors.push(`${id} bukan task fase ini`);
      return;
    }
    if (seen.has(id)) errors.push(`${id} muncul lebih dari sekali`);
    seen.add(id);

    if (!isTextArray(item.files)) {
      errors.push(`${id} tanpa files`);
    } else {
      const setup = templateSetupOf('', item.files.join(', '));
      if (setup.length) {
        errors.push(
          `${id} menyentuh file setup yang sudah disediakan template (${setup.join(', ')})`,
        );
      }
      for (const file of item.files) {
        if (!isPlainPath(file)) {
          errors.push(`${id} files "${file}" bukan path; tulis keterangannya di file_notes`);
        }
        // Bagian path saja, agar path yang masih berketerangan tetap diperiksa.
        const path = file.trim().replace(/`/g, '').split(/\s/)[0] ?? '';
        for (const { pattern, correct } of CONVENTION_PATHS) {
          if (pattern.test(path)) {
            errors.push(`${id} files ${path} bertentangan dengan konvensi template: ${correct}`);
          }
        }
        // Migrasi dengan nomor yang sudah dipakai template (T-043).
        const number = path.startsWith(`${TEMPLATE_MIGRATIONS_DIR}/`)
          ? migrationNumber(path)
          : null;
        if (schema && number !== null && number < Number(schema.nextMigration)) {
          errors.push(
            `${id} files ${path} memakai nomor migrasi yang sudah ada di template; migrasi baru mulai dari ${schema.nextMigration} (nomor akhirnya dibuat drizzle-kit lewat db:generate)`,
          );
        }
        const existing = duplicatedTemplateFile(path, templateFiles);
        if (existing) {
          errors.push(
            `${id} files ${path} adalah file baru dengan peran yang sama dengan file template ${existing}; ubah file template itu`,
          );
        }
      }
      const notes = item.file_notes;
      if (notes !== undefined && notes !== null) {
        if (!isRecord(notes) || !Object.values(notes).every((n) => typeof n === 'string')) {
          errors.push(`${id} file_notes harus objek path → keterangan`);
        } else {
          for (const path of Object.keys(notes)) {
            if (!item.files.includes(path)) {
              errors.push(`${id} file_notes menyebut ${path} yang tidak ada di files`);
            }
          }
        }
      }
    }

    if (!isTextArray(item.done_when)) {
      errors.push(`${id} tanpa done_when`);
    } else {
      if (item.done_when.some(requiresPnpmCheck)) {
        errors.push(`${id} done_when menyebut \`pnpm check\`; aplikasi menambahkannya sendiri`);
      }
      if (item.done_when.some((c) => TEST_DASH.test(c))) {
        errors.push(
          `${id} done_when memakai \`--\` sebelum filter test; tulis \`pnpm --filter api test:int <filter>\` (dengan \`--\` filternya tidak berlaku)`,
        );
      }
      if (item.done_when.some(unitTestsHttpBehavior)) {
        errors.push(
          `${id} done_when menguji request HTTP dan status respons lewat unit test API; perilaku route diuji di integration test (\`pnpm --filter api test:int <filter>\`, konvensi Test API)`,
        );
      }
      if (item.done_when.join(' ').length < 30) warnings.push(`${id} done_when terlalu singkat`);
    }

    if (item.manual !== undefined && item.manual !== null) {
      const manual = item.manual;
      if (
        !isRecord(manual) ||
        typeof manual.criterion !== 'string' ||
        !manual.criterion.trim() ||
        !isTextArray(manual.steps)
      ) {
        errors.push(`${id} manual harus berisi criterion dan steps`);
      } else if (manual.steps.some((step) => PREPARATION.test(step))) {
        errors.push(
          `${id} manual.steps memuat langkah persiapan (.env, Docker, flutter run); aplikasi menambahkannya sendiri`,
        );
      }
    }
  });
  for (const id of expected.keys()) {
    if (!seen.has(id)) errors.push(`${id} tidak ada di output`);
  }
  return { errors, warnings };
}
