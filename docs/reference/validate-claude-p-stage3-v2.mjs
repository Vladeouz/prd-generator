#!/usr/bin/env node
// Validasi `claude -p` untuk aplikasi PRD Generator — TAHAP 3 v2 (klarifikasi teknis).
// Perbaikan dari stage3-v1:
//   1. Tabel kebijakan default per topik (diturunkan dari Profil A) -> default deterministik.
//   2. Default tidak boleh bertentangan dengan jawaban/asumsi tahap 2; ketegangan wajib masuk detected_risks.
//   3. Tenancy dipecah: isolasi data = asumsi arsitektur; satu organisasi vs marketplace = keputusan scope.
//   4. Kasus uji ke-4: web-only + SEO (menguji jalur Profil B "belum tersedia").
//   5. Laporan konsistensi default antar-run.
//   6. Pemanggilan `claude` di Windows tanpa DeprecationWarning.
//
// Cara pakai:
//   node validate-claude-p-stage3-v2.mjs --runs 3
//
// Hasil lengkap disimpan ke validate-report-stage3-v2.json di folder yang sama.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROMPT_VERSION = 'stage3-v2';

const TOPICS = [
  'platform', 'mobile_masa_depan', 'seo', 'notifikasi', 'peran_akses', 'tenancy',
  'integrasi', 'pembayaran', 'data_sensitif', 'offline', 'realtime',
];
const AFFECTS = ['profil', 'arsitektur', 'skema', 'deployment'];
const MAX_DEFAULT_MULTI = 3;

// Kebijakan default per topik untuk Profil A. Ini yang membuat default konsisten antar-run.
const DEFAULT_POLICY = {
  platform: 'Jika ide tidak menyebut platform: HP (Android dan iOS) dan web.',
  mobile_masa_depan: 'Mungkin butuh, belum pasti (tetap Profil A).',
  seo: 'Ikuti ide: jika ide menyebut Google, pencarian, atau pengunjung publik, SEO penting; selain itu tidak penting karena konten di balik login.',
  notifikasi: 'Notifikasi di dalam aplikasi ditambah push notification (FCM). Email, WhatsApp, SMS, atau Telegram TIDAK PERNAH menjadi default karena butuh penyedia pihak ketiga di luar profil.',
  peran_akses: 'Dua peran paling sederhana yang sesuai jawaban dan asumsi produk (misalnya pemilik/admin dan anggota/pengguna). Jika asumsi produk menyebut satu pembuat atau pengelola, hanya peran itu yang boleh membuat atau mengelola.',
  tenancy: 'Satu organisasi, tim, atau tempat saja; BUKAN marketplace, direktori publik, atau SaaS terbuka untuk banyak organisasi. Isolasi data per organisasi tetap dicatat sebagai asumsi arsitektur, bukan sebagai default.',
  integrasi: 'Tidak ada integrasi pihak ketiga; input manual atau tautan biasa.',
  pembayaran: 'Pembayaran di luar aplikasi; aplikasi hanya mencatat status pembayaran.',
  data_sensitif: 'Standar: login dan HTTPS dengan otorisasi per akun; tambahkan ekspor dan hapus data akun jika menyimpan data pribadi.',
  offline: 'Tidak perlu offline; aplikasi selalu online.',
  realtime: 'Tidak perlu realtime; data diperbarui saat dibuka atau di-refresh, validasi penting tetap di server.',
};

// Nama teknologi yang sudah ditentukan oleh stack profile: tidak boleh ditanyakan ke user.
const STACK_KEYWORDS = [
  'flutter', 'next.js', 'nextjs', 'react', 'hono', 'node', 'postgres', 'mysql', 'mongodb',
  'sqlite', 'firebase', 'supabase', 'vercel', 'framework', 'bahasa pemrograman', 'database apa',
];
const ISOLATION_KEYWORDS = ['isolasi', 'terisolasi', 'dipisah per', 'terpisah per', 'dipisahkan per', 'per organisasi', 'per tim', 'per tempat'];
const THIRD_PARTY_NOTIF = ['email', 'whatsapp', 'sms', 'telegram'];

