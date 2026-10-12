#!/usr/bin/env node
// Uji END-TO-END aplikasi PRD Generator: tahap 2 sampai 7 berantai, untuk satu ide.
// Semua pertanyaan dijawab otomatis dengan default (mensimulasikan user yang menerima semua default).
// Sebelum tahap 5 (review kritis), script SENGAJA menanam 4 kesalahan ke draft untuk menguji
// apakah review menangkapnya, dan apakah PRD akhir benar-benar memperbaikinya.
//
// Cara pakai:
//   node e2e-gym.mjs
//   node e2e-gym.mjs --idea "Aplikasi membership untuk sebuah gym, member bisa check-in pakai QR."
//
// Output di folder ./e2e-output/: PRD.md, TASKS.md, CLAUDE.md, stage-*.json, report.json

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ideaArg = process.argv.indexOf('--idea');
const IDEA = ideaArg > -1 && process.argv[ideaArg + 1] ? process.argv[ideaArg + 1] : 'Aplikasi membership untuk sebuah gym.';
const OUT_DIR = 'e2e-output';

// ---------------------------------------------------------------------------
// Konteks bersama
// ---------------------------------------------------------------------------

const PRODUCT_TOPICS = ['masalah', 'pengguna', 'aksi_pertama', 'fitur_wajib', 'pembeda'];
const GUESS_TOPICS = ['masalah', 'pengguna']; // fakta yang hanya diketahui user -> default = tebakan
const TECH_TOPICS = [
  'platform', 'mobile_masa_depan', 'seo', 'notifikasi', 'peran_akses', 'tenancy',
  'integrasi', 'pembayaran', 'data_sensitif', 'offline', 'realtime',
];
const REVIEW_CATEGORIES = ['stack_deploy', 'dependency_order', 'security', 'consistency', 'scope_creep', 'testability'];

const DEFAULT_POLICY = {
  platform: 'Jika ide tidak menyebut platform: HP (Android dan iOS) dan web.',
  mobile_masa_depan: 'Mungkin butuh, belum pasti. Kecuali jika SEO adalah inti produk: cukup website.',
  seo: 'Ikuti ide: penting hanya jika ide menyebut Google, pencarian, atau pengunjung publik.',
  notifikasi: 'Notifikasi di dalam aplikasi ditambah push notification. Email, WhatsApp, SMS, atau Telegram TIDAK PERNAH jadi default.',
  peran_akses: 'Dua peran paling sederhana yang sesuai jawaban dan asumsi produk.',
  tenancy: 'Satu organisasi atau tempat saja, bukan marketplace atau SaaS terbuka. Isolasi data per organisasi dicatat sebagai asumsi.',
  integrasi: 'Tidak ada integrasi pihak ketiga; input manual atau tautan biasa.',
  pembayaran: 'Pembayaran di luar aplikasi; aplikasi hanya mencatat status pembayaran.',
  data_sensitif: 'Standar: login dan HTTPS dengan otorisasi per akun; tambahkan ekspor dan hapus data akun jika menyimpan data pribadi.',
  offline: 'Tidak perlu offline.',
  realtime: 'Tidak perlu realtime; validasi penting tetap di server.',
};

const PROFILE_A = `Profil A (stack yang dipakai):
- Monorepo: apps/app (Flutter untuk web, Android, iOS), apps/api (Hono + TypeScript), packages/contract (OpenAPI + client Dart hasil generate).
- Flutter: Clean Architecture per fitur (domain: entity, interface repository, use case; data: data source dari client OpenAPI, model/DTO + mapper, repository impl; presentation: widget + Bloc/Cubit). go_router. get_it dengan registrasi manual per fitur. Error sebagai sealed Result.
- Backend Hono: Clean Architecture per fitur (domain, usecases, infrastructure Drizzle, http route + Zod yang menjadi sumber OpenAPI lewat @hono/zod-openapi).
- Database: PostgreSQL + Drizzle + drizzle-kit. Lokal lewat Docker Compose.
- Auth: Firebase Auth di client; backend memverifikasi ID token. Tabel users tanpa password, dibuat saat request pertama berdasarkan firebase_uid. Peran dan keanggotaan di PostgreSQL.
- File: Cloud Storage for Firebase; PostgreSQL hanya menyimpan path dan metadata.
- Notifikasi: FCM untuk push; job terjadwal memakai pg-boss.
- Deploy: API sebagai container yang selalu hidup; Flutter web di hosting statis; mobile lewat store.
- Testing: Vitest (API), flutter_test + bloc_test + mocktail (app). Lokal: Firebase Auth Emulator.`;

const COMMON_RULES = `Bahasa Indonesia santai tapi jelas, sapa user dengan "kamu".
Jangan menyebut istilah internal seperti "Profil A", "Profil B", atau "stack profile" di teks yang dibaca user (pertanyaan dan opsi).
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.`;

// ---------------------------------------------------------------------------
// Pemanggilan Claude Code
// ---------------------------------------------------------------------------

function runClaude(prompt, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
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

function extractMarkdown(text) {
  let t = String(text).trim();
  const fenced = t.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenced) t = fenced[1].trim();
  const h = t.indexOf('# ');
  if (h === -1) throw new Error('tidak ada heading markdown');
  return t.slice(h);
}

