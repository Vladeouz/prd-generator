// Membangun fixture TURUNAN tahap 3 di test/fixtures/claude/derived/ (keputusan T-009).
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

mkdirSync(target, { recursive: true });
for (const [name, build] of [
  ['stage3-gym', gym],
  ['stage3-umkm-b', umkmProfileB],
]) {
  const { envelope, output, derived } = build();
  const result = { ...envelope, result: JSON.stringify(output, null, 2), fixture_derived: derived };
  writeFileSync(join(target, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`derived/${name}.json`);
}
