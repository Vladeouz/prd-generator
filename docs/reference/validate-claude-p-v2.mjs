#!/usr/bin/env node
// Validasi `claude -p` untuk aplikasi PRD Generator — PROMPT V2.
// Tahap 2 (klarifikasi produk), dengan perbaikan dari hasil v1:
//   1. Default selalu scope terkecil yang masih berguna.
//   2. Default multi-select berupa array, default single harus sama persis dengan salah satu opsi.
//   3. Topik teknis & platform dilarang di tahap 2; dicatat di deferred_technical untuk tahap 3.
//   4. Jumlah pertanyaan menyesuaikan tingkat kejelasan ide.
//
// Cara pakai:
//   node validate-claude-p-v2.mjs            -> 3 ide x 1 kali
//   node validate-claude-p-v2.mjs --runs 3   -> 3 ide x 3 kali (uji konsistensi)
//
// Hasil lengkap disimpan ke validate-report-v2.json di folder yang sama.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROMPT_VERSION = 'v2';

const IDEAS = [
  'Aplikasi web untuk tim kecil mengelola tugas. Anggota bisa dibagi tugas, ada deadline dan notifikasi.',
  'Aplikasi booking lapangan futsal untuk pemilik lapangan dan pemain, bisa di HP dan web.',
  'Catatan keuangan pribadi.',
];

const TOPICS = ['masalah', 'pengguna', 'aksi_pertama', 'fitur_wajib', 'pembeda'];
const MAX_DEFAULT_MULTI = 3;

// Kata kunci teknis/platform yang tidak boleh muncul di pertanyaan atau asumsi tahap 2.
// Ini heuristik: hasilnya berupa peringatan (warning), bukan error.
const TECH_KEYWORDS = [
  'android', 'ios', 'mobile', 'native', 'web responsif', 'browser', 'platform',
  'push notification', 'notifikasi dikirim', 'dikirim lewat', 'email', 'login', 'server',
  'database', 'deploy', 'hosting', 'framework',
];

function expectedQuestionCount(clarity) {
  // clarity 1 (sangat samar) -> 5 pertanyaan, 2 -> 4, 3 -> 3, 4 dan 5 -> 2.
  return Math.max(2, 6 - clarity);
}

function buildPrompt(idea) {
  return `Kamu adalah tahap "Klarifikasi Produk" di aplikasi PRD Generator.
Tugasmu: dari ide di bawah, susun pertanyaan klarifikasi PRODUK (bukan teknis) untuk pemilik ide.

Langkah:
1. Nilai kejelasan ide sebagai "clarity" dari 1 (sangat samar) sampai 5 (sangat jelas).
2. Jumlah pertanyaan WAJIB sesuai clarity: 1 -> 5 pertanyaan, 2 -> 4, 3 -> 3, 4 atau 5 -> 2.
3. Urutkan pertanyaan dari yang paling berdampak ke isi PRD.

Aturan pertanyaan:
- Topik yang boleh: ${TOPICS.join(', ')}. Setiap topik paling banyak dipakai satu kali.
- Lewati topik yang sudah jelas dari ide, dan catat sebagai asumsi PRODUK.
- DILARANG bertanya atau berasumsi soal hal teknis: platform (web, Android, iOS, mobile, native), channel notifikasi (email, push, WhatsApp sebagai saluran notifikasi), login/autentikasi, database, server, hosting, deployment, atau tech stack. Hal-hal ini ditangani tahap berikutnya. Jika ide menyinggungnya, catat di "deferred_technical" dengan kalimat singkat, bukan di pertanyaan atau asumsi.
- Opsi jawaban realistis dan kontekstual, 2 sampai 6 opsi per pertanyaan. Opsi tidak boleh mengandung koma.

Aturan jawaban default (penting):
- Default selalu mengarah ke SCOPE TERKECIL yang masih berguna untuk versi pertama. Pilih opsi yang paling sederhana, bukan yang paling lengkap atau paling ambisius.
- type "single": "recommended_default" adalah SATU string yang sama persis dengan salah satu opsi.
- type "multi": "recommended_default" adalah ARRAY berisi 1 sampai ${MAX_DEFAULT_MULTI} string yang masing-masing sama persis dengan salah satu opsi.
- type "text": "options" berupa array kosong dan "recommended_default" berupa string.

JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.

Balas HANYA dengan satu objek JSON valid, tanpa teks lain dan tanpa blok kode markdown, dengan bentuk:
{
  "clarity": 1,
  "clarity_reason": "satu kalimat alasan penilaian kejelasan",
  "questions": [
    {
      "id": "q1",
      "topic": "salah satu topik di atas",
      "question": "teks pertanyaan",
      "type": "single",
      "options": ["opsi 1", "opsi 2"],
      "recommended_default": "opsi 1",
      "why_it_matters": "satu kalimat alasan"
    }
  ],
  "assumptions": ["asumsi produk untuk topik yang dilewati"],
  "deferred_technical": ["hal teknis dari ide yang perlu ditanyakan di tahap teknis"]
}

Ide:
"""${idea}"""`;
}