// Menjalankan satu tahap. Jika output tidak bisa dipakai, dicoba ulang SEKALI dengan daftar errornya.
async function runStage({ key, label, prompt, parse, validate, cwd, stats }) {
  let attempt = 0;
  let currentPrompt = prompt;
  while (attempt < 2) {
    attempt++;
    process.stdout.write(`- ${label} (percobaan ${attempt})... `);
    const r = await runClaude(currentPrompt, cwd);
    const record = { stage: key, attempt, ms: r.ms, errors: [], warnings: [] };
    stats.push(record);

    let result;
    if (r.code !== 0) {
      record.errors.push(`exit ${r.code}: ${r.stderr.trim().slice(0, 300)}`);
    } else {
      try {
        const envelope = JSON.parse(r.stdout);
        record.usage = envelope.usage;
        record.costEstimateUsd = envelope.total_cost_usd;
        record.isError = envelope.is_error;
        result = parse(envelope.result);
        const v = validate(result);
        record.errors.push(...v.errors);
        record.warnings.push(...(v.warnings || []));
        if (v.errors.length) record.rawResult = String(envelope.result).slice(0, 30000);
      } catch (err) {
        record.errors.push(`parse gagal: ${err.message}`);
        record.raw = r.stdout.slice(0, 3000);
      }
    }

    const out = record.usage?.output_tokens ?? '?';
    console.log(`${record.errors.length ? 'GAGAL' : 'OK'} | ${(r.ms / 1000).toFixed(1)} dtk | out ${out}`);
    record.errors.slice(0, 5).forEach((e) => console.log(`    x ${e}`));
    record.warnings.slice(0, 5).forEach((w) => console.log(`    ! ${w}`));

    if (record.errors.length === 0) return result;
    currentPrompt = `${prompt}\n\nPERHATIAN: output kamu sebelumnya tidak valid karena:\n${record.errors
      .slice(0, 10)
      .map((e) => `- ${e}`)
      .join('\n')}\nPerbaiki dan kirim ulang output lengkap sesuai format.`;
  }
  throw new Error(`${label} gagal setelah 2 percobaan`);
}

// ---------------------------------------------------------------------------
// Validator bersama untuk pertanyaan (tahap 2 dan 3)
// ---------------------------------------------------------------------------

function validateQuestions(questions, allowedTopics, { allowText }) {
  const errors = [];
  if (!Array.isArray(questions)) return ['questions bukan array'];
  const topics = new Set();
  questions.forEach((q, i) => {
    const p = `questions[${i}]`;
    if (!allowedTopics.includes(q.topic)) errors.push(`${p}.topic tidak dikenal: ${q.topic}`);
    if (topics.has(q.topic)) errors.push(`${p}.topic "${q.topic}" dipakai lebih dari sekali`);
    topics.add(q.topic);
    const types = allowText ? ['single', 'multi', 'text'] : ['single', 'multi'];
    if (!types.includes(q.type)) errors.push(`${p}.type tidak valid: ${q.type}`);
    const options = Array.isArray(q.options) ? q.options : [];
    if (q.type !== 'text' && (options.length < 2 || options.length > 6)) errors.push(`${p}.options harus 2-6`);
    const d = q.recommended_default;
    if (q.type === 'single' && (typeof d !== 'string' || !options.includes(d))) {
      errors.push(`${p}.recommended_default harus sama persis dengan salah satu opsi`);
    }
    if (q.type === 'multi' && (!Array.isArray(d) || d.length < 1 || d.length > 3 || d.some((x) => !options.includes(x)))) {
      errors.push(`${p}.recommended_default harus array 1-3 opsi yang ada`);
    }
    if (q.type === 'text' && typeof d !== 'string') errors.push(`${p}.recommended_default harus string`);
  });
  return errors;
}

const jargonWarnings = (questions) =>
  questions
    .filter((q) => /profil [ab]|stack profile/i.test(`${q.question} ${(q.options || []).join(' ')}`))
    .map((q) => `${q.id}: istilah internal muncul di teks untuk user`);

// ---------------------------------------------------------------------------
// Tahap 2 — Klarifikasi produk
// ---------------------------------------------------------------------------

function promptStage2(idea) {
  return `Kamu adalah tahap "Klarifikasi Produk" di aplikasi PRD Generator.
Dari ide di bawah, susun pertanyaan klarifikasi PRODUK (bukan teknis).

1. Nilai kejelasan ide sebagai "clarity" 1 (sangat samar) sampai 5 (sangat jelas).
2. Jumlah pertanyaan WAJIB: clarity 1 -> 5, 2 -> 4, 3 -> 3, 4 atau 5 -> 2.
3. Topik yang boleh: ${PRODUCT_TOPICS.join(', ')}. Tiap topik paling banyak sekali. Lewati topik yang sudah jelas dan catat sebagai asumsi produk.
4. DILARANG bertanya atau berasumsi soal platform, channel notifikasi, login, database, server, hosting, deployment, atau tech stack. Jika ide menyinggungnya, catat di "deferred_technical".
5. Default mengarah ke SCOPE TERKECIL yang masih berguna. type single: satu string sama persis dengan salah satu opsi. type multi: array 1-3 opsi. type text: options kosong.
${COMMON_RULES}

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"clarity":1,"clarity_reason":"...","questions":[{"id":"q1","topic":"...","question":"...","type":"single","options":["..."],"recommended_default":"...","why_it_matters":"..."}],"assumptions":["..."],"deferred_technical":["..."]}

Ide:
"""${idea}"""`;
}