// Hasil tahap 2 dengan jawaban default. source "tebakan" = fakta yang belum dikonfirmasi user.
// forbiddenDefaults: pola teks yang tidak boleh muncul di default topik tertentu (pelanggaran kebijakan/konsistensi).
const CASES = [
  {
    name: 'tugas tim (web)',
    idea: 'Aplikasi web untuk tim kecil mengelola tugas. Anggota bisa dibagi tugas, ada deadline dan notifikasi.',
    answers: [
      { topic: 'masalah', answer: 'Tugas sering terlupa atau terlambat', source: 'tebakan' },
      { topic: 'aksi_pertama', answer: 'Membuat tugas dan langsung menugaskannya ke anggota', source: 'default' },
      { topic: 'pembeda', answer: 'Sangat sederhana dan cepat dipakai', source: 'default' },
    ],
    assumptions: [
      'Pengguna adalah tim kecil sekitar 2 sampai 10 orang dengan satu pembuat tugas dan beberapa anggota penerima tugas.',
      'Fitur wajib versi pertama adalah membuat tugas dan menugaskannya ke anggota serta menetapkan deadline dan mengingatkan anggota saat deadline mendekat.',
    ],
    deferred_technical: [
      'Ide menyebut aplikasi web; platform perlu dikonfirmasi di tahap teknis.',
      'Ide menyebut notifikasi; channel pengiriman notifikasi perlu ditentukan di tahap teknis.',
    ],
    expect: {
      mustHaveAny: [['platform', 'mobile_masa_depan'], ['notifikasi']],
      mustNotHave: [],
      profile: 'A_or_B_unsupported',
      forbiddenDefaults: {
        peran_akses: ['semua anggota'],
        tenancy: ['banyak tim', 'banyak organisasi'],
        notifikasi: THIRD_PARTY_NOTIF,
      },
      multiUser: true,
    },
  },
  {
    name: 'booking futsal (HP + web)',
    idea: 'Aplikasi booking lapangan futsal untuk pemilik lapangan dan pemain, bisa di HP dan web.',
    answers: [
      { topic: 'fitur_wajib', answer: ['Lihat jadwal slot kosong', 'Booking slot oleh pemain', 'Kelola jadwal dan harga oleh pemilik'], source: 'default' },
      { topic: 'masalah', answer: 'Sering terjadi jadwal bentrok atau dobel booking', source: 'tebakan' },
      { topic: 'aksi_pertama', answer: 'Langsung lihat jadwal satu lapangan tertentu', source: 'default' },
    ],
    assumptions: [
      'Pengguna terdiri dari dua peran yaitu pemilik lapangan yang mengelola jadwal dan pemain yang melakukan booking.',
    ],
    deferred_technical: [
      'Ide menyebut aplikasi bisa diakses di HP dan web; pilihan platform perlu dibahas di tahap teknis.',
    ],
    expect: {
      mustHaveAny: [],
      mustNotHave: ['platform'],
      profile: 'A',
      forbiddenDefaults: {
        tenancy: ['marketplace', 'banyak pemilik'],
        pembayaran: ['gateway', 'qris', 'bayar online', 'dp online', 'e-wallet'],
        notifikasi: THIRD_PARTY_NOTIF,
      },
      multiUser: true,
    },
  },
  {
    name: 'keuangan pribadi (tanpa platform)',
    idea: 'Catatan keuangan pribadi.',
    answers: [
      { topic: 'masalah', answer: 'Tidak tahu uang habis ke mana', source: 'tebakan' },
      { topic: 'fitur_wajib', answer: ['Catat pemasukan dan pengeluaran', 'Kategori transaksi', 'Ringkasan bulanan'], source: 'default' },
      { topic: 'aksi_pertama', answer: 'Langsung mencatat transaksi pertama', source: 'default' },
      { topic: 'pembeda', answer: 'Pencatatan super cepat dalam hitungan detik', source: 'default' },
    ],
    assumptions: ['Pengguna adalah individu yang mencatat keuangannya sendiri tanpa berbagi dengan orang lain.'],
    deferred_technical: [],
    expect: {
      mustHaveAny: [['platform', 'mobile_masa_depan']],
      mustNotHave: [],
      profile: 'A_or_B_unsupported',
      forbiddenDefaults: {
        integrasi: ['sinkron', 'otomatis', 'impor', 'bank'],
        offline: ['ya,', 'bisa catat offline'],
        notifikasi: THIRD_PARTY_NOTIF,
      },
      multiUser: false,
    },
  },
  {
    name: 'katalog UMKM (web + SEO)',
    idea: 'Website katalog produk untuk UMKM kerajinan tangan, supaya produknya muncul di Google dan pembeli bisa pesan lewat WhatsApp.',
    answers: [
      { topic: 'masalah', answer: 'Produk susah ditemukan calon pembeli secara online', source: 'tebakan' },
      { topic: 'fitur_wajib', answer: ['Halaman daftar produk', 'Halaman detail produk', 'Tombol pesan lewat WhatsApp'], source: 'default' },
      { topic: 'aksi_pertama', answer: 'Melihat daftar produk', source: 'default' },
    ],
    assumptions: [
      'Pengunjung adalah calon pembeli umum yang tidak perlu login untuk melihat produk.',
      'Pemilik UMKM mengelola sendiri daftar produknya.',
    ],
    deferred_technical: [
      'Ide menyebut website dan muncul di Google; platform dan kebutuhan SEO perlu dibahas di tahap teknis.',
      'Ide menyebut pemesanan lewat WhatsApp; bentuk integrasinya perlu dibahas di tahap teknis.',
    ],
    expect: {
      mustHaveAny: [['mobile_masa_depan', 'platform', 'seo']],
      mustNotHave: [],
      profile: 'B_or_A_with_seo_caveat',
      forbiddenDefaults: {
        notifikasi: THIRD_PARTY_NOTIF,
        pembayaran: ['gateway', 'qris', 'bayar online', 'e-wallet'],
      },
      multiUser: false,
    },
  },
];

