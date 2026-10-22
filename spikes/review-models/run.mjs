// Spike T-034: model dan effort untuk tahap review (D-14). Menjalankan tahap 5 dan review 2 proyek
// uji T-018 pertama ("Reservasi Massage"), yang PRD-nya memuat celah klaim admin berdasarkan email
// tanpa verifikasi (FR-02, temuan 11 uji T-018), dalam tiga konfigurasi model/effort, masing-masing
// dua kali per tahap.
//
// - Prompt, parser, dan validator dari definisi tahap di `src/` (bukan salinan).
// - Input dari salinan database utama (konteks tahap 2–3, draft tahap 4 yang sama dengan fixture
//   `verification/t018-stage4.json`); untuk review 2, `verification/t018-prd-v1.md` (PRD yang dinilai
//   review 2 di uji T-018) ditambahkan sebagai versi PRD terbaru di salinan itu.
// - Pemanggilan lewat `CliClaudeRunner` (bentuk perintah runner saat ini). Hanya nilai `--model` dan
//   `--effort` yang diganti; effort diganti di perintah yang sudah disusun runner.
// - Satu percobaan per run, tanpa percobaan ulang: yang diukur adalah lolos validator di percobaan
//   pertama.
//
// Memakai kuota langganan; hanya dijalankan atas izin user. Dari root repo:
//
//   node spikes/review-models/run.mjs --dry-run      (prompt dan perintah, tanpa memanggil claude)
//   node spikes/review-models/run.mjs --command "node <path absolut>/test/helpers/fake-claude-cli.mjs"
//                                                     (CLI palsu dengan fixture T-018, tanpa kuota)
//   node spikes/review-models/run.mjs                 (12 pemanggilan sungguhan)
//
// Hasil di `spikes/review-models/results/`: `results.json` (per run), `summary.md`, output teks per
// run, dan stream mentah (`*.ndjson`, di-ignore Git). Run yang sudah tercatat dilewati, jadi script
// bisa dijalankan ulang setelah terhenti. Berhenti sebelum run berikutnya bila total biaya bisa
// melewati MAX_COST_USD.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { and, eq, max } from 'drizzle-orm';
import { CliClaudeRunner, claudeArgs } from '../../src/claude/cli-runner.ts';
import { MAIN_DATABASE_PATH, openDatabase } from '../../src/core/db/client.ts';
import { documents } from '../../src/core/db/schema.ts';
import { extractJson } from '../../src/stages/parse.ts';
import { review2Definition } from '../../src/stages/review-2/definition.ts';
import { currentOutput } from '../../src/stages/run-stage.ts';
import { stage5Definition } from '../../src/stages/stage-5/definition.ts';

const PROJECT_ID = '380e5463-33b6-4c2a-b514-28142347bee5';
const FIXTURES = resolve('test/fixtures/claude/verification');
// CLI palsu menulis ke folder sementara agar tidak tercampur dengan hasil sungguhan.
const argv = process.argv.slice(2);
const commandIndex = argv.indexOf('--command');
const command = commandIndex === -1 ? undefined : argv[commandIndex + 1];
const OUT = command
  ? join(tmpdir(), 'prd-generator-t034-fake')
  : resolve('spikes/review-models/results');
const MAX_COST_USD = 5;
/** Perkiraan biaya run pertama per model, sebelum ada angka nyata (untuk batas biaya). */
const FIRST_RUN_GUESS_USD = { sonnet: 0.15, opus: 0.6 };

const CONFIGS = [
  { id: 'sonnet-low', model: 'sonnet', effort: 'low' },
  { id: 'sonnet-medium', model: 'sonnet', effort: 'medium' },
  { id: 'opus-medium', model: 'opus', effort: 'medium' },
];
const STAGES = ['stage5', 'review2'];
const REPEATS = 2;
/** Fixture untuk CLI palsu (`--command`). */
const FAKE_FIXTURES = { stage5: 't018-stage5.json', review2: 't018-review2-attempt1.json' };

const dryRun = argv.includes('--dry-run');
/** Hanya menyusun ulang summary.md dari results.json, tanpa pemanggilan. */
const summaryOnly = argv.includes('--summary');
if (existsSync('.env')) process.loadEnvFile('.env');

// --- Input: salinan database utama -------------------------------------------------------------

const workDir = join(tmpdir(), `prd-generator-t034-${process.pid}`);
mkdirSync(workDir, { recursive: true });
const dbPath = join(workDir, 'copy.db');
const source = new Database(MAIN_DATABASE_PATH, { readonly: true, fileMustExist: true });
await source.backup(dbPath);
source.close();
const db = openDatabase(dbPath);
const context = { db, projectId: PROJECT_ID };