function validateStage2(o) {
  const errors = validateQuestions(o.questions, PRODUCT_TOPICS, { allowText: true });
  if (!Number.isInteger(o.clarity) || o.clarity < 1 || o.clarity > 5) errors.push('clarity tidak valid');
  else if (Array.isArray(o.questions) && o.questions.length !== Math.max(2, 6 - o.clarity)) {
    errors.push(`clarity ${o.clarity} harus ${Math.max(2, 6 - o.clarity)} pertanyaan, didapat ${o.questions.length}`);
  }
  if (!Array.isArray(o.assumptions)) errors.push('assumptions bukan array');
  if (!Array.isArray(o.deferred_technical)) errors.push('deferred_technical bukan array');
  return { errors, warnings: jargonWarnings(o.questions || []) };
}

// ---------------------------------------------------------------------------
// Tahap 3 — Klarifikasi teknis
// ---------------------------------------------------------------------------

function formatAnswers(answers) {
  return answers
    .map((a) => {
      const v = Array.isArray(a.answer) ? a.answer.join(' | ') : a.answer;
      const note = a.source === 'tebakan' ? ' (TEBAKAN default, belum dikonfirmasi user)' : '';
      return `- ${a.topic}: ${v}${note}`;
    })
    .join('\n');
}

function promptStage3(ctx) {
  const policy = Object.entries(DEFAULT_POLICY).map(([t, r]) => `- ${t}: ${r}`).join('\n');
  return `Kamu adalah tahap "Klarifikasi Teknis" di aplikasi PRD Generator.
Ajukan pertanyaan TEKNIS yang benar-benar mengubah arsitektur, lalu rekomendasikan stack profile.

Katalog: Profil A (TERSEDIA) = Flutter web/iOS/Android + backend API + PostgreSQL + Firebase Auth + FCM, API sebagai container. Kelemahan: Flutter web kurang ramah SEO.
Profil B (BELUM TERSEDIA) = Next.js untuk web-only yang sangat butuh SEO.
- Butuh mobile sekarang atau mungkin dalam 1 tahun -> A. Pasti web-only dan SEO sangat penting -> B dengan status "not_yet_supported" dan "fallback_if_unsupported". Belum pasti -> A dengan "depends_on_questions".

Aturan:
- 2 sampai 5 pertanyaan. Topik: ${TECH_TOPICS.join(', ')}. Tiap topik paling banyak sekali.
- Jangan tanyakan yang sudah jelas, atau yang sudah ditentukan profil (framework, bahasa, database, penyedia auth, hosting).
- Ide hanya menyebut web -> wajib mobile_masa_depan. Ide tanpa platform -> wajib platform. Notifikasi di scope -> wajib notifikasi.
- tenancy hanya soal model produk (satu organisasi vs banyak/marketplace). Isolasi data per organisasi selalu dicatat sebagai asumsi.
- "affects": pilih dari profil, arsitektur, skema, deployment.

Kebijakan default (WAJIB):
${policy}
Default tidak boleh bertentangan dengan jawaban atau asumsi produk; jika tampak bertentangan, ikuti jawaban produk dan tulis di "detected_risks". Keputusan yang bergantung pada TEBAKAN juga ditulis di "detected_risks".
${COMMON_RULES}

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"questions":[{"id":"t1","topic":"...","question":"...","type":"single","options":["..."],"recommended_default":"...","default_reason":"...","why_it_matters":"...","affects":["profil"]}],"profile_recommendation":{"profile":"A","status":"supported","reason":"...","depends_on_questions":[],"fallback_if_unsupported":""},"detected_risks":["..."],"assumptions":["..."]}

Ide:
"""${ctx.idea}"""

Jawaban klarifikasi produk:
${formatAnswers(ctx.productAnswers)}

Asumsi produk:
${ctx.productAssumptions.map((a) => `- ${a}`).join('\n') || '- (tidak ada)'}

Catatan teknis dari tahap sebelumnya:
${ctx.deferred.map((a) => `- ${a}`).join('\n') || '- (tidak ada)'}`;
}

function validateStage3(o) {
  const errors = validateQuestions(o.questions, TECH_TOPICS, { allowText: false });
  if (Array.isArray(o.questions) && (o.questions.length < 2 || o.questions.length > 5)) errors.push('jumlah pertanyaan harus 2-5');
  const pr = o.profile_recommendation;
  if (!pr || !['A', 'B'].includes(pr.profile)) errors.push('profile_recommendation.profile tidak valid');
  if (pr?.profile === 'A' && pr.status !== 'supported') errors.push('Profil A harus supported');
  if (pr?.profile === 'B' && pr.status !== 'not_yet_supported') errors.push('Profil B harus not_yet_supported');
  if (!Array.isArray(o.detected_risks)) errors.push('detected_risks bukan array');
  if (!Array.isArray(o.assumptions)) errors.push('assumptions bukan array');
  return { errors, warnings: jargonWarnings(o.questions || []) };
}

// ---------------------------------------------------------------------------
// Tahap 4 — Struktur fitur dan draft fase
// ---------------------------------------------------------------------------

function contextBlock(ctx) {
  return `Ide:
"""${ctx.idea}"""

Jawaban produk:
${formatAnswers(ctx.productAnswers)}

Jawaban teknis:
${formatAnswers(ctx.techAnswers)}

Asumsi:
${[...ctx.productAssumptions, ...ctx.techAssumptions].map((a) => `- ${a}`).join('\n') || '- (tidak ada)'}

Risiko yang sudah terdeteksi:
${ctx.risks.map((a) => `- ${a}`).join('\n') || '- (tidak ada)'}`;
}

