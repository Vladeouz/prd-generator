// Membangun fixture TURUNAN di test/fixtures/claude/derived/ (tahap 3: keputusan T-009; tahap 6: T-012;
// tahap 7: T-014; tahap 7a: T-026; tahap 7b: T-027).
//
//   node test/fixtures/claude/build-derived-fixtures.mjs
//
// Output nyata tahap 3 dibuat sebelum prompt meminta `default_policy_key`, jadi tidak bisa lolos
// validator tahap 3. Fixture turunan adalah salinan output nyata dengan perubahan yang dicatat di
// field `fixture_derived` envelope-nya. Fixture asli (`stage3.json`, dan output di
// docs/reference/validate-report-stage3-v2.json) tetap apa adanya, sebagai contoh yang harus
// ditolak. `usage`, `total_cost_usd`, dan `duration_ms` diambil dari pemanggilan nyata sumbernya.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const here = fileURLToPath(new URL('.', import.meta.url));
const target = join(here, 'derived');

const gymEnvelope = JSON.parse(readFileSync(join(here, 'stage3.json'), 'utf8'));
const report = JSON.parse(
  readFileSync(join(root, 'docs', 'reference', 'validate-report-stage3-v2.json'), 'utf8'),
);

function setKeys(output, keys) {
  for (const question of output.questions) {
    const key = keys[question.id];
    if (!key) throw new Error(`tidak ada kunci untuk ${question.id}`);
    question.default_policy_key = key;
  }
}

/** Gym (uji end-to-end, rekomendasi stack tersedia): hanya kunci yang ditambahkan. */
function gym() {
  const output = JSON.parse(gymEnvelope.result);
  setKeys(output, {
    t1: 'platform.hp_dan_web',
    t2: 'peran_akses.dua_peran',
    t3: 'notifikasi.dalam_aplikasi_dan_push',
  });
  return {
    envelope: gymEnvelope,
    output,
    derived: {
      source: 'test/fixtures/claude/stage3.json (docs/reference/e2e-output/stage-3.json)',
      changes: ['default_policy_key ditambahkan ke t1, t2, t3'],
    },
  };
}

/**
 * Katalog UMKM (web + SEO), validate-report-stage3-v2.json ide #4 run 3. Aslinya merekomendasikan
 * Profil A dengan default "mungkin butuh" dan menyebut istilah internal. Diubah mengikuti kebijakan
 * FR-04 (SEO inti → cukup website → Profil B), untuk menguji layar pilihan eksplisit.
 */
function umkmProfileB() {
  const entry = report.results.find((result) => result.ideaIndex === 3 && result.run === 3);
  const output = structuredClone(entry.data);
  setKeys(output, {
    t1: 'mobile_masa_depan.cukup_website',
    t2: 'tenancy.satu_organisasi',
    t3: 'integrasi.tanpa_integrasi',
  });
  const [t1] = output.questions;
  t1.recommended_default = 'Tidak, cukup website saja';
  t1.default_reason =
    'Tujuan utamanya produk muncul di Google, jadi SEO adalah inti produk. Kebijakan default untuk kasus ini: cukup website.';
  t1.why_it_matters =
    'Kalau cukup website, katalog yang butuh Google lebih cocok dibuat sebagai website yang ramah SEO. Kalau butuh aplikasi HP, web dan HP dibuat dari satu codebase, tapi SEO-nya lebih lemah.';
  output.profile_recommendation = {
    profile: 'B',
    status: 'not_yet_supported',
    reason:
      'Katalog ini web-only dan tujuan utamanya muncul di Google, jadi paling cocok dibuat sebagai website yang ramah SEO.',
    depends_on_questions: ['t1'],
    fallback_if_unsupported:
      'Selama stack itu belum tersedia, kamu bisa lanjut dengan stack yang tersedia (Flutter web) ditambah mitigasi SEO seperti sitemap, meta tag per produk, dan halaman produk yang bisa di-prerender, atau menunda proyek ini.',
  };
  output.detected_risks = [
    'SEO: tujuan utama idenya adalah produk muncul di Google, sedangkan Flutter web kurang ramah SEO. Halaman produk dirender di sisi klien, jadi mesin pencari bisa lambat atau gagal mengindeks isinya.',
    'Stack website yang ramah SEO belum tersedia. Pilihannya: lanjut dengan stack yang tersedia dan menerima konsekuensi SEO, atau menunda proyek.',
    "Masalah utama ('produk susah ditemukan calon pembeli secara online') masih TEBAKAN dan belum dikonfirmasi user. Prioritas SEO dan pilihan stack bergantung pada tebakan ini.",
    'Kalau jawaban t2 ternyata banyak UMKM, cakupan produk berubah besar: pendaftaran penjual, halaman toko per UMKM, moderasi, dan pemisahan data per UMKM.',
  ];
  output.assumptions = output.assumptions.map((assumption) =>
    assumption.replace(' oleh Profil A', ' oleh stack'),
  );
  return {
    envelope: {
      type: 'result',
      subtype: 'success',
      is_error: entry.isError,
      duration_ms: entry.ms,
      num_turns: entry.numTurns,
      session_id: 'fixture-derived-umkm-stage3',
      total_cost_usd: entry.costEstimateUsd,
      usage: entry.usage,
    },
    output,
    derived: {
      source: 'docs/reference/validate-report-stage3-v2.json ide #4 (katalog UMKM) run 3',
      changes: [
        'default_policy_key ditambahkan ke t1, t2, t3',
        't1: default menjadi "Tidak, cukup website saja"; default_reason dan why_it_matters ditulis ulang tanpa istilah internal',
        'profile_recommendation menjadi Profil B (not_yet_supported) dengan fallback_if_unsupported',
        'detected_risks ditulis ulang tanpa istilah internal; dua risiko tentang Profil A dihapus',
        'assumptions: "oleh Profil A" menjadi "oleh stack"',
      ],
    },
  };
}