const fixtureResult = (name) =>
  extractJson(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')).result);
const stage4 = currentOutput(db, PROJECT_ID, 'stage4');
if (JSON.stringify(stage4) !== JSON.stringify(fixtureResult('t018-stage4.json'))) {
  throw new Error('Output tahap 4 proyek uji di database berbeda dengan fixture t018-stage4.json.');
}

const prdV1 = readFileSync(join(FIXTURES, 't018-prd-v1.md'), 'utf8');
if (!prdV1.includes('berdasarkan email token')) {
  throw new Error('t018-prd-v1.md tidak lagi memuat klaim admin berdasarkan email (FR-02).');
}
const prdKind = and(eq(documents.projectId, PROJECT_ID), eq(documents.kind, 'prd'));
const lastVersion = db
  .select({ v: max(documents.version) })
  .from(documents)
  .where(prdKind)
  .get();
db.insert(documents)
  .values({
    id: randomUUID(),
    projectId: PROJECT_ID,
    kind: 'prd',
    version: (lastVersion?.v ?? 0) + 1,
    content: prdV1,
    createdAt: new Date().toISOString(),
  })
  .run();

const definitions = { stage5: stage5Definition(), review2: review2Definition() };
const prompts = {};
for (const stage of STAGES) prompts[stage] = await definitions[stage].buildPrompt(context);

// --- Pemanggilan -------------------------------------------------------------------------------

/**
 * `spawn` yang mengganti nilai `--effort` di perintah susunan runner, dan menyalin stdout mentah
 * (event `init` dan `thinking_tokens` tidak diteruskan runner ke pemanggil).
 */
function spawnWithEffort(effort, capture) {
  return (file, ...rest) => {
    let child;
    if (typeof file === 'string' && rest.length === 1) {
      // Windows: satu string perintah dengan `shell: true`.
      if (!file.includes(' --effort low '))
        throw new Error('Perintah runner tanpa `--effort low`.');
      capture.command = file.replace(' --effort low ', ` --effort ${effort} `);
      child = spawn(capture.command, rest[0]);
    } else {
      const [args, options] = rest;
      const at = args.indexOf('--effort');
      if (at === -1) throw new Error('Perintah runner tanpa `--effort`.');
      const replaced = args.with(at + 1, effort);
      capture.command = [file, ...replaced].join(' ');
      child = spawn(file, replaced, options);
    }
    child.stdout?.on('data', (chunk) => capture.chunks.push(Buffer.from(chunk)));
    return child;
  };
}

function streamFacts(ndjson) {
  let model = null;
  let thinkingTokens = 0;
  let usage = null;
  for (const line of ndjson.split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init') model = event.model ?? null;
    if (event.type === 'system' && event.subtype === 'thinking_tokens') {
      thinkingTokens = Math.max(thinkingTokens, event.estimated_tokens ?? 0);
    }
    if (event.type === 'result') usage = event.usage ?? null;
  }
  return { model, thinkingTokens, usage };
}

/** Petunjuk awal saja; penilaian akhir dari pembacaan temuan (log T-034). */
const ADMIN = /admin/i;
const CLAIM =
  /verifi|email_verified|klaim|mengklaim|claim|lebih dulu|mendahului|merebut|ambil ?alih|takeover|menyamar|impersonat|siapa pun/i;
function adminClaimHint(output) {
  const findings = Array.isArray(output?.findings) ? output.findings : [];
  return findings
    .filter((f) => {
      const text = JSON.stringify(f);
      return ADMIN.test(text) && CLAIM.test(text);
    })
    .map((f) => f.id ?? f.code ?? '?');
}

const resultsPath = join(OUT, 'results.json');
mkdirSync(OUT, { recursive: true });
const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : {};
const save = () => writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);

const plan = [];
for (let rep = 1; rep <= REPEATS; rep++) {
  for (const config of CONFIGS) {
    for (const stage of STAGES) plan.push({ id: `${stage}-${config.id}-${rep}`, stage, config });
  }
}