function promptStage4(ctx) {
  return `Kamu adalah tahap "Struktur Fitur" di aplikasi PRD Generator.
Susun fitur MVP, fitur rekomendasi, non-goals, dan draft urutan fase implementasi.

Aturan:
- "mvp_features" HANYA berisi fitur yang berasal dari jawaban user (source "user") dan fondasi teknis yang memang dibutuhkan fitur itu (source "fondasi"), misalnya akun dan login, atau pengelolaan organisasi dan peran.
- Fitur bagus yang TIDAK diminta user masuk "recommended_features", bukan MVP.
- "non_goals": hal yang eksplisit TIDAK dikerjakan di versi pertama, termasuk semua fitur rekomendasi.
- "phases": fase 0 bernama "Fondasi" (setup proyek, skema data, auth, dan fitur fondasi). Fase berikutnya diurutkan berdasarkan dependensi teknis, bukan prioritas bisnis. Fitur tidak boleh berada di fase lebih awal daripada fitur yang menjadi dependensinya.
- Setiap fitur MVP berada di tepat satu fase.
- "open_questions": hal yang masih TEBAKAN atau belum pasti.
- "technical_decisions": keputusan teknis utama yang sudah diambil.

${PROFILE_A}

${COMMON_RULES}

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"product_name":"...","mvp_features":[{"id":"F-01","name":"...","description":"...","source":"user","sub_features":["..."],"depends_on":[]}],"recommended_features":[{"id":"R-01","name":"...","reason":"..."}],"non_goals":["..."],"phases":[{"phase":0,"name":"Fondasi","goal":"...","feature_ids":["F-01"]}],"technical_decisions":["..."],"open_questions":["..."]}

${contextBlock(ctx)}`;
}

function validateStage4(o) {
  const errors = [];
  const features = Array.isArray(o.mvp_features) ? o.mvp_features : [];
  if (!features.length) errors.push('mvp_features kosong');
  if (!Array.isArray(o.recommended_features)) errors.push('recommended_features bukan array');
  if (!Array.isArray(o.non_goals) || !o.non_goals.length) errors.push('non_goals kosong');
  if (!Array.isArray(o.phases) || !o.phases.length) errors.push('phases kosong');
  const ids = new Set(features.map((f) => f.id));
  if (ids.size !== features.length) errors.push('id fitur tidak unik');
  features.forEach((f) => {
    if (!['user', 'fondasi'].includes(f.source)) errors.push(`${f.id}.source tidak valid: ${f.source}`);
    (f.depends_on || []).forEach((d) => !ids.has(d) && errors.push(`${f.id}.depends_on merujuk ${d} yang tidak ada`));
  });
  const phaseOf = {};
  (o.phases || []).forEach((p) => (p.feature_ids || []).forEach((id) => {
    if (phaseOf[id] !== undefined) errors.push(`${id} ada di lebih dari satu fase`);
    phaseOf[id] = p.phase;
  }));
  if (!(o.phases || []).some((p) => p.phase === 0)) errors.push('tidak ada fase 0');
  features.forEach((f) => {
    if (phaseOf[f.id] === undefined) errors.push(`${f.id} tidak ada di fase mana pun`);
    (f.depends_on || []).forEach((d) => {
      if (phaseOf[d] !== undefined && phaseOf[f.id] !== undefined && phaseOf[d] > phaseOf[f.id]) {
        errors.push(`${f.id} (fase ${phaseOf[f.id]}) bergantung pada ${d} (fase ${phaseOf[d]}) yang lebih lambat`);
      }
    });
  });
  (o.recommended_features || []).forEach((r) => phaseOf[r.id] !== undefined && errors.push(`${r.id} (rekomendasi) masuk fase`));
  return { errors, warnings: [] };
}

// ---------------------------------------------------------------------------
// Kesalahan yang sengaja ditanam sebelum tahap 5
// ---------------------------------------------------------------------------

function injectFlaws(draft) {
  const d = JSON.parse(JSON.stringify(draft));
  const flaws = [];
  const lastPhase = d.phases.reduce((a, b) => (b.phase > a.phase ? b : a));

  // 1. Scope creep: fitur yang tidak pernah diminta, ditandai seolah dari user.
  d.mvp_features.push({
    id: 'F-90', name: 'Leaderboard dan gamifikasi poin member',
    description: 'Member mendapat poin setiap check-in dan bersaing di papan peringkat.',
    source: 'user', sub_features: ['Poin per check-in', 'Papan peringkat bulanan'], depends_on: [],
  });
  lastPhase.feature_ids.push('F-90');
  flaws.push({ id: 'scope_creep', categories: ['scope_creep', 'consistency'], keywords: ['leaderboard', 'gamifikasi', 'f-90'] });

  // 2. Urutan dependensi: fitur fondasi akun/login dipindah ke fase terakhir.
  const auth =
    d.mvp_features.find((f) => f.source === 'fondasi' && /akun|login|masuk|auth|daftar/i.test(`${f.name} ${f.description}`)) ||
    d.mvp_features.find((f) => f.source === 'fondasi');
  if (auth) {
    d.phases.forEach((p) => (p.feature_ids = p.feature_ids.filter((id) => id !== auth.id)));
    lastPhase.feature_ids.push(auth.id);
    flaws.push({
      id: 'dependency_order', categories: ['dependency_order', 'security'],
      keywords: [auth.id.toLowerCase(), 'auth', 'login', 'akun', 'fondasi'], note: `${auth.id} ${auth.name} dipindah ke fase ${lastPhase.phase}`,
    });
  }

  // 3. Stack vs deployment: keputusan yang bertabrakan dengan profil.
  d.technical_decisions = [...(d.technical_decisions || []), 'Backend dideploy sebagai serverless function dengan database SQLite supaya gratis.'];
  flaws.push({ id: 'stack_deploy', categories: ['stack_deploy', 'consistency'], keywords: ['sqlite', 'serverless'] });

  // 4. Konsistensi: asumsi yang bertentangan dengan "sebuah gym".
  d.assumptions_extra = ['Aplikasi menjadi marketplace untuk banyak gym di satu kota.'];
  flaws.push({ id: 'consistency', categories: ['consistency', 'scope_creep'], keywords: ['marketplace', 'banyak gym'] });

  return { draft: d, flaws };
}

