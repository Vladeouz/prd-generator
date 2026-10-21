// Kontrak output tahap 7b (FR-08, D-11): detail task satu fase dalam JSON. Bagian baku tidak ditulis
// AI tetapi ditambahkan aplikasi saat menyusun `docs/TASKS.md` (`composeTasks`):
// - `pnpm check` hijau di akhir setiap *done when*;
// - persiapan manual (`.env`, layanan Docker, perintah Flutter web dengan
//   `--web-browser-flag=--incognito`).
// Aturan:
// - setiap task fase itu (dari 7a) muncul tepat sekali, tanpa task lain;
// - `files` berisi minimal satu path, tanpa file setup yang sudah disediakan template;
// - `done_when` berisi minimal satu kriteria, tanpa `pnpm check` (ditambahkan aplikasi);
// - `manual` (opsional) berisi kriteria dan langkah spesifik task itu, tanpa langkah persiapan baku.
import type { StageValidation } from '../run-stage.ts';
import type { Stage7aTask } from '../stage-7a/validate.ts';
import { templateSetupOf } from '../task-rules.ts';

export type TaskManual = { criterion: string; steps: string[] };

export type TaskDetail = {
  id: string;
  files: string[];
  done_when: string[];
  manual?: TaskManual | null;
};

export type Stage7bOutput = { tasks: TaskDetail[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isTextArray = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === 'string' && item.trim() !== '');

const PNPM_CHECK = /pnpm check/i;
const PREPARATION = /\.env\b|docker compose|flutter run/i;

export function validateStage7b(output: unknown, phaseTasks: Stage7aTask[]): StageValidation {
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
    }

    if (!isTextArray(item.done_when)) {
      errors.push(`${id} tanpa done_when`);
    } else {
      if (item.done_when.some((c) => PNPM_CHECK.test(c))) {
        errors.push(`${id} done_when menyebut \`pnpm check\`; aplikasi menambahkannya sendiri`);
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