function runClaude(prompt, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
    // Prompt dikirim lewat stdin supaya aman dari masalah quoting di Windows.
    const child = spawn('claude', ['-p', '--output-format', 'json', '--max-turns', '1'], {
      cwd,
      shell: process.platform === 'win32',
    });
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

function findTechKeywords(text) {
  const lower = String(text).toLowerCase();
  return TECH_KEYWORDS.filter((k) => lower.includes(k));
}

// errors = melanggar kontrak (aplikasi tidak bisa memakai output ini).
// warnings = lolos kontrak, tapi kualitasnya perlu diperhatikan.
function validate(obj) {
  const errors = [];
  const warnings = [];

  if (!Number.isInteger(obj.clarity) || obj.clarity < 1 || obj.clarity > 5) {
    errors.push(`clarity tidak valid: ${obj.clarity}`);
  }
  if (!Array.isArray(obj.questions)) return { errors: [...errors, 'questions bukan array'], warnings };

  if (Number.isInteger(obj.clarity)) {
    const expected = expectedQuestionCount(obj.clarity);
    if (obj.questions.length !== expected) {
      errors.push(`clarity ${obj.clarity} harus ${expected} pertanyaan, didapat ${obj.questions.length}`);
    }
  }

  const seenTopics = new Set();
  obj.questions.forEach((q, i) => {
    const p = `questions[${i}]`;
    for (const k of ['id', 'topic', 'question', 'type', 'why_it_matters']) {
      if (typeof q[k] !== 'string' || !q[k].trim()) errors.push(`${p}.${k} kosong/bukan string`);
    }
    if (!TOPICS.includes(q.topic)) errors.push(`${p}.topic tidak dikenal: ${q.topic}`);
    if (seenTopics.has(q.topic)) errors.push(`${p}.topic "${q.topic}" dipakai lebih dari sekali`);
    seenTopics.add(q.topic);
    if (!['single', 'multi', 'text'].includes(q.type)) errors.push(`${p}.type tidak valid: ${q.type}`);

    const options = Array.isArray(q.options) ? q.options : null;
    if (!options) {
      errors.push(`${p}.options bukan array`);
    } else if (q.type !== 'text' && (options.length < 2 || options.length > 6)) {
      errors.push(`${p}.options berisi ${options.length}, harus 2-6`);
    }
    if (options?.some((o) => String(o).includes(','))) warnings.push(`${p}: ada opsi yang mengandung koma`);

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
        if (unknown.length) errors.push(`${p}.recommended_default berisi nilai di luar opsi: ${unknown.join(' | ')}`);
      }
    } else if (q.type === 'text' && typeof d !== 'string') {
      errors.push(`${p}.recommended_default harus string untuk text`);
    }

    const techInQuestion = findTechKeywords(`${q.question} ${(options || []).join(' ')}`);
    if (techInQuestion.length) warnings.push(`${p}: kemungkinan topik teknis (${techInQuestion.join(', ')})`);
  });

  if (!Array.isArray(obj.assumptions)) errors.push('assumptions bukan array');
  else {
    obj.assumptions.forEach((a, i) => {
      const tech = findTechKeywords(a);
      if (tech.length) warnings.push(`assumptions[${i}]: asumsi teknis (${tech.join(', ')})`);
    });
  }
  if (!Array.isArray(obj.deferred_technical)) errors.push('deferred_technical bukan array');

  return { errors, warnings };
}

async function main() {
  const runsArg = process.argv.indexOf('--runs');
  const runs = runsArg > -1 ? Math.max(1, Number(process.argv[runsArg + 1]) || 1) : 1;
  // Folder kosong sementara, supaya Claude Code tidak membaca file proyek apa pun.
  const cwd = mkdtempSync(join(tmpdir(), 'prd-validate-'));
  const results = [];

  console.log(`Prompt ${PROMPT_VERSION}: menjalankan ${IDEAS.length} ide x ${runs} kali...\n`);
  for (const [ideaIndex, idea] of IDEAS.entries()) {
    for (let run = 1; run <= runs; run++) {
      const label = `ide ${ideaIndex + 1}, run ${run}`;
      const r = await runClaude(buildPrompt(idea), cwd);
      const entry = { ideaIndex, run, ms: r.ms, exitCode: r.code, ok: false, errors: [], warnings: [] };

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
          const { errors, warnings } = validate(data);
          entry.errors = errors;
          entry.warnings = warnings;
          entry.ok = errors.length === 0;
        } catch (err) {
          entry.errors.push(`parse gagal: ${err.message}`);
          entry.rawStdout = r.stdout.slice(0, 2000);
        }
      }

      results.push(entry);
      const u = entry.usage || {};
      const tokens = `out ${u.output_tokens ?? '?'}`;
      const qCount = entry.data?.questions?.length ?? '-';
      const clarity = entry.data?.clarity ?? '-';
      const status = !entry.ok ? 'GAGAL' : entry.warnings.length ? 'OK*  ' : 'OK   ';
      console.log(
        `${status} ${label} | ${(r.ms / 1000).toFixed(1)} dtk | ${tokens} | clarity ${clarity} -> ${qCount} pertanyaan`,
      );
      entry.errors.slice(0, 3).forEach((e) => console.log(`       x ${e}`));
      entry.warnings.slice(0, 3).forEach((w) => console.log(`       ! ${w}`));
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const cleanCount = results.filter((r) => r.ok && r.warnings.length === 0).length;
  const avgSec = results.reduce((s, r) => s + r.ms, 0) / results.length / 1000;
  console.log(`\nRingkasan prompt ${PROMPT_VERSION}:`);
  console.log(`  Valid kontrak : ${okCount}/${results.length}`);
  console.log(`  Tanpa warning : ${cleanCount}/${results.length}`);
  console.log(`  Rata-rata     : ${avgSec.toFixed(1)} detik per panggilan`);

  if (runs > 1) {
    console.log('  Konsistensi clarity per ide:');
    IDEAS.forEach((_, i) => {
      const values = results.filter((r) => r.ideaIndex === i).map((r) => r.data?.clarity ?? '-');
      console.log(`    ide ${i + 1}: ${values.join(', ')}`);
    });
  }

  writeFileSync('validate-report-v2.json', JSON.stringify({ promptVersion: PROMPT_VERSION, runs, results }, null, 2));
  console.log('\nDetail tersimpan di validate-report-v2.json');
  rmSync(cwd, { recursive: true, force: true });
}

main();