console.log(
  `Proyek ${PROJECT_ID}; prompt tahap 5 ${prompts.stage5.length} karakter (versi ${definitions.stage5.promptVersion}), review 2 ${prompts.review2.length} karakter (versi ${definitions.review2.promptVersion}).`,
);
console.log(`Perintah dasar runner: claude ${claudeArgs('<model>').join(' ')}`);
if (dryRun) {
  mkdirSync(join(OUT, 'prompts'), { recursive: true });
  for (const stage of STAGES) writeFileSync(join(OUT, 'prompts', `${stage}.txt`), prompts[stage]);
  for (const run of plan) {
    console.log(`${run.id}: --model ${run.config.model} --effort ${run.config.effort}`);
  }
  console.log(`Prompt ditulis ke ${join(OUT, 'prompts')}. Tidak ada pemanggilan (--dry-run).`);
} else if (summaryOnly) {
  writeSummary();
} else {
  for (const run of plan) {
    if (results[run.id]?.status === 'ok') continue;
    const spent = Object.values(results).reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    const sameModel = Object.values(results).filter(
      (r) => r.model === run.config.model && r.costUsd,
    );
    const projected = sameModel.length
      ? Math.max(...sameModel.map((r) => r.costUsd))
      : FIRST_RUN_GUESS_USD[run.config.model];
    if (spent + projected > MAX_COST_USD) {
      console.log(
        `Berhenti sebelum ${run.id}: biaya ${spent.toFixed(3)} + perkiraan ${projected.toFixed(3)} > $${MAX_COST_USD}.`,
      );
      break;
    }

    const definition = definitions[run.stage];
    const capture = { command: '', chunks: [] };
    const env = command
      ? {
          FAKE_CLAUDE_MODE: 'fixture',
          FAKE_CLAUDE_FIXTURE: join(FIXTURES, FAKE_FIXTURES[run.stage]),
        }
      : {};
    const runner = new CliClaudeRunner({
      command,
      model: run.config.model,
      env,
      spawnFn: spawnWithEffort(run.config.effort, capture),
    });
    process.stdout.write(`${run.id} ... `);
    const record = {
      stage: run.stage,
      config: run.config.id,
      model: run.config.model,
      effort: run.config.effort,
      promptVersion: definition.promptVersion,
    };
    try {
      const result = await runner.run(prompts[run.stage]);
      const ndjson = Buffer.concat(capture.chunks).toString('utf8');
      writeFileSync(join(OUT, `${run.id}.ndjson`), ndjson);
      writeFileSync(join(OUT, `${run.id}.txt`), result.result);
      const facts = streamFacts(ndjson);
      let output = null;
      let validation;
      try {
        output = definition.parse(result.result);
        validation = definition.validate(output, context);
      } catch (error) {
        validation = { errors: [`parse gagal: ${error.message}`] };
      }
      Object.assign(record, {
        status: 'ok',
        initModel: facts.model,
        inputTokens: result.inputTokens,
        usage: facts.usage,
        outputTokens: result.outputTokens,
        thinkingEstimate: facts.thinkingTokens,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        resultChars: result.result.length,
        valid: validation.errors.length === 0,
        errors: validation.errors,
        warnings: validation.warnings ?? [],
        findings: Array.isArray(output?.findings) ? output.findings.length : null,
        adminClaimHint: adminClaimHint(output),
        command: capture.command,
      });
      console.log(
        `${result.durationMs} ms, $${result.costUsd}, valid ${record.valid}, temuan ${record.findings}, petunjuk klaim admin ${record.adminClaimHint.join(',') || '-'}`,
      );
    } catch (error) {
      Object.assign(record, {
        status: 'error',
        error: `${error.code ?? ''} ${error.message}`.trim(),
        command: capture.command,
      });
      console.log(`GAGAL: ${record.error}`);
    }
    results[run.id] = record;
    save();
  }
  writeSummary();
}

db.$client.close();
rmSync(workDir, { recursive: true, force: true });

/** Token thinking pasti dari `usage.output_tokens_details`; perkiraan stream bila tidak ada. */
function thinkingOf(r) {
  return r.usage?.output_tokens_details?.thinking_tokens ?? r.thinkingEstimate;
}

function cacheOf(r) {
  return `${r.usage?.cache_creation_input_tokens ?? '?'} / ${r.usage?.cache_read_input_tokens ?? '?'}`;
}

function writeSummary() {
  const rows = plan
    .map((run) => [run.id, results[run.id]])
    .filter(([, r]) => r)
    .map(([id, r]) =>
      r.status !== 'ok'
        ? `| ${id} | gagal: ${r.error} | | | | | | | |`
        : `| ${id} | ${r.initModel} | ${r.findings} | ${r.adminClaimHint.join(', ') || '-'} | ${r.valid ? 'ya' : `tidak (${r.errors.length})`} | ${r.inputTokens} (${cacheOf(r)}) | ${r.outputTokens} (${thinkingOf(r)} / ${r.outputTokens - thinkingOf(r)}) | ${r.costUsd?.toFixed(3)} | ${(r.durationMs / 1000).toFixed(0)} |`,
    );
  const text = [
    '# Hasil spike T-034',
    '',
    'Petunjuk klaim admin: temuan yang menyebut admin dan verifikasi/klaim (heuristik); penilaian akhir di `docs/logs/T-034.md`. Thinking dari `usage.output_tokens_details.thinking_tokens`, teks = output - thinking. Cache prompt dipakai bersama antar-run (tulis / baca), jadi biaya run kedua per tahap lebih rendah.',
    '',
    '| Run | Model (init) | Temuan | Petunjuk klaim admin | Lolos validator | Token input (cache tulis / baca) | Token output (thinking / teks) | Biaya USD | Durasi dtk |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'summary.md'), text);
}
