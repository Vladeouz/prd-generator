// Penyusunan `docs/TASKS.md` oleh aplikasi (FR-08, D-11) dari daftar task tahap 7a dan detail per
// fase tahap 7b. Bagian baku ditambahkan kode, bukan ditulis AI:
// - setiap *done when* diakhiri `pnpm check` hijau;
// - task dengan kriteria manual mendapat penanda **(manual)** dan langkah persiapan bernomor:
//   `.env`, layanan Docker (`docker compose up`), dan, untuk task yang menyentuh app Flutter (layer
//   `app` atau file di `apps/app/lib`), perintah Flutter web dengan `--web-browser-flag=--incognito`
//   (keputusan user setelah verifikasi manual T-014).
// Formatnya sama dengan TASKS yang divalidasi `validateTasks` (src/stages/stage-7b/tasks-markdown.ts).
import type { Stage7aTask } from '../stages/stage-7a/validate.ts';
import type { TaskDetail } from '../stages/stage-7b/validate.ts';

/** Langkah persiapan manual yang selalu ada. */
export const MANUAL_PREPARATION =
  'Persiapan: `.env` ada di root (salin dari `.env.example`), `docker compose up -d --wait`, `pnpm --filter api dev` di terminal terpisah.';
/** Langkah Flutter web untuk task manual yang menyentuh app Flutter. */
export const MANUAL_FLUTTER_WEB =
  'Dari `apps/app`: `flutter run -d chrome --web-port 8081 --web-browser-flag=--incognito --dart-define-from-file=config/dev.json`.';
export const PNPM_CHECK_GREEN = '`pnpm check` hijau';

export type ComposeTasksInput = {
  productName: string;
  phases: { phase: number; name: string }[];
  /** Daftar task 7a, berurutan. */
  tasks: Stage7aTask[];
  /** Detail 7b semua fase, per id task. */
  details: Map<string, TaskDetail>;
};

/** Task yang menyentuh kode app Flutter (bukan file native seperti `apps/app/ios/`). */
export const touchesFlutterApp = (task: Stage7aTask, detail: TaskDetail) =>
  task.layer === 'app' || detail.files.some((file) => file.includes('apps/app/lib'));

/** Path dalam backtick (bisa disalin apa adanya), keterangan dari `file_notes` di luarnya. */
function formatFile(file: string, notes: TaskDetail['file_notes']): string {
  const path = file.includes('`') ? file : `\`${file}\``;
  const note = notes?.[file]?.trim();
  return note ? `${path} (${note})` : path;
}
const stripEnd = (text: string) => text.trim().replace(/[.;]+$/, '');

function composeTask(task: Stage7aTask, detail: TaskDetail): string {
  const manual = detail.manual ?? null;
  const criteria = [
    ...detail.done_when.map(stripEnd),
    ...(manual ? [`**(manual)** ${stripEnd(manual.criterion)}`] : []),
    PNPM_CHECK_GREEN,
  ];
  const lines = [
    `- [ ] ${task.id} ${task.title}`,
    `  - layer: ${task.layer} · depends_on: ${task.depends_on.join(', ') || '-'} · refs: ${task.refs.join(', ') || '-'}`,
    `  - files: ${detail.files.map((file) => formatFile(file, detail.file_notes)).join(', ')}`,
    `  - done when: ${criteria.join('; ')}`,
  ];
  if (manual) {
    const steps = [
      MANUAL_PREPARATION,
      ...(touchesFlutterApp(task, detail) ? [MANUAL_FLUTTER_WEB] : []),
      ...manual.steps.map((step) => step.trim()),
    ];
    steps.forEach((step, i) => {
      lines.push(`    ${i + 1}. ${step}`);
    });
  }
  return lines.join('\n');
}

/** `docs/TASKS.md` lengkap; melempar error bila detail sebuah task tidak ada. */
export function composeTasks({ productName, phases, tasks, details }: ComposeTasksInput): string {
  const names = new Map(phases.map((p) => [p.phase, p.name]));
  const parts = [`# TASKS — ${productName}`];
  let phase: number | null = null;
  for (const task of tasks) {
    const detail = details.get(task.id);
    if (!detail) throw new Error(`Detail ${task.id} tidak ada.`);
    if (task.phase !== phase) {
      phase = task.phase;
      parts.push(`## Fase ${phase} — ${names.get(phase) ?? `Fase ${phase}`}`);
    }
    parts.push(composeTask(task, detail));
  }
  return `${parts.join('\n\n')}\n`;
}
