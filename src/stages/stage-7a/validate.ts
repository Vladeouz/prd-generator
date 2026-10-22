// Kontrak output tahap 7a (FR-08, D-11): daftar task singkat dalam JSON, diturunkan dari aturan
// `validateTasks` (tahap 7 lama, docs/reference/e2e-gym.mjs) yang berlaku untuk daftar task:
// - setiap task punya judul, fase yang ada di tahap 4, fitur tahap 4 (MVP atau rekomendasi yang
//   diterima), `layer` yang dikenal, `depends_on` yang hanya merujuk task sebelumnya, dan `refs`
//   (minimal satu) yang ada di PRD;
// - task berurutan per fase, dan task sebuah fitur MVP tidak berada di fase sebelum fase fiturnya;
// - setiap `FR-xx` dirujuk minimal satu task; tidak ada judul duplikat;
// - tidak ada task setup yang sudah disediakan template;
// - tepat satu task penghapusan fitur contoh notes, setelah task fitur pertama. Hanya task ini yang
//   boleh tanpa fitur dan tanpa refs.
// Tambahan dari uji nyata T-018 (agent proyek turunan harus memutuskan sendiri tanpa aturan ini):
// - setiap task selain yang pertama punya `depends_on`;
// - tidak ada layer `contract` (kontrak di-generate bersama task api, `PLAN_LAYERS`);
// - task db menyebut `tables` yang dibuatnya; setiap tabel PRD dibuat tepat satu task, kecuali
//   tabel template (`TEMPLATE_TABLES`).
// Aturan per task untuk `files` dan *done when* ada di tahap 7b.
import type { StageValidation } from '../run-stage.ts';
import {
  isNotesRemoval,
  MAX_TASKS,
  PLAN_LAYERS,
  TEMPLATE_TABLES,
  templateSetupOf,
} from '../task-rules.ts';

export type Stage7aTask = {
  id: string;
  title: string;
  phase: number;
  feature: string | null;
  layer: string;
  depends_on: string[];
  refs: string[];
  /** Tabel yang dibuat task (hanya layer `db`; kosong bila hanya mengubah tabel yang ada). */
  tables?: string[];
};

export type Stage7aOutput = { tasks: Stage7aTask[] };

