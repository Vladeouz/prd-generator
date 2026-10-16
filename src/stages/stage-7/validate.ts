// Kontrak output tahap 7 (FR-08), diturunkan dari `parseTasks` dan `validateTasks` di
// docs/reference/e2e-gym.mjs. Aturan tambahan FR-08:
// - tidak ada task setup yang sudah disediakan template (monorepo, Biome, Docker Compose, emulator,
//   pipeline kontrak);
// - tepat satu task penghapusan fitur contoh notes, setelah task fitur pertama;
// - setiap "done when" diakhiri `pnpm check` hijau;
// - task dengan kriteria **(manual)** menyebut persiapan `.env` dan layanan Docker
//   (`docker compose up`); task manual yang menyentuh kode app Flutter (layer `app` atau files di
//   `apps/app/lib`) juga menyebut perintah Flutter web, dan setiap `flutter run -d chrome` memakai
//   `--web-browser-flag=--incognito` (keputusan user setelah verifikasi manual T-014; file native
//   seperti `apps/app/ios/` tidak dihitung);
// - lebih dari 60 task hanya peringatan (target MVP 20–45 task).
// Perbedaan lain dari rujukan:
// - `refs` NFR-xx juga harus ada di PRD; `layer` harus salah satu dari daftar di prompt;
// - metadata task adalah semua baris berindentasi di bawah judulnya, termasuk setelah baris kosong;
//   "done when" mencakup semua baris kriteria sampai akhir task tanpa langkah manual bernomor, dan
//   baris kriteria terakhir yang harus diakhiri `pnpm check` hijau;
// - "done when terlalu singkat" (peringatan) di bawah 30 karakter, karena setiap done when kini
//   memuat `pnpm check` hijau;
// - batas minimal 10 task diganti "minimal satu task", karena setup sudah disediakan template dan
//   setiap FR tetap wajib dirujuk;
// - pemeriksaan "endpoint sebelum task auth" dan "data Flutter sebelum kontrak" dihapus, karena
//   auth, `GET /v1/me`, dan pipeline kontrak sudah ada di template.
import type { StageValidation } from '../run-stage.ts';
import { type PrdInfo, prdSection } from '../stage-6/validate.ts';

export const TASK_LAYERS = ['infra', 'db', 'api', 'contract', 'app', 'test', 'docs'] as const;

export type ParsedTask = {
  id: string;
  title: string;
  phase: string | null;
  layer: string | null;
  dependsOn: string[];
  refs: string[];
  /** false bila baris `refs:` tidak ada; `refs` kosong bila isinya `-`. */
  hasRefs: boolean;
  files: string | null;
  doneWhen: string | null;
  /** Semua baris task (judul dan metadata), untuk pemeriksaan langkah manual. */
  block: string;
};

export function parseTasks(md: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  let phase: string | null = null;
  const lines = md.split('\n').map((line) => line.trimEnd());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const ph = line.match(/^##\s+(Fase\s+\d+.*)$/i);
    if (ph) phase = (ph[1] as string).trim();
    const t = line.match(/^- \[[ x]\] (T-\d{3})\s+(.+)$/);
    if (!t) continue;
    const meta: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] as string;
      if (/^\s{2,}\S/.test(next)) {
        meta.push(next.trim());
        continue;
      }
      // Baris kosong di dalam task (misalnya antara sub-butir dan paragraf done when) tidak
      // mengakhiri task bila baris isi berikutnya masih berindentasi.
      const following = lines.slice(j + 1).find((l) => l.trim() !== '');
      if (next.trim() !== '' || following === undefined || !/^\s{2,}\S/.test(following)) break;
    }
    const joined = meta.join('\n');
    const pick = (key: string) =>
      joined.match(new RegExp(`${key}:\\s*([^·\\n]+)`, 'i'))?.[1]?.trim() ?? null;
    const list = (v: string | null) =>
      !v || v === '-'
        ? []
        : v
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
    const refs = pick('refs');
    tasks.push({
      id: t[1] as string,
      title: (t[2] as string).trim(),
      phase,
      layer: pick('layer'),
      dependsOn: list(pick('depends_on')),
      refs: list(refs),
      hasRefs: refs !== null,
      files: pick('files'),
      doneWhen: doneWhenOf(meta),
      block: [line, ...meta].join('\n'),
    });
  }
  return tasks;
}

/**
 * Kriteria *done when*: dari baris `done when:` sampai akhir task, termasuk sub-butir dan paragraf
 * lanjutan, tanpa langkah manual bernomor (`1.`, `2.`, …). Diperbaiki setelah verifikasi manual
 * T-014: sebelumnya hanya baris pertama yang dibaca, sehingga done when multi-baris ditolak.
 */
function doneWhenOf(meta: string[]): string | null {
  const start = meta.findIndex((line) => /^(?:- )?done when:/i.test(line));
  if (start === -1) return null;
  const first = (meta[start] as string).replace(/^(?:- )?done when:\s*/i, '');
  const criteria = [first, ...meta.slice(start + 1).filter((line) => !/^\d+\.\s/.test(line))]
    .map((line) => line.trim())
    .filter(Boolean);
  return criteria.length ? criteria.join('\n') : null;
}