function formatAnswers(answers) {
  return answers
    .map((a) => {
      const value = Array.isArray(a.answer) ? a.answer.join(' | ') : a.answer;
      const note = a.source === 'tebakan' ? ' (TEBAKAN default, belum dikonfirmasi user)' : '';
      return `- ${a.topic}: ${value}${note}`;
    })
    .join('\n');
}

function buildPrompt(c) {
  const policy = Object.entries(DEFAULT_POLICY)
    .map(([topic, rule]) => `- ${topic}: ${rule}`)
    .join('\n');

  return `Kamu adalah tahap "Klarifikasi Teknis" di aplikasi PRD Generator.
Tahap sebelumnya sudah mengklarifikasi sisi produk. Tugasmu: ajukan pertanyaan TEKNIS yang benar-benar mengubah arsitektur, lalu rekomendasikan stack profile.

Katalog stack profile:
- Profil A (TERSEDIA): Flutter untuk web, iOS, dan Android dari satu codebase; backend API terpisah; PostgreSQL; Firebase Auth; push notification via FCM; API dideploy sebagai container yang selalu hidup. Kelemahan: Flutter web kurang ramah SEO dan loading awal lebih berat.
- Profil B (BELUM TERSEDIA di versi ini): Next.js full stack untuk proyek web-only yang sangat butuh SEO.

Aturan profil:
- Butuh mobile sekarang, atau mungkin butuh mobile dalam 1 tahun -> Profil A.
- Pasti web-only DAN SEO sangat penting -> Profil B dengan status "not_yet_supported".
- Belum pasti -> rekomendasikan Profil A dan isi "depends_on_questions" dengan id pertanyaan yang bisa mengubah rekomendasi.
- Jika SEO penting tetapi yang direkomendasikan Profil A, WAJIB tulis risiko SEO Flutter web di "detected_risks".
- Jika Profil B, WAJIB isi "fallback_if_unsupported": apa yang terjadi selama Profil B belum tersedia (misalnya memakai Profil A dengan konsekuensi SEO, atau menunda).

Aturan pertanyaan:
- 2 sampai 5 pertanyaan, urutkan dari yang paling berdampak ke arsitektur.
- Topik yang boleh: ${TOPICS.join(', ')}. Setiap topik paling banyak dipakai satu kali.
- JANGAN tanyakan hal yang sudah jelas dari ide atau jawaban. Contoh: jika ide sudah menyebut HP dan web, jangan tanya platform.
- JANGAN tanyakan hal yang sudah ditentukan stack profile: framework, bahasa pemrograman, jenis database, penyedia autentikasi, atau hosting.
- Jika ide hanya menyebut web, WAJIB tanyakan kemungkinan butuh mobile dalam 1 tahun (topik mobile_masa_depan).
- Jika ide tidak menyebut platform sama sekali, WAJIB tanyakan platform.
- Jika notifikasi ada di scope, WAJIB tanyakan channel notifikasinya.
- Topik "tenancy" hanya menanyakan MODEL PRODUK: satu organisasi/tempat saja, atau banyak organisasi (marketplace atau SaaS terbuka). Isolasi data per organisasi BUKAN pertanyaan; selalu catat sebagai asumsi arsitektur jika aplikasi punya lebih dari satu pengguna.
- Isi "affects" dengan bagian yang berubah oleh jawaban: ${AFFECTS.join(', ')}.
- Bahasa Indonesia santai tapi jelas, sapa user dengan "kamu".

Kebijakan jawaban default (WAJIB diikuti, jangan improvisasi):
${policy}

Aturan konsistensi:
- Default TIDAK BOLEH bertentangan dengan jawaban atau asumsi produk di bawah. Jika kebijakan default dan jawaban produk tampak bertentangan, ikuti jawaban produk dan tulis ketegangannya di "detected_risks".
- Jawaban bertanda TEBAKAN boleh dipakai, tetapi keputusan yang bergantung padanya disebut di "detected_risks".

Format default:
- type "single": "recommended_default" SATU string yang sama persis dengan salah satu opsi.
- type "multi": "recommended_default" ARRAY 1 sampai ${MAX_DEFAULT_MULTI} string, masing-masing sama persis dengan salah satu opsi.
- Opsi 2 sampai 6 per pertanyaan, dan opsi sesuai kebijakan default harus ada di antaranya.

JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.

Balas HANYA dengan satu objek JSON valid, tanpa teks lain dan tanpa blok kode markdown, dengan bentuk:
{
  "questions": [
    {
      "id": "t1",
      "topic": "salah satu topik di atas",
      "question": "teks pertanyaan",
      "type": "single",
      "options": ["opsi 1", "opsi 2"],
      "recommended_default": "opsi 1",
      "default_reason": "alasan singkat",
      "why_it_matters": "satu kalimat dampak ke arsitektur",
      "affects": ["profil"]
    }
  ],
  "profile_recommendation": {
    "profile": "A",
    "status": "supported",
    "reason": "alasan singkat",
    "depends_on_questions": ["t1"],
    "fallback_if_unsupported": ""
  },
  "detected_risks": ["..."],
  "assumptions": ["..."]
}

Ide:
"""${c.idea}"""

Jawaban klarifikasi produk:
${formatAnswers(c.answers)}

Asumsi produk:
${c.assumptions.map((a) => `- ${a}`).join('\n') || '- (tidak ada)'}

Catatan teknis dari tahap sebelumnya (deferred_technical):
${c.deferred_technical.map((a) => `- ${a}`).join('\n') || '- (tidak ada)'}`;
}

