// Aturan task yang dipakai tahap 7a (daftar task), 7b, dan validator TASKS.md (FR-08), dipindah dari
// stage-7/validate.ts (tahap 7 lama, dihapus di T-027).

export const TASK_LAYERS = ['infra', 'db', 'api', 'contract', 'app', 'test', 'docs'] as const;

/**
 * Layer yang boleh dipakai daftar task 7a. `contract` tidak termasuk: konvensi template mewajibkan
 * `pnpm contract:generate` dijalankan dan di-commit bersama perubahan route atau skema Zod, jadi
 * task kontrak terpisah membuat `pnpm check` task API-nya gagal (uji T-018). `TASK_LAYERS` tetap
 * memuatnya agar TASKS.md lama masih terbaca validator.
 */
export const PLAN_LAYERS = TASK_LAYERS.filter((layer) => layer !== 'contract');

/** Tabel yang sudah disediakan template: tidak perlu dibuat task (boleh diubah lewat migrasi). */
export const TEMPLATE_TABLES = ['users'];

/** Setup yang sudah ada di template: dikenali dari judul task atau file konfigurasinya. */
export const TEMPLATE_SETUP: { name: string; title: RegExp; files: RegExp }[] = [
  { name: 'monorepo', title: /monorepo/i, files: /pnpm-workspace\.yaml/ },
  { name: 'Biome', title: /\bbiome\b/i, files: /biome\.json/ },
  { name: 'Docker Compose', title: /docker[ -]compose/i, files: /docker-compose\.ya?ml/ },
  { name: 'emulator', title: /emulator/i, files: /firebase\.json|docker\/firebase-emulator/ },
  {
    name: 'pipeline kontrak',
    title: /pipeline kontrak|generate client dart/i,
    files: /openapi-generator|export-openapi|scripts\/contract\.mjs/,
  },
];

/** Nama setup template yang cocok dengan judul (dan file, bila ada) sebuah task. */
export function templateSetupOf(title: string, files: string | null = null): string[] {
  return TEMPLATE_SETUP.filter(
    (s) => s.title.test(title) || (files !== null && s.files.test(files)),
  ).map((s) => s.name);
}

const NOTES = /\bnotes?\b/i;
const REMOVE = /hapus|menghapus|penghapusan|buang/i;

/** Judul task penghapusan fitur contoh notes dari template. */
export const isNotesRemoval = (title: string) => NOTES.test(title) && REMOVE.test(title);

/** Lebih dari ini hanya peringatan: task mungkin terlalu kecil (target MVP 20–45 task). */
export const MAX_TASKS = 60;