// ---------------------------------------------------------------------------
// Tahap 5 — Review kritis
// ---------------------------------------------------------------------------

function promptStage5(ctx, draft) {
  return `Kamu adalah tahap "Review Kritis" di aplikasi PRD Generator.
Periksa draft rencana di bawah dengan teliti SEBELUM PRD ditulis. Bersikaplah seperti senior engineer yang skeptis.

Checklist kategori:
- stack_deploy: keputusan teknis yang bertabrakan dengan stack yang dipakai atau dengan cara deploy.
- dependency_order: fitur atau fase yang dikerjakan sebelum dependensinya siap.
- security: data atau endpoint yang terbuka sebelum auth/otorisasi ada, atau perlindungan data yang kurang.
- consistency: fitur, asumsi, atau keputusan yang bertentangan dengan ide, jawaban user, atau satu sama lain.
- scope_creep: fitur di MVP yang tidak berasal dari jawaban user.
- testability: fitur yang terlalu kabur untuk diberi acceptance criteria.

Aturan:
- Setiap temuan WAJIB punya "evidence": kutipan atau rujukan spesifik dari draft (id fitur, nomor fase, atau teks keputusan). Jangan mengarang temuan tanpa bukti.
- Setiap temuan punya 2-3 "options" beserta konsekuensinya, dan "recommended_option" yang sama persis dengan salah satu label opsi.
- "passed_checks": kategori yang sudah kamu periksa dan tidak bermasalah.
- "ready": true hanya jika tidak ada temuan severity high.

${PROFILE_A}

${COMMON_RULES}

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"findings":[{"id":"RV-01","category":"...","severity":"high","finding":"...","evidence":"...","options":[{"label":"...","consequence":"..."}],"recommended_option":"..."}],"passed_checks":["..."],"ready":false}

${contextBlock(ctx)}

DRAFT RENCANA (JSON):
${JSON.stringify(draft, null, 2)}`;
}

function validateStage5(o) {
  const errors = [];
  if (!Array.isArray(o.findings)) return { errors: ['findings bukan array'], warnings: [] };
  o.findings.forEach((f, i) => {
    const p = `findings[${i}]`;
    if (!REVIEW_CATEGORIES.includes(f.category)) errors.push(`${p}.category tidak dikenal: ${f.category}`);
    if (!['high', 'medium', 'low'].includes(f.severity)) errors.push(`${p}.severity tidak valid`);
    if (!String(f.evidence || '').trim()) errors.push(`${p}.evidence kosong`);
    const labels = (f.options || []).map((x) => x.label);
    if (labels.length < 2 || labels.length > 3) errors.push(`${p}.options harus 2-3`);
    if (!labels.includes(f.recommended_option)) errors.push(`${p}.recommended_option tidak sama dengan label opsi`);
  });
  if (typeof o.ready !== 'boolean') errors.push('ready bukan boolean');
  return { errors, warnings: [] };
}

function scoreReview(review, flaws) {
  return flaws.map((flaw) => {
    const hit = review.findings.find((f) => {
      const text = `${f.finding} ${f.evidence}`.toLowerCase();
      return flaw.categories.includes(f.category) && flaw.keywords.some((k) => text.includes(k));
    });
    return { flaw: flaw.id, detected: Boolean(hit), by: hit?.id ?? null, note: flaw.note };
  });
}

// ---------------------------------------------------------------------------
// Tahap 6 — PRD.md
// ---------------------------------------------------------------------------