/** Data proyek untuk validasi: kode di PRD dan fitur tahap 4 (fase null untuk rekomendasi). */
export type Stage7aContext = {
  frIds: string[];
  nfrIds: string[];
  /** Id fitur → fase; null untuk fitur rekomendasi yang diterima (belum punya fase). */
  features: Map<string, number | null>;
  phases: number[];
  /** Tabel di erDiagram bagian 4 PRD. */
  tables: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export function validateStage7a(output: unknown, context: Stage7aContext): StageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = isRecord(output) ? output.tasks : undefined;
  if (!Array.isArray(raw) || raw.length === 0) return { errors: ['tasks kosong atau bukan array'] };
  if (raw.length > MAX_TASKS) {
    warnings.push(`${raw.length} task, lebih dari ${MAX_TASKS} (target MVP 20–45 task)`);
  }

  const seen = new Set<string>();
  const tasks: Stage7aTask[] = [];
  let lastPhase = Number.NEGATIVE_INFINITY;
  raw.forEach((item, i) => {
    if (!isRecord(item)) {
      errors.push(`tasks[${i}] bukan objek`);
      return;
    }
    const id = typeof item.id === 'string' && /^T-\d{3}$/.test(item.id) ? item.id : null;
    const label = id ?? `tasks[${i}]`;
    if (!id) errors.push(`${label}: id harus berformat T-001`);
    else if (seen.has(id)) errors.push(`${id} duplikat`);

    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) errors.push(`${label} tanpa judul`);
    const removal = isNotesRemoval(title);

    const phase = item.phase;
    if (typeof phase !== 'number' || !context.phases.includes(phase)) {
      errors.push(`${label} fase ${String(phase)} tidak ada di struktur fitur`);
    } else {
      if (phase < lastPhase) errors.push(`${label} fase ${phase} setelah task fase ${lastPhase}`);
      lastPhase = Math.max(lastPhase, phase);
    }

    const feature = item.feature;
    if (feature === null || feature === undefined) {
      if (!removal) errors.push(`${label} tanpa fitur tahap 4`);
    } else if (typeof feature !== 'string' || !context.features.has(feature)) {
      errors.push(`${label} merujuk fitur ${String(feature)} yang tidak ada di struktur fitur`);
    } else {
      const featurePhase = context.features.get(feature);
      if (typeof phase === 'number' && typeof featurePhase === 'number' && phase < featurePhase) {
        errors.push(`${label} di fase ${phase}, sebelum fase fitur ${feature} (${featurePhase})`);
      }
    }

    const layer = typeof item.layer === 'string' ? item.layer : '';
    if (layer === 'contract') {
      errors.push(
        `${label} layer contract tidak dipakai: jalankan pnpm contract:generate di task api yang mengubah route atau skema Zod`,
      );
    } else if (!(PLAN_LAYERS as readonly string[]).includes(layer)) {
      errors.push(`${label} layer tidak dikenal: ${layer || '(kosong)'}`);
    }

    let tables: string[] = [];
    if (item.tables !== undefined && !isStringArray(item.tables)) {
      errors.push(`${label} tables bukan array string`);
    } else if (layer === 'db' && item.tables === undefined) {
      errors.push(`${label} (layer db) tanpa tables; isi [] bila hanya mengubah tabel yang ada`);
    } else if (item.tables !== undefined) {
      tables = item.tables;
      if (layer !== 'db' && tables.length > 0) {
        errors.push(
          `${label} membuat tabel ${tables.join(', ')} padahal layer-nya ${layer}; tabel dibuat task db`,
        );
      }
    }

    const dependsOn = isStringArray(item.depends_on) ? item.depends_on : null;
    if (!dependsOn) errors.push(`${label} depends_on bukan array string`);
    for (const d of dependsOn ?? []) {
      if (!seen.has(d)) errors.push(`${label} depends_on ${d} yang belum muncul sebelumnya`);
    }
    // Agent proyek mengambil task pertama yang dependensinya sudah selesai; tanpa depends_on,
    // task bisa terambil sebelum task yang dibutuhkannya (uji T-018).
    if (dependsOn && dependsOn.length === 0 && i > 0) {
      errors.push(`${label} tanpa depends_on; hanya task pertama yang boleh tanpa dependensi`);
    }

    const refs = isStringArray(item.refs) ? item.refs : null;
    if (!refs) errors.push(`${label} refs bukan array string`);
    else if (refs.length === 0 && !removal) errors.push(`${label} tanpa refs`);
    for (const r of refs ?? []) {
      const known = /^FR-/.test(r)
        ? context.frIds.includes(r)
        : /^NFR-/.test(r)
          ? context.nfrIds.includes(r)
          : false;
      if (!known) errors.push(`${label} merujuk ${r} yang tidak ada di PRD`);
    }

    const setup = templateSetupOf(title);
    if (setup.length) {
      errors.push(`${label} adalah setup yang sudah disediakan template (${setup.join(', ')})`);
    }

    if (id) seen.add(id);
    tasks.push({
      id: id ?? label,
      title,
      phase: typeof phase === 'number' ? phase : -1,
      feature: typeof feature === 'string' ? feature : null,
      layer,
      depends_on: dependsOn ?? [],
      refs: refs ?? [],
      tables,
    });
  });

  // Setiap tabel PRD dibuat tepat satu task db (tabel template sudah ada).
  const known = new Set(context.tables.map((t) => t.toLowerCase()));
  const creators = new Map<string, string[]>();
  for (const task of tasks) {
    for (const table of task.tables ?? []) {
      const key = table.toLowerCase();
      creators.set(key, [...(creators.get(key) ?? []), task.id]);
      if (!known.has(key)) errors.push(`${task.id} membuat tabel ${table} yang tidak ada di PRD`);
    }
  }
  for (const [table, ids] of creators) {
    if (ids.length > 1)
      errors.push(`tabel ${table} dibuat lebih dari satu task: ${ids.join(', ')}`);
  }
  for (const table of known) {
    if (!creators.has(table) && !TEMPLATE_TABLES.includes(table)) {
      errors.push(`tabel ${table} di PRD tidak dibuat task mana pun`);
    }
  }

  const titles = tasks.map((t) => t.title.toLowerCase());
  titles.forEach((title, i) => {
    if (title && titles.indexOf(title) !== i)
      errors.push(`judul task duplikat: ${tasks[i]?.title}`);
  });

  const referenced = new Set(tasks.flatMap((t) => t.refs));
  for (const fr of context.frIds) {
    if (!referenced.has(fr)) errors.push(`${fr} tidak dirujuk task mana pun`);
  }

  const removals = tasks.filter((t) => isNotesRemoval(t.title));
  if (removals.length !== 1) {
    errors.push(`harus ada tepat satu task penghapusan fitur contoh notes, ada ${removals.length}`);
  } else {
    const removal = tasks.indexOf(removals[0] as Stage7aTask);
    const firstFeature = tasks.findIndex((t) => t.refs.some((r) => /^FR-/.test(r)));
    if (firstFeature === -1 || removal < firstFeature) {
      errors.push(`${removals[0]?.id} (hapus fitur contoh notes) harus setelah task fitur pertama`);
    }
  }
  return { errors, warnings };
}