/**
 * PRD gym (uji end-to-end) tanpa bagian 8: sejak D-05, AI hanya menulis bagian 1–7 dan aplikasi
 * menyusun bagian 8 dari data. Bagian 1–7 apa adanya.
 */
function prdGym() {
  const envelope = JSON.parse(readFileSync(join(here, 'stage6.json'), 'utf8'));
  const start = envelope.result.indexOf('\n## 8. Assumptions & Decisions');
  if (start === -1) throw new Error('PRD gym tidak punya bagian 8');
  return {
    envelope: { ...envelope, session_id: 'fixture-derived-gym-stage6' },
    output: `${envelope.result.slice(0, start).trimEnd()}\n`,
    derived: {
      source: 'test/fixtures/claude/stage6.json (docs/reference/e2e-output/PRD.md)',
      changes: ['bagian 8 (Assumptions & Decisions dan Open Questions) dihapus'],
    },
  };
}

/**
 * TASKS gym (uji end-to-end) yang disesuaikan dengan FR-08 (T-014). Aslinya ditolak validator
 * karena berisi task setup yang sudah disediakan template; fixture asli tetap dipakai sebagai contoh
 * yang harus ditolak.
 */
function tasksGym() {
  const envelope = JSON.parse(readFileSync(join(here, 'stage7.json'), 'utf8'));
  const removed = { 'T-001': '-', 'T-007': 'T-006' };
  // Blok task dipisah baris kosong; heading fase tetap di tempatnya.
  let blocks = envelope.result.split(/\n\n(?=- \[ \] T-|## )/);
  blocks = blocks.filter(
    (block) => !Object.keys(removed).some((id) => block.startsWith(`- [ ] ${id} `)),
  );
  blocks = blocks.map((block) =>
    block
      .replace(/depends_on: ([^·\n]+)/, (_match, list) => {
        const ids = list
          .split(',')
          .map((id) => id.trim())
          .map((id) => removed[id] ?? id)
          .filter((id) => id !== '-');
        return `depends_on: ${[...new Set(ids)].join(', ') || '-'} `;
      })
      .replace(/(\n {2}- done when: .+?)\.?$/m, (line, text) =>
        /pnpm check`? hijau$/.test(text) ? line : `${text}; \`pnpm check\` hijau`,
      ),
  );
  // Format langkah manual mengikuti prompt tahap 7: penanda **(manual)** di kriteria, lalu langkah
  // bernomor di bawah done when.
  const manual = [
    '    1. Persiapan: `.env` ada di root (salin dari `.env.example`), `docker compose up -d --wait`, `pnpm --filter api dev` di terminal terpisah.',
    '    2. Dari `apps/app`: `flutter run -d chrome --web-port 8081 --web-browser-flag=--incognito --dart-define-from-file=config/dev.json`.',
    '    3. Daftar dengan email baru: tampil halaman verifikasi email; setelah verifikasi di emulator, tampil "Belum punya akses".',
  ].join('\n');
  blocks = blocks.flatMap((block) => {
    if (block.startsWith('- [ ] T-015 ')) {
      const marked = block.replace(
        /; `pnpm check` hijau$/,
        '; **(manual)** pendaftaran di web sesuai langkah di bawah; `pnpm check` hijau',
      );
      return [`${marked}\n${manual}`];
    }
    if (!block.startsWith('- [ ] T-016 ')) return [block];
    return [
      block,
      [
        '- [ ] T-044 Hapus fitur contoh notes',
        '  - layer: app · depends_on: T-016 · refs: -',
        '  - files: `apps/api/src/features/notes/`, `apps/api/src/db/schema/notes.ts`, `apps/app/lib/features/notes/`, `docs/conventions.md`',
        '  - done when: langkah "Menghapus fitur contoh notes" di `docs/conventions.md` selesai, termasuk migrasi `drop_notes`; `git grep -i note` tidak menemukan sisa rujukan fitur contoh; `pnpm check` hijau',
      ].join('\n'),
    ];
  });
  return {
    envelope: { ...envelope, session_id: 'fixture-derived-gym-stage7' },
    output: blocks.join('\n\n'),
    derived: {
      source: 'test/fixtures/claude/stage7.json (docs/reference/e2e-output/TASKS.md)',
      changes: [
        'T-001 (monorepo, Docker Compose, emulator) dan T-007 (pipeline kontrak) dihapus; depends_on ke keduanya diganti dependensinya',
        'T-044 "Hapus fitur contoh notes" ditambahkan setelah T-016',
        'setiap done when diakhiri `pnpm check` hijau',
        'T-015 diberi langkah **(manual)** dengan `.env`, Docker, dan Flutter web incognito',
      ],
    },
  };
}

/**
 * Daftar task tahap 7a (T-026, JSON) dari TASKS gym yang sudah disesuaikan FR-08 (`tasksGym`, turunan
 * docs/reference/e2e-output/TASKS.md): judul, fase, layer, depends_on, dan refs apa adanya; id
 * dinomori ulang berurutan. Fitur dipilih dari FR yang dirujuk (baris "Fitur: F-xx" di PRD gym);
 * task tanpa FR mendapat fitur pertama fasenya; task hapus notes tanpa fitur dan tanpa refs.
 */
function taskListGym() {
  const md = tasksGym().output;
  const prd = prdGym().output;
  const stage4 = JSON.parse(JSON.parse(readFileSync(join(here, 'stage4.json'), 'utf8')).result);
  const featureOfFr = new Map();
  for (const block of prd.split(/\n(?=### FR-\d{2})/)) {
    const fr = block.match(/^### (FR-\d{2})/)?.[1];
    const feature = block.match(/Fitur: (F-\d{2})/)?.[1];
    if (fr && feature) featureOfFr.set(fr, feature);
  }
  const phaseOf = new Map(stage4.phases.flatMap((p) => p.feature_ids.map((id) => [id, p.phase])));
  const firstOfPhase = new Map(stage4.phases.map((p) => [p.phase, p.feature_ids[0]]));
  const lastPhase = Math.max(...stage4.phases.map((p) => p.phase));

  const tasks = [];
  let phase = null;
  const lines = md.split('\n');
  lines.forEach((line, i) => {
    const heading = line.match(/^## Fase (\d+)/);
    // Fase di luar struktur fitur ("Fase 4 — Pengerasan dan Rilis") digabung ke fase terakhir.
    if (heading) phase = Math.min(Number(heading[1]), lastPhase);
    const task = line.match(/^- \[ \] (T-\d{3}) (.+)$/);
    if (!task) return;
    const meta = lines[i + 1] ?? '';
    const field = (key) => meta.match(new RegExp(`${key}: ([^·]+)`))?.[1]?.trim() ?? '-';
    const list = (value) => (value === '-' ? [] : value.split(',').map((x) => x.trim()));
    const refs = list(field('refs'));
    const removal = /notes/i.test(task[2]);
    const fromRefs = refs
      .map((r) => featureOfFr.get(r))
      .find((f) => f !== undefined && phaseOf.get(f) <= phase);
    tasks.push({
      oldId: task[1],
      title: task[2].trim(),
      phase,
      feature: removal ? null : (fromRefs ?? firstOfPhase.get(phase)),
      layer: field('layer'),
      depends_on: list(field('depends_on')),
      refs,
    });
  });
  const newId = new Map(tasks.map((t, i) => [t.oldId, `T-${String(i + 1).padStart(3, '0')}`]));
  // Tabel erDiagram PRD gym selain `users` (disediakan template). TASKS rujukan membuat semuanya di
  // task skema pertama; task db lain (repository) tidak membuat tabel.
  const erDiagram = prd.match(/```mermaid\n(erDiagram[\s\S]*?)```/)?.[1] ?? '';
  const tables = [...erDiagram.matchAll(/^\s+([A-Za-z_]+) \{/gm)]
    .map((m) => m[1])
    .filter((t) => t.toLowerCase() !== 'users');
  const firstDb = tasks.findIndex((t) => t.layer === 'db');
  const output = {
    tasks: tasks.map(({ oldId, depends_on, ...t }, i) => ({
      id: newId.get(oldId),
      ...t,
      depends_on: depends_on.map((d) => newId.get(d)),
      ...(t.layer === 'db' ? { tables: i === firstDb ? tables : [] } : {}),
    })),
  };
  const { envelope } = tasksGym();
  return {
    envelope: { ...envelope, session_id: 'fixture-derived-gym-stage7a' },
    output,
    derived: {
      source:
        'derived/stage7-gym.json (test/fixtures/claude/stage7.json, docs/reference/e2e-output/TASKS.md)',
      changes: [
        'TASKS Markdown diubah menjadi daftar task JSON tahap 7a: judul, fase, layer, depends_on, dan refs apa adanya',
        'id dinomori ulang berurutan (T-001 …) dan depends_on mengikuti id baru',
        'tables (prompt 7a versi 3): task db pertama membuat semua tabel erDiagram PRD selain users, task db lain []',
        'task "Fase 4 — Pengerasan dan Rilis" (tidak ada di struktur fitur tahap 4) dipindah ke fase 3',
        'feature: fitur dari baris "Fitur: F-xx" FR pertama yang dirujuk (fasenya tidak lebih lambat dari task); task tanpa FR mendapat fitur pertama fasenya; task hapus notes null',
        'usage, total_cost_usd, dan duration_ms masih dari pemanggilan tahap 7 lama (TASKS utuh)',
      ],
    },
  };
}

/**
 * Baris `files` TASKS (`` `path` (keterangan), `path` ``) menjadi daftar path dan keterangan per path.
 * Keterangan boleh memuat backtick dan koma, jadi dipotong per item dari depan, bukan per koma.
 * @param {string} line
 */
function parseFiles(line) {
  /** @type {string[]} */
  const files = [];
  /** @type {Record<string, string>} */
  const notes = {};
  let rest = line.trim();
  while (rest) {
    const item = rest.match(/^`([^`]+)`(?: \(((?:[^()]|\([^()]*\))*)\))?(?:,\s*|$)/);
    if (!item) {
      files.push(rest);
      break;
    }
    files.push(item[1]);
    if (item[2]) notes[item[1]] = item[2];
    rest = rest.slice(item[0].length);
  }
  return { files, notes };
}

/**
 * Detail task tahap 7b (T-027, JSON) untuk satu fase, dari blok task TASKS gym yang sama dengan
 * `taskListGym`: `files` dan kriteria *done when* apa adanya, dipecah per kriteria. Bagian baku yang
 * kini ditambahkan aplikasi dibuang: `pnpm check` hijau di akhir, serta langkah persiapan `.env`,
 * Docker, dan Flutter web; penanda **(manual)** menjadi `manual.criterion`, dan langkah sisanya
 * menjadi `manual.steps`.
 */
function taskDetailGym(phase) {
  const list = JSON.parse(JSON.stringify(taskListGym().output));
  const blocks = tasksGym().output.split(/\n\n(?=- \[ \] T-|## )/);
  const blockOf = new Map(
    blocks
      .map((block) => [block.match(/^- \[ \] (T-\d{3}) /)?.[1], block])
      .filter(([id]) => id !== undefined),
  );
  // Urutan blok sama dengan urutan task 7a (id lama → id baru berurutan).
  const oldIds = [...blockOf.keys()];
  const tasks = list.tasks
    .map((task, i) => ({ task, block: blockOf.get(oldIds[i]) }))
    .filter(({ task }) => task.phase === phase)
    .map(({ task, block }) => {
      const lines = block.split('\n');
      const { files: rawFiles, notes } = parseFiles(
        (lines.find((l) => l.startsWith('  - files: ')) ?? '').replace('  - files: ', ''),
      );
      // Prompt 7b versi 6 (T-043): migrasi baru mulai dari nomor berikutnya template (0003), bukan
      // nomor yang sudah dipakai template (0000–0002).
      const files = rawFiles.map((file) =>
        file.replace(/^apps\/api\/drizzle\/000[0-2]_/, 'apps/api/drizzle/0003_'),
      );
      const doneWhen = (lines.find((l) => l.startsWith('  - done when: ')) ?? '')
        .replace('  - done when: ', '')
        .replace(/;?\s*`pnpm check` hijau$/, '')
        // Prompt 7b versi 2: filter test tanpa `--` (pnpm meneruskan `--` ke vitest).
        .replace(/\b(test(?::[\w-]+)?)\s+--\s/g, '$1 ');
      const manualMatch = doneWhen.match(/;?\s*\*\*\(manual\)\*\* (.+)$/);
      const criteria = (manualMatch ? doneWhen.slice(0, manualMatch.index) : doneWhen)
        .split('; ')
        .filter(Boolean);
      const steps = lines
        .filter((l) => /^ {4}\d+\. /.test(l))
        .map((l) => l.replace(/^ {4}\d+\. /, ''))
        .filter((step) => !/^Persiapan: |flutter run/.test(step));
      return {
        id: task.id,
        files,
        ...(Object.keys(notes).length > 0 ? { file_notes: notes } : {}),
        done_when: criteria,
        manual: manualMatch ? { criterion: manualMatch[1], steps } : null,
      };
    });
  const { envelope } = tasksGym();
  return {
    envelope: { ...envelope, session_id: `fixture-derived-gym-stage7b-fase-${phase}` },
    output: { tasks },
    derived: {
      source:
        'derived/stage7-gym.json (test/fixtures/claude/stage7.json, docs/reference/e2e-output/TASKS.md)',
      changes: [
        `detail task fase ${phase} (id dari derived/stage7a-gym.json): files dan done when apa adanya, done when dipecah per "; "`,
        'prompt 7b versi 2: keterangan dalam kurung di files dipindah ke file_notes (files berisi path saja), dan `--` sebelum filter test dibuang',
        '"`pnpm check` hijau" di akhir done when dibuang (ditambahkan aplikasi)',
        'prompt 7b versi 6: migrasi bernomor 0000–0002 (sudah dipakai template) diganti 0003',
        'penanda **(manual)** menjadi manual.criterion; langkah persiapan (.env, Docker) dan Flutter web dibuang (ditambahkan aplikasi), langkah lain menjadi manual.steps',
        'usage, total_cost_usd, dan duration_ms masih dari pemanggilan tahap 7 lama (TASKS utuh)',
      ],
    },
  };
}

mkdirSync(target, { recursive: true });
for (const [name, build] of [
  ['stage3-gym', gym],
  ['stage3-umkm-b', umkmProfileB],
  ['stage6-gym', prdGym],
  ['stage7-gym', tasksGym],
  ['stage7a-gym', taskListGym],
  ...[0, 1, 2, 3].map((phase) => [`stage7b-gym-fase-${phase}`, () => taskDetailGym(phase)]),
]) {
  const { envelope, output, derived } = build();
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  const result = { ...envelope, result: text, fixture_derived: derived };
  writeFileSync(join(target, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`derived/${name}.json`);
}