function promptStage6(ctx, draft, review) {
  const decisions = review.findings.map((f) => `- ${f.id} (${f.category}): ${f.finding} -> DIPUTUSKAN: ${f.recommended_option}`).join('\n');
  return `Kamu adalah tahap "Generate PRD" di aplikasi PRD Generator.
Tulis PRD final dalam Markdown yang akan dibaca Claude Code untuk membangun aplikasi.

WAJIB menerapkan semua keputusan review berikut. Draft di bawah masih mengandung masalah yang ditemukan review; PRD final TIDAK boleh mewarisi masalah itu:
${decisions || '- (tidak ada temuan)'}

Struktur WAJIB (heading persis seperti ini, dalam urutan ini):
# <Nama Produk>
## 1. Context & Goal
## 2. Scope
### In scope
### Non-goals
## 3. Tech Constraints
## 4. Data Model
## 5. API Contract
## 6. Functional Requirements
## 7. Non-Functional Requirements
## 8. Assumptions & Decisions
### Open Questions

Aturan isi:
- Bagian 3 merangkum stack di bawah beserta konvensinya, singkat dan tegas.
- Bagian 4: tepat satu blok \`\`\`mermaid berisi erDiagram sebagai sumber tunggal skema, lalu daftar singkat constraint penting (unik, index, aturan integritas). Jangan menulis skema dua kali.
- Bagian 5: setiap endpoint ditulis sebagai "METHOD /path" (misalnya POST /members) dengan request, response, error, dan siapa yang boleh mengakses.
- Bagian 6: setiap requirement berupa "### FR-01: <judul>" berisi: deskripsi singkat, "Fitur: F-xx", "Acceptance criteria:" dengan checklist "- [ ] Given ... When ... Then ...", dan "Edge cases:".
- Bagian 7: "NFR-01" dan seterusnya, masing-masing terukur.
- Bagian 8: setiap keputusan beserta alasannya, termasuk keputusan review (sebut id RV-xx). Hal yang masih TEBAKAN masuk "### Open Questions".
- Jangan menulis fitur rekomendasi atau non-goals ke In scope atau Functional Requirements.

${PROFILE_A}

Bahasa Indonesia yang jelas. Balas HANYA isi Markdown PRD, dimulai dari "# ", tanpa pembuka, penutup, atau blok kode pembungkus.

${contextBlock(ctx)}

DRAFT RENCANA (JSON):
${JSON.stringify(draft, null, 2)}`;
}