/** Setup yang sudah ada di template: dikenali dari judul task atau file konfigurasinya. */
const TEMPLATE_SETUP: { name: string; title: RegExp; files: RegExp }[] = [
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

const NOTES_REMOVAL = /\bnotes?\b/i;
const REMOVE = /hapus|menghapus|penghapusan|buang/i;
const ENDS_WITH_CHECK = /`?pnpm check`? hijau\.?$/i;
const FLUTTER_WEB = /flutter run -d chrome/;
/** Lebih dari ini hanya peringatan: task mungkin terlalu kecil (target MVP 20–45 task). */
export const MAX_TASKS = 60;

export function validateTasks(md: string, prd: PrdInfo & { nfrIds: string[] }): StageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tasks = parseTasks(md);
  if (!/^# \S/.test(md)) errors.push('TASKS harus dimulai dengan "# "');
  if (!/^## Fase 0/m.test(md)) errors.push('tidak ada "## Fase 0"');
  if (tasks.length === 0) errors.push('tidak ada task');
  if (tasks.length > MAX_TASKS) {
    warnings.push(`${tasks.length} task, lebih dari ${MAX_TASKS} (target MVP 20–45 task)`);
  }

  const seen = new Set<string>();
  for (const t of tasks) {
    if (seen.has(t.id)) errors.push(`${t.id} duplikat`);
    if (!t.layer) errors.push(`${t.id} tanpa layer`);
    else if (!(TASK_LAYERS as readonly string[]).includes(t.layer)) {
      errors.push(`${t.id} layer tidak dikenal: ${t.layer}`);
    }
    if (!t.hasRefs) errors.push(`${t.id} tanpa refs`);
    if (!t.files) errors.push(`${t.id} tanpa files`);
    if (!t.doneWhen) errors.push(`${t.id} tanpa doneWhen`);
    for (const d of t.dependsOn) {
      if (!seen.has(d)) errors.push(`${t.id} depends_on ${d} yang belum muncul sebelumnya`);
    }
    for (const r of t.refs) {
      const known = /^FR-/.test(r)
        ? prd.frIds.includes(r)
        : /^NFR-/.test(r)
          ? prd.nfrIds.includes(r)
          : false;
      if (!known) errors.push(`${t.id} merujuk ${r} yang tidak ada di PRD`);
    }
    if (t.doneWhen && !ENDS_WITH_CHECK.test(t.doneWhen.split('\n').at(-1) as string)) {
      errors.push(`${t.id} done when tidak diakhiri \`pnpm check\` hijau`);
    }
    const setup = TEMPLATE_SETUP.filter(
      (s) => s.title.test(t.title) || (t.files !== null && s.files.test(t.files)),
    );
    if (setup.length) {
      errors.push(
        `${t.id} adalah setup yang sudah disediakan template (${setup.map((s) => s.name).join(', ')})`,
      );
    }
    if (/\(manual\)/i.test(t.block)) {
      if (!t.block.includes('.env')) errors.push(`${t.id} manual tanpa persiapan \`.env\``);
      if (!/docker compose up/.test(t.block)) {
        errors.push(`${t.id} manual tanpa menyalakan layanan Docker (\`docker compose up\`)`);
      }
      // Perintah Flutter web hanya wajib untuk task yang menyentuh app Flutter (keputusan user
      // setelah verifikasi manual T-014: task manual yang hanya menguji API tidak memakai Flutter,
      // dan file native seperti `apps/app/ios/` tidak diuji lewat Flutter web).
      const touchesApp = t.layer === 'app' || (t.files ?? '').includes('apps/app/lib');
      if (touchesApp && !FLUTTER_WEB.test(t.block)) {
        errors.push(`${t.id} manual tanpa perintah Flutter web (\`flutter run -d chrome …\`)`);
      }
    }
    for (const command of t.block.match(/flutter run -d chrome[^`\n;]*/g) ?? []) {
      if (!command.includes('--web-browser-flag=--incognito')) {
        errors.push(`${t.id} perintah Flutter web tanpa --web-browser-flag=--incognito`);
      }
    }
    seen.add(t.id);
  }

  const titles = tasks.map((t) => t.title.toLowerCase());
  titles.forEach((title, i) => {
    if (titles.indexOf(title) !== i) errors.push(`judul task duplikat: ${tasks[i]?.title}`);
  });

  const referenced = new Set(tasks.flatMap((t) => t.refs));
  for (const fr of prd.frIds) {
    if (!referenced.has(fr)) errors.push(`${fr} tidak dirujuk task mana pun`);
  }

  const removals = tasks.filter((t) => NOTES_REMOVAL.test(t.title) && REMOVE.test(t.title));
  if (removals.length !== 1) {
    errors.push(`harus ada tepat satu task penghapusan fitur contoh notes, ada ${removals.length}`);
  } else {
    const removal = tasks.indexOf(removals[0] as ParsedTask);
    const firstFeature = tasks.findIndex((t) => t.refs.some((r) => /^FR-/.test(r)));
    if (firstFeature === -1 || removal < firstFeature) {
      errors.push(`${removals[0]?.id} (hapus fitur contoh notes) harus setelah task fitur pertama`);
    }
  }

  const vague = tasks.filter((t) => t.doneWhen && t.doneWhen.length < 30);
  if (vague.length) warnings.push(`${vague.length} task dengan "done when" terlalu singkat`);
  return { errors, warnings };
}

/** Id NFR di bagian 7 PRD. */
export const nfrIds = (prdMd: string) => [
  ...new Set(prdSection(prdMd, '## 7. Non-Functional Requirements').match(/NFR-\d{2}/g) ?? []),
];