function runClaude(prompt, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
    // Di Windows, `claude` biasanya berupa claude.cmd sehingga butuh shell. Perintah dikirim sebagai
    // satu string tanpa array argumen (menghindari DEP0190). Prompt tetap lewat stdin, jadi tidak
    // ada input user yang masuk ke baris perintah.
    const child =
      process.platform === 'win32'
        ? spawn('claude -p --output-format json --max-turns 1', { cwd, shell: true })
        : spawn('claude', ['-p', '--output-format', 'json', '--max-turns', '1'], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err), ms: Date.now() - started }));
    child.on('close', (code) => resolve({ code, stdout, stderr, ms: Date.now() - started }));
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function extractJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('tidak ada objek JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const lowerText = (v) => (Array.isArray(v) ? v.join(' | ') : String(v ?? '')).toLowerCase();

// errors = melanggar kontrak; warnings = kualitas; expectations = ekspektasi per ide yang tidak terpenuhi.
function validate(obj, expect) {
  const errors = [];
  const warnings = [];
  const expectations = [];

  if (!Array.isArray(obj.questions)) return { errors: ['questions bukan array'], warnings, expectations };
  const n = obj.questions.length;
  if (n < 2 || n > 5) errors.push(`jumlah pertanyaan ${n}, harus 2-5`);

  const ids = new Set();
  const topics = new Set();
  obj.questions.forEach((q, i) => {
    const p = `questions[${i}]`;
    for (const k of ['id', 'topic', 'question', 'type', 'default_reason', 'why_it_matters']) {
      if (typeof q[k] !== 'string' || !q[k].trim()) errors.push(`${p}.${k} kosong/bukan string`);
    }
    ids.add(q.id);
    if (!TOPICS.includes(q.topic)) errors.push(`${p}.topic tidak dikenal: ${q.topic}`);
    if (topics.has(q.topic)) errors.push(`${p}.topic "${q.topic}" dipakai lebih dari sekali`);
    topics.add(q.topic);
    if (!['single', 'multi'].includes(q.type)) errors.push(`${p}.type tidak valid: ${q.type}`);

    const options = Array.isArray(q.options) ? q.options : null;
    if (!options) errors.push(`${p}.options bukan array`);
    else if (options.length < 2 || options.length > 6) errors.push(`${p}.options berisi ${options.length}, harus 2-6`);

    const d = q.recommended_default;
    if (q.type === 'single') {
      if (typeof d !== 'string') errors.push(`${p}.recommended_default harus string untuk single`);
      else if (options && !options.includes(d)) errors.push(`${p}.recommended_default tidak sama dengan opsi mana pun`);
    } else if (q.type === 'multi') {
      if (!Array.isArray(d)) errors.push(`${p}.recommended_default harus array untuk multi`);
      else {
        if (d.length < 1 || d.length > MAX_DEFAULT_MULTI) {
          errors.push(`${p}.recommended_default berisi ${d.length}, harus 1-${MAX_DEFAULT_MULTI}`);
        }
        const unknown = d.filter((x) => options && !options.includes(x));
        if (unknown.length) errors.push(`${p}.recommended_default di luar opsi: ${unknown.join(' | ')}`);
      }
    }

    if (!Array.isArray(q.affects) || q.affects.length === 0) errors.push(`${p}.affects kosong/bukan array`);
    else {
      const bad = q.affects.filter((a) => !AFFECTS.includes(a));
      if (bad.length) errors.push(`${p}.affects tidak dikenal: ${bad.join(', ')}`);
    }

    const qText = `${q.question} ${(options || []).join(' ')}`.toLowerCase();
    const stack = STACK_KEYWORDS.filter((k) => qText.includes(k));
    if (stack.length) warnings.push(`${p}: menanyakan hal yang sudah ditentukan profil (${stack.join(', ')})`);

    const forbidden = expect.forbiddenDefaults?.[q.topic] || [];
    const hit = forbidden.filter((pattern) => lowerText(d).includes(pattern));
    if (hit.length) expectations.push(`default ${q.topic} melanggar kebijakan/konsistensi (${hit.join(', ')}): ${lowerText(d)}`);
  });

  const pr = obj.profile_recommendation;
  if (!pr || typeof pr !== 'object') errors.push('profile_recommendation tidak ada');
  else {
    if (!['A', 'B'].includes(pr.profile)) errors.push(`profile tidak valid: ${pr.profile}`);
    if (!['supported', 'not_yet_supported'].includes(pr.status)) errors.push(`status tidak valid: ${pr.status}`);
    if (pr.profile === 'A' && pr.status !== 'supported') errors.push('Profil A harus berstatus supported');
    if (pr.profile === 'B' && pr.status !== 'not_yet_supported') errors.push('Profil B harus berstatus not_yet_supported');
    if (pr.profile === 'B' && !String(pr.fallback_if_unsupported ?? '').trim()) errors.push('Profil B wajib punya fallback_if_unsupported');
    if (typeof pr.reason !== 'string' || !pr.reason.trim()) errors.push('profile_recommendation.reason kosong');
    if (!Array.isArray(pr.depends_on_questions)) errors.push('depends_on_questions bukan array');
    else {
      const missing = pr.depends_on_questions.filter((id) => !ids.has(id));
      if (missing.length) errors.push(`depends_on_questions merujuk id yang tidak ada: ${missing.join(', ')}`);
    }
  }
  if (!Array.isArray(obj.detected_risks)) errors.push('detected_risks bukan array');
  if (!Array.isArray(obj.assumptions)) errors.push('assumptions bukan array');

  for (const group of expect.mustHaveAny) {
    if (!group.some((t) => topics.has(t))) expectations.push(`seharusnya menanyakan salah satu dari: ${group.join(' / ')}`);
  }
  for (const t of expect.mustNotHave) {
    if (topics.has(t)) expectations.push(`seharusnya TIDAK menanyakan: ${t}`);
  }
  if (pr) {
    const risksText = lowerText(obj.detected_risks);
    if (expect.profile === 'A' && pr.profile !== 'A') expectations.push(`seharusnya Profil A, didapat ${pr.profile}`);
    if (expect.profile === 'A_or_B_unsupported' && pr.profile === 'B' && pr.status !== 'not_yet_supported') {
      expectations.push('Profil B harus ditandai not_yet_supported');
    }
    if (expect.profile === 'B_or_A_with_seo_caveat' && pr.profile === 'A') {
      if (!Array.isArray(pr.depends_on_questions) || pr.depends_on_questions.length === 0) {
        expectations.push('Profil A untuk kasus SEO harus bergantung pada pertanyaan (depends_on_questions kosong)');
      }
      if (!risksText.includes('seo')) expectations.push('Profil A untuk kasus SEO wajib menyebut risiko SEO di detected_risks');
    }
  }

  if (expect.multiUser && Array.isArray(obj.assumptions)) {
    const asm = lowerText(obj.assumptions);
    if (!ISOLATION_KEYWORDS.some((k) => asm.includes(k))) warnings.push('asumsi isolasi data per organisasi tidak disebut');
  }

  return { errors, warnings, expectations };
}

// Bandingkan default untuk topik yang sama di semua run satu ide.
function consistencyReport(results) {
  return CASES.map((c, i) => {
    const runs = results.filter((r) => r.ideaIndex === i && r.data?.questions);
    const byTopic = {};
    for (const r of runs) {
      for (const q of r.data.questions) {
        const value = Array.isArray(q.recommended_default)
          ? [...q.recommended_default].map((x) => x.toLowerCase()).sort().join(' + ')
          : String(q.recommended_default).toLowerCase();
        (byTopic[q.topic] ||= []).push(value);
      }
    }
    const topics = Object.entries(byTopic).filter(([, values]) => values.length === runs.length);
    const differing = topics.filter(([, values]) => new Set(values).size > 1);
    return {
      idea: c.name,
      runs: runs.length,
      topicsInAllRuns: topics.length,
      consistentTopics: topics.length - differing.length,
      differing: Object.fromEntries(differing),
      profiles: runs.map((r) => r.data.profile_recommendation?.profile ?? '-'),
    };
  });
}

async function main() {
  const runsArg = process.argv.indexOf('--runs');
  const runs = runsArg > -1 ? Math.max(1, Number(process.argv[runsArg + 1]) || 1) : 1;
  // Folder kosong sementara, supaya Claude Code tidak membaca file proyek apa pun.
  const cwd = mkdtempSync(join(tmpdir(), 'prd-validate-'));
  const results = [];

  console.log(`Prompt ${PROMPT_VERSION}: menjalankan ${CASES.length} ide x ${runs} kali...\n`);
  for (const [ideaIndex, c] of CASES.entries()) {
    for (let run = 1; run <= runs; run++) {
      const label = `ide ${ideaIndex + 1} (${c.name}), run ${run}`;
      const r = await runClaude(buildPrompt(c), cwd);
      const entry = { ideaIndex, run, ms: r.ms, exitCode: r.code, ok: false, errors: [], warnings: [], expectations: [] };

      if (r.code !== 0) {
        entry.errors.push(`exit ${r.code}: ${r.stderr.trim().slice(0, 300)}`);
      } else {
        try {
          const envelope = JSON.parse(r.stdout);
          entry.isError = envelope.is_error;
          entry.numTurns = envelope.num_turns;
          entry.usage = envelope.usage;
          entry.costEstimateUsd = envelope.total_cost_usd;
          entry.rawResult = envelope.result;
          const data = extractJson(envelope.result);
          entry.data = data;
          Object.assign(entry, validate(data, c.expect));
          entry.ok = entry.errors.length === 0;
        } catch (err) {
          entry.errors.push(`parse gagal: ${err.message}`);
          entry.rawStdout = r.stdout.slice(0, 2000);
        }
      }

      results.push(entry);
      const u = entry.usage || {};
      const topics = (entry.data?.questions || []).map((q) => q.topic).join(', ') || '-';
      const pr = entry.data?.profile_recommendation;
      const profile = pr ? `Profil ${pr.profile}${pr.status === 'not_yet_supported' ? ' (belum tersedia)' : ''}` : '-';
      const status = !entry.ok ? 'GAGAL' : entry.expectations.length ? 'MELESET' : entry.warnings.length ? 'OK*' : 'OK';
      console.log(`${status.padEnd(7)} ${label} | ${(r.ms / 1000).toFixed(1)} dtk | out ${u.output_tokens ?? '?'} | ${profile}`);
      console.log(`        topik: ${topics}`);
      entry.errors.slice(0, 3).forEach((e) => console.log(`        x ${e}`));
      entry.expectations.forEach((e) => console.log(`        ? ${e}`));
      entry.warnings.slice(0, 3).forEach((w) => console.log(`        ! ${w}`));
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const expectCount = results.filter((r) => r.ok && r.expectations.length === 0).length;
  const cleanCount = results.filter((r) => r.ok && r.expectations.length === 0 && r.warnings.length === 0).length;
  const avgSec = results.reduce((s, r) => s + r.ms, 0) / results.length / 1000;
  console.log(`\nRingkasan prompt ${PROMPT_VERSION}:`);
  console.log(`  Valid kontrak       : ${okCount}/${results.length}`);
  console.log(`  Sesuai ekspektasi   : ${expectCount}/${results.length}`);
  console.log(`  Tanpa warning       : ${cleanCount}/${results.length}`);
  console.log(`  Rata-rata           : ${avgSec.toFixed(1)} detik per panggilan`);

  const consistency = consistencyReport(results);
  if (runs > 1) {
    console.log('\n  Konsistensi antar-run:');
    for (const c of consistency) {
      console.log(`    ${c.idea}: profil ${c.profiles.join(', ')} | default sama ${c.consistentTopics}/${c.topicsInAllRuns} topik`);
      for (const [topic, values] of Object.entries(c.differing)) {
        console.log(`      beda di ${topic}: ${values.join('  ||  ')}`);
      }
    }
  }

  writeFileSync(
    'validate-report-stage3-v2.json',
    JSON.stringify({ promptVersion: PROMPT_VERSION, runs, consistency, results }, null, 2),
  );
  console.log('\nDetail tersimpan di validate-report-stage3-v2.json');
  rmSync(cwd, { recursive: true, force: true });
}

main();