function section(md, heading) {
  const start = md.indexOf(heading);
  if (start === -1) return '';
  const next = md.slice(start + heading.length).search(/\n## /);
  return next === -1 ? md.slice(start) : md.slice(start, start + heading.length + next);
}

function validatePrd(md) {
  const errors = [];
  const warnings = [];
  const headings = [
    '## 1. Context & Goal', '## 2. Scope', '### In scope', '### Non-goals', '## 3. Tech Constraints',
    '## 4. Data Model', '## 5. API Contract', '## 6. Functional Requirements',
    '## 7. Non-Functional Requirements', '## 8. Assumptions & Decisions', '### Open Questions',
  ];
  headings.forEach((h) => !md.includes(h) && errors.push(`heading hilang: ${h}`));

  const mermaidCount = (md.match(/```mermaid/g) || []).length;
  if (!/```mermaid\s*\n\s*erDiagram/.test(md)) errors.push('tidak ada blok mermaid erDiagram');
  if (mermaidCount > 1) warnings.push(`${mermaidCount} blok mermaid (diharapkan satu erDiagram)`);

  const endpoints = section(md, '## 5. API Contract').match(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[^\s`|)]*/g) || [];
  if (endpoints.length < 3) errors.push(`endpoint di API Contract hanya ${endpoints.length}`);

  const frBlocks = md.split(/\n(?=### FR-\d{2})/).filter((b) => /^### FR-\d{2}/.test(b));
  if (frBlocks.length < 3) errors.push(`hanya ${frBlocks.length} FR`);
  frBlocks.forEach((b) => {
    const id = b.match(/FR-\d{2}/)[0];
    if (!b.includes('- [ ]')) errors.push(`${id} tanpa checklist acceptance criteria`);
    if (!/Given/i.test(b) || !/Then/i.test(b)) warnings.push(`${id} acceptance criteria tidak berpola Given/When/Then`);
    if (!/F-\d{2}/.test(b)) warnings.push(`${id} tidak merujuk fitur F-xx`);
  });
  if (!/NFR-\d{2}/.test(md)) errors.push('tidak ada NFR-xx');

  return { errors, warnings, frIds: frBlocks.map((b) => b.match(/FR-\d{2}/)[0]), endpoints };
}

// Apakah kesalahan yang ditanam masih tersisa di PRD?
function prdFlawCheck(md) {
  const tech = section(md, '## 3. Tech Constraints').toLowerCase();
  const inScope = (() => {
    const s = section(md, '## 2. Scope');
    const ng = s.indexOf('### Non-goals');
    return (ng === -1 ? s : s.slice(0, ng)).toLowerCase();
  })();
  const frs = section(md, '## 6. Functional Requirements').toLowerCase();
  return [
    { flaw: 'stack_deploy', fixed: !tech.includes('sqlite') && !tech.includes('serverless') },
    { flaw: 'scope_creep', fixed: !/leaderboard|gamifikasi/.test(inScope) && !/leaderboard|gamifikasi/.test(frs) },
    { flaw: 'consistency', fixed: !/marketplace|banyak gym/.test(inScope) && !/marketplace|banyak gym/.test(frs) },
  ];
}

// ---------------------------------------------------------------------------
// Tahap 7 — TASKS.md
// ---------------------------------------------------------------------------

function promptStage7(prd) {
  return `Kamu adalah tahap "Generate Task Plan" di aplikasi PRD Generator.
Dari PRD di bawah, tulis TASKS.md: daftar task berurutan yang akan dikerjakan Claude Code, SATU task per sesi.

Format WAJIB:
# TASKS — <Nama Produk>
## Fase 0 — Fondasi
- [ ] T-001 <judul singkat>
  - layer: <infra|db|api|contract|app|test> · depends_on: <T-xxx, T-yyy atau -> · refs: <FR-xx, NFR-xx atau ->
  - files: <path utama yang disentuh>
  - done when: <kriteria yang bisa diverifikasi, sebaiknya perintah seperti \`pnpm test\` atau langkah cek yang spesifik>
## Fase 1 — <nama>
...

Aturan urutan:
- Fase 0: setup monorepo dan Docker Compose, skema dan migrasi Drizzle, verifikasi ID token Firebase dan middleware otorisasi, kontrak OpenAPI dan generate client Dart, kerangka app Flutter (routing, DI get_it, tema).
- Auth dan middleware otorisasi WAJIB selesai sebelum endpoint mana pun yang butuh login.
- Kontrak OpenAPI dan client Dart WAJIB ada sebelum task layer data di Flutter.
- Per fitur: backend (use case -> repository -> route + test) lalu Flutter (domain -> data -> presentation + test).
- depends_on hanya boleh merujuk task yang muncul LEBIH DULU.
- Setiap FR di PRD dirujuk minimal oleh satu task. Tidak ada task duplikat.
- Task cukup kecil untuk satu sesi agent.

Balas HANYA isi Markdown, dimulai dari "# ", tanpa pembuka, penutup, atau blok kode pembungkus.

PRD:
${prd}`;
}

function parseTasks(md) {
  const tasks = [];
  let phase = null;
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ph = lines[i].match(/^##\s+(Fase\s+\d+.*)$/i);
    if (ph) phase = ph[1].trim();
    const t = lines[i].match(/^- \[ \] (T-\d{3})\s+(.+)$/);
    if (!t) continue;
    const meta = [];
    for (let j = i + 1; j < lines.length && /^\s{2,}- /.test(lines[j]); j++) meta.push(lines[j].trim());
    const joined = meta.join('\n');
    const pick = (key) => (joined.match(new RegExp(`${key}:\\s*([^·\\n]+)`, 'i')) || [])[1]?.trim() ?? null;
    const list = (v) => (!v || v === '-' ? [] : v.split(',').map((x) => x.trim()).filter(Boolean));
    tasks.push({
      id: t[1], title: t[2].trim(), phase,
      layer: pick('layer'), dependsOn: list(pick('depends_on')), refs: list(pick('refs')),
      files: pick('files'), doneWhen: pick('done when'),
    });
  }
  return tasks;
}

function validateTasks(md, prdInfo) {
  const errors = [];
  const warnings = [];
  const tasks = parseTasks(md);
  if (!/^## Fase 0/m.test(md)) errors.push('tidak ada "## Fase 0"');
  if (tasks.length < 10) errors.push(`hanya ${tasks.length} task`);

  const seen = new Map();
  tasks.forEach((t, i) => {
    if (seen.has(t.id)) errors.push(`${t.id} duplikat`);
    seen.set(t.id, i);
    ['layer', 'files', 'doneWhen'].forEach((k) => !t[k] && errors.push(`${t.id} tanpa ${k}`));
    t.dependsOn.forEach((d) => {
      if (!seen.has(d)) errors.push(`${t.id} depends_on ${d} yang belum muncul sebelumnya`);
    });
    t.refs.filter((r) => /^FR-/.test(r)).forEach((r) => !prdInfo.frIds.includes(r) && errors.push(`${t.id} merujuk ${r} yang tidak ada di PRD`));
  });

  const titles = tasks.map((t) => t.title.toLowerCase());
  titles.forEach((title, i) => titles.indexOf(title) !== i && errors.push(`judul task duplikat: ${tasks[i].title}`));

  const referenced = new Set(tasks.flatMap((t) => t.refs));
  prdInfo.frIds.forEach((fr) => !referenced.has(fr) && errors.push(`${fr} tidak dirujuk task mana pun`));

  const text = (t) => `${t.title} ${t.files ?? ''}`.toLowerCase();
  const firstAuth = tasks.findIndex((t) => /auth|token|otorisasi|middleware/.test(text(t)));
  const firstEndpoint = tasks.findIndex((t) => t.layer === 'api' && /endpoint|route|post |get |patch |put |delete /.test(text(t)) && !/health/.test(text(t)));
  if (firstEndpoint !== -1 && (firstAuth === -1 || firstAuth > firstEndpoint)) {
    errors.push('ada endpoint sebelum task auth/middleware');
  }
  const firstContract = tasks.findIndex((t) => /openapi|client dart|contract/.test(text(t)) || t.layer === 'contract');
  const firstAppData = tasks.findIndex((t) => t.layer === 'app' && /data|repository|datasource|data source/.test(text(t)));
  if (firstAppData !== -1 && (firstContract === -1 || firstContract > firstAppData)) {
    errors.push('ada task data Flutter sebelum kontrak OpenAPI/client Dart');
  }
  const vague = tasks.filter((t) => t.doneWhen && t.doneWhen.length < 15);
  if (vague.length) warnings.push(`${vague.length} task dengan "done when" terlalu singkat`);

  return { errors, warnings, tasks };
}

// ---------------------------------------------------------------------------
// CLAUDE.md (template statis, bukan hasil AI)
// ---------------------------------------------------------------------------

const CLAUDE_MD = `# Aturan kerja untuk Claude Code

- Baca \`docs/PRD.md\` sekali di awal sesi.
- Kerjakan SATU task per sesi dari \`docs/TASKS.md\`, sesuai urutan dan \`depends_on\`.
- Berhenti dan lapor setiap pindah layer atau fase, lalu tunggu konfirmasi user.
- Centang task hanya setelah kriteria "done when" terbukti.
- Jangan mengubah keputusan di bagian "Assumptions & Decisions" tanpa bertanya.
- Ikuti Clean Architecture per fitur di \`apps/app\` dan \`apps/api\` seperti di bagian Tech Constraints.
`;

// ---------------------------------------------------------------------------
// Alur utama
// ---------------------------------------------------------------------------

const toAnswers = (questions, guessTopics = []) =>
  questions.map((q) => ({
    topic: q.topic,
    question: q.question,
    answer: q.recommended_default,
    source: guessTopics.includes(q.topic) ? 'tebakan' : 'default',
  }));

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const cwd = mkdtempSync(join(tmpdir(), 'prd-e2e-'));
  const stats = [];
  const save = (name, data) => writeFileSync(join(OUT_DIR, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  const started = Date.now();

  console.log(`Uji end-to-end untuk ide:\n  "${IDEA}"\n`);
  try {
    const s2 = await runStage({ key: 'stage2', label: 'Tahap 2 klarifikasi produk', prompt: promptStage2(IDEA), parse: extractJson, validate: validateStage2, cwd, stats });
    save('stage-2.json', s2);

    const ctx = {
      idea: IDEA,
      productAnswers: toAnswers(s2.questions, GUESS_TOPICS),
      productAssumptions: s2.assumptions,
      deferred: s2.deferred_technical,
    };
    const s3 = await runStage({ key: 'stage3', label: 'Tahap 3 klarifikasi teknis', prompt: promptStage3(ctx), parse: extractJson, validate: validateStage3, cwd, stats });
    save('stage-3.json', s3);
    Object.assign(ctx, { techAnswers: toAnswers(s3.questions), techAssumptions: s3.assumptions, risks: s3.detected_risks });

    const s4 = await runStage({ key: 'stage4', label: 'Tahap 4 struktur fitur', prompt: promptStage4(ctx), parse: extractJson, validate: validateStage4, cwd, stats });
    save('stage-4.json', s4);

    const { draft, flaws } = injectFlaws(s4);
    save('stage-4-with-flaws.json', { draft, flaws });
    console.log(`  (menanam ${flaws.length} kesalahan ke draft: ${flaws.map((f) => f.id).join(', ')})`);

    const s5 = await runStage({ key: 'stage5', label: 'Tahap 5 review kritis', prompt: promptStage5(ctx, draft), parse: extractJson, validate: validateStage5, cwd, stats });
    save('stage-5.json', s5);
    const reviewScore = scoreReview(s5, flaws);

    console.log('  (tahap 6 dan 7 menghasilkan dokumen panjang, bisa beberapa menit per tahap)');
    let prdInfo;
    const prd = await runStage({
      key: 'stage6', label: 'Tahap 6 generate PRD', prompt: promptStage6(ctx, draft, s5), parse: extractMarkdown,
      validate: (md) => (prdInfo = validatePrd(md)), cwd, stats,
    });
    save('PRD.md', prd);
    const prdFlaws = prdFlawCheck(prd);

    let taskInfo;
    const tasks = await runStage({
      key: 'stage7', label: 'Tahap 7 generate task', prompt: promptStage7(prd), parse: extractMarkdown,
      validate: (md) => (taskInfo = validateTasks(md, prdInfo)), cwd, stats,
    });
    save('TASKS.md', tasks);
    save('CLAUDE.md', CLAUDE_MD);

    // Ringkasan
    const sum = (f) => stats.reduce((s, r) => s + (f(r) || 0), 0);
    const totals = {
      totalSeconds: Math.round((Date.now() - started) / 1000),
      calls: stats.length,
      outputTokens: sum((r) => r.usage?.output_tokens),
      inputTokensInclCache: sum((r) => (r.usage?.input_tokens || 0) + (r.usage?.cache_read_input_tokens || 0) + (r.usage?.cache_creation_input_tokens || 0)),
      costEstimateUsd: Number(sum((r) => r.costEstimateUsd).toFixed(4)),
    };

    console.log('\n=== Hasil ===');
    console.log(`Profil: ${s3.profile_recommendation.profile} | fitur MVP: ${s4.mvp_features.length} | rekomendasi: ${s4.recommended_features.length} | fase: ${s4.phases.length}`);
    console.log(`Review kritis: ${s5.findings.length} temuan, menangkap ${reviewScore.filter((r) => r.detected).length}/${reviewScore.length} kesalahan tanaman`);
    reviewScore.forEach((r) => console.log(`  ${r.detected ? 'TERTANGKAP' : 'LOLOS     '} ${r.flaw}${r.by ? ` (oleh ${r.by})` : ''}`));
    console.log(`PRD: ${prdInfo.frIds.length} FR, ${prdInfo.endpoints.length} endpoint`);
    prdFlaws.forEach((r) => console.log(`  ${r.fixed ? 'BERSIH ' : 'TERSISA'} ${r.flaw} di PRD akhir`));
    console.log(`TASKS: ${taskInfo.tasks.length} task di ${new Set(taskInfo.tasks.map((t) => t.phase)).size} fase`);
    console.log(`\nTotal: ${totals.calls} panggilan, ${totals.totalSeconds} detik, output ${totals.outputTokens} token, input (termasuk cache) ${totals.inputTokensInclCache} token, perkiraan $${totals.costEstimateUsd}`);

    save('report.json', { idea: IDEA, totals, reviewScore, prdFlaws, prdEndpoints: prdInfo.endpoints, stats });
    console.log(`\nSemua file ada di folder ${OUT_DIR}/`);
  } catch (err) {
    console.error(`\nBERHENTI: ${err.message}`);
    save('report.json', { idea: IDEA, error: err.message, stats });
    console.error(`Detail percobaan tersimpan di ${OUT_DIR}/report.json`);
    process.exitCode = 1;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

main();
