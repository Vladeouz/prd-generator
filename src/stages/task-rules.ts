// Aturan task yang dipakai tahap 7a (daftar task) dan tahap 7 lama (FR-08), dipindah dari
// stage-7/validate.ts agar tetap ada setelah tahap 7 lama dihapus di T-027.

export const TASK_LAYERS = ['infra', 'db', 'api', 'contract', 'app', 'test', 'docs'] as const;

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
