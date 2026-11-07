// Spike T-044: penggabungan dan peninjauan "Catatan pertentangan" tahap 7 (prompt percobaan "7c").
// Mengambil semua catatan dari dokumen `tasks` terbaru proyek "Reservasi Massage 3" (verifikasi
// T-043), lalu meminta Claude menggabungkannya per akar masalah menjadi pertanyaan untuk user,
// dalam dua konfigurasi model/effort, masing-masing dua kali.
//
// - Input dari salinan database utama (sumber dibuka read-only): dokumen `tasks` dan `prd` terbaru,
//   output 7a yang berlaku (id, judul, layer, `depends_on`, `tables`), API Contract PRD
//   (`apiContractSection`), dan bagian konvensi `stage7b` dari `TEMPLATE_DIR` (`readStageConventions`).
// - Pemanggilan lewat `CliClaudeRunner` (bentuk perintah runner saat ini); hanya `--model` dan
//   `--effort` per run yang berbeda. Satu percobaan per run, tanpa percobaan ulang: yang diukur
//   adalah lolos validasi bentuk di percobaan pertama.
//
// Memakai kuota langganan; hanya dijalankan atas izin user. Dari root repo:
//
//   node spikes/conflict-review/run.mjs --dry-run   (catatan, prompt, dan perintah, tanpa claude)
//   node spikes/conflict-review/run.mjs --fake      (CLI palsu dengan fake-7c.json, tanpa kuota)
//   node spikes/conflict-review/run.mjs             (4 pemanggilan sungguhan)
//   node spikes/conflict-review/run.mjs --summary   (susun ulang summary.md dari results.json)
//
// Hasil di `spikes/conflict-review/results/`: `notes.json` (catatan yang diambil), `prompt-7c.txt`,
// `results.json` (per run), `summary.md`, output teks per run, dan stream mentah (`*.ndjson`,
// di-ignore Git). Run yang sudah tercatat dilewati, jadi script bisa dijalankan ulang setelah
// terhenti. Berhenti sebelum run berikutnya bila total biaya bisa melewati MAX_COST_USD.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { CliClaudeRunner, claudeArgs } from '../../src/claude/cli-runner.ts';
import { MAIN_DATABASE_PATH, openDatabase } from '../../src/core/db/client.ts';
import { projects } from '../../src/core/db/schema.ts';
import { latestDocument } from '../../src/projects/documents.ts';
import { readStageConventions } from '../../src/stages/conventions.ts';
import { extractJson } from '../../src/stages/parse.ts';
import { currentOutput } from '../../src/stages/run-stage.ts';
import { apiContractSection } from '../../src/stages/stage-7b/prd-excerpt.ts';

const PROJECT_NAME = 'Reservasi Massage 3';
const HERE = resolve('spikes/conflict-review');
const argv = process.argv.slice(2);
const fake = argv.includes('--fake');
const dryRun = argv.includes('--dry-run');
const summaryOnly = argv.includes('--summary');
// CLI palsu menulis ke folder sementara agar tidak tercampur dengan hasil sungguhan.
const OUT = fake ? join(tmpdir(), 'prd-generator-t044-fake') : join(HERE, 'results');
const MAX_COST_USD = 3;
/** Perkiraan biaya run pertama per model, sebelum ada angka nyata (untuk batas biaya). */
const FIRST_RUN_GUESS_USD = { sonnet: 0.15, opus: 0.6 };

const CONFIGS = [
  { id: 'sonnet-low', model: 'sonnet', effort: 'low' },
  { id: 'opus-medium', model: 'opus', effort: 'medium' },
];
const REPEATS = 2;
const SOURCES = ['prd', 'template', 'generator', 'pilihan_bebas'];
const NOTE_MARK = /Catatan pertentangan:/gi;
/**
 * Catatan berakar konsep role/peran yang belum ada di konvensi template (Kendala T-043), ditandai
 * dari isinya setelah dibaca: task dan path. Dipakai untuk metrik "catatan role digabung menjadi satu".
 */
const ROLE_NOTES = [
  ['T-003', 'apps/app/lib/core/router/app_router.dart'],
  ['T-005', 'apps/api/src/features/services/http/admin-services.route.ts'],
  ['T-006', 'apps/app/lib/core/router/app_router.dart'],
  ['T-010', 'apps/api/src/features/therapists/http/admin-therapists.route.ts'],
  ['T-014', 'apps/app/lib/core/router/app_router.dart'],
  ['T-021', 'apps/app/lib/core/router/app_router.dart'],
];

if (existsSync('.env')) process.loadEnvFile('.env');

// --- Input: salinan database utama -------------------------------------------------------------

const workDir = join(tmpdir(), `prd-generator-t044-${process.pid}`);
mkdirSync(workDir, { recursive: true });
const dbPath = join(workDir, 'copy.db');
const source = new Database(MAIN_DATABASE_PATH, { readonly: true, fileMustExist: true });
await source.backup(dbPath);
source.close();
const db = openDatabase(dbPath);

const project = db.select().from(projects).where(eq(projects.name, PROJECT_NAME)).get();
if (!project) throw new Error(`Proyek "${PROJECT_NAME}" tidak ada di database.`);
const tasksDoc = latestDocument(db, project.id, 'tasks');
const prdDoc = latestDocument(db, project.id, 'prd');
const stage7a = currentOutput(db, project.id, 'stage7a');
if (!tasksDoc || !prdDoc || !stage7a) throw new Error('Proyek belum punya TASKS, PRD, atau 7a.');
const conventions = await readStageConventions(
  process.env.TEMPLATE_DIR,
  'stage7b',
  'prompt 7c belum bisa dibuat',
);

/**
 * Entri `files` di TASKS: `` `path` (keterangan) ``. Keterangan bisa memuat tanda kurung bersarang
 * (dua tingkat), misalnya "(T-012/T-019 bila sudah dibuat)".
 */
const FILE_ENTRY = /`([^`]+)`(?:\s*\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\))?/g;

/** Semua catatan pertentangan; satu keterangan file bisa memuat lebih dari satu catatan. */
function extractNotes(md) {
  const notes = [];
  let task = null;
  for (const line of md.split('\n')) {
    const heading = line.match(/^- \[[ x]\] (T-\d{3})/);
    if (heading) task = heading[1];
    const files = line.match(/^\s+- files:\s*(.*)$/);
    if (!files || !task) continue;
    for (const [, path, fileNote] of files[1].matchAll(FILE_ENTRY)) {
      if (!fileNote) continue;
      const starts = [...fileNote.matchAll(NOTE_MARK)].map((m) => m.index);
      starts.forEach((start, i) => {
        const text = fileNote.slice(start, starts[i + 1] ?? fileNote.length).trim();
        notes.push({ id: '', task, path, text });
      });
    }
  }
  return notes.map((note, i) => ({ ...note, id: `C-${String(i + 1).padStart(2, '0')}` }));
}

const notes = extractNotes(tasksDoc.content);
const totalMarks = tasksDoc.content.match(NOTE_MARK)?.length ?? 0;
if (notes.length !== totalMarks) {
  throw new Error(`Hanya ${notes.length} dari ${totalMarks} catatan yang terbaca dari files.`);
}
const roleNoteIds = ROLE_NOTES.map(([task, path]) => {
  const note = notes.find((n) => n.task === task && n.path === path);
  if (!note) throw new Error(`Catatan role ${task} ${path} tidak ditemukan.`);
  return note.id;
});
const taskList = stage7a.tasks.map((t) => ({
  id: t.id,
  title: t.title,
  layer: t.layer,
  depends_on: t.depends_on,
  tables: t.tables ?? [],
}));
const taskIds = new Set(taskList.map((t) => t.id));

const template = readFileSync(join(HERE, 'prompt-7c.md'), 'utf8');
const prompt = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
  const values = {
    conventions: conventions.sections,
    apiContract: apiContractSection(prdDoc.content),
    tasks: JSON.stringify(taskList, null, 2),
    notes: JSON.stringify(notes, null, 2),
  };
  if (!(key in values)) throw new Error(`Placeholder tidak dikenal: ${key}`);
  return values[key];
});

// --- Validasi bentuk output --------------------------------------------------------------------

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/** Error bentuk (gagal = tidak lolos) dan pemetaan catatan, tanpa menilai isi. */
function validate(output) {
  const errors = [];
  const conflicts = output?.conflicts;
  if (!Array.isArray(conflicts) || conflicts.length === 0) {
    return { errors: ['"conflicts" bukan array berisi'], unmapped: [], duplicated: [] };
  }
  const seen = new Map();
  const ids = new Set();
  conflicts.forEach((c, i) => {
    const at = `conflicts[${i}] ${c?.id ?? ''}`.trim();
    if (!nonEmpty(c?.id) || ids.has(c.id)) errors.push(`${at}: id kosong atau ganda`);
    ids.add(c?.id);
    for (const key of ['topic', 'question', 'recommendation_reason']) {
      if (!nonEmpty(c?.[key])) errors.push(`${at}: "${key}" kosong`);
    }
    if (!SOURCES.includes(c?.source)) errors.push(`${at}: source "${c?.source}" tidak dikenal`);
    if (!Array.isArray(c?.note_ids) || c.note_ids.length === 0) {
      errors.push(`${at}: "note_ids" kosong`);
    }
    for (const id of c?.note_ids ?? []) {
      if (!notes.some((n) => n.id === id)) errors.push(`${at}: catatan ${id} tidak ada`);
      seen.set(id, [...(seen.get(id) ?? []), c.id]);
    }
    const options = c?.options;
    if (!Array.isArray(options) || options.length < 2 || options.length > 3) {
      errors.push(`${at}: opsi harus 2–3`);
    } else {
      const optionIds = options.map((o) => o?.id);
      if (new Set(optionIds).size !== options.length || !optionIds.every(nonEmpty)) {
        errors.push(`${at}: id opsi kosong atau ganda`);
      }
      if (!options.every((o) => nonEmpty(o?.label) && nonEmpty(o?.impact))) {
        errors.push(`${at}: opsi tanpa label atau impact`);
      }
      if (!optionIds.includes(c?.recommended)) {
        errors.push(`${at}: recommended "${c?.recommended}" bukan id opsi`);
      }
    }
    if (!Array.isArray(c?.affected_tasks) || c.affected_tasks.length === 0) {
      errors.push(`${at}: "affected_tasks" kosong`);
    }
    for (const id of c?.affected_tasks ?? []) {
      if (!taskIds.has(id)) errors.push(`${at}: task ${id} tidak ada di daftar task`);
    }
    const answered = c?.answered_by;
    if (answered !== null && answered !== undefined) {
      if (!taskIds.has(answered?.task) || !nonEmpty(answered?.explanation)) {
        errors.push(`${at}: answered_by harus null atau {task, explanation} dengan task yang ada`);
      }
    } else if (answered === undefined) {
      errors.push(`${at}: "answered_by" tidak ada (null bila tidak dijawab task lain)`);
    }
  });
  const unmapped = notes.filter((n) => !seen.has(n.id)).map((n) => n.id);
  const duplicated = [...seen].filter(([, owners]) => owners.length > 1).map(([id]) => id);
  if (unmapped.length) errors.push(`catatan tidak terpetakan: ${unmapped.join(', ')}`);
  if (duplicated.length) errors.push(`catatan terpetakan ganda: ${duplicated.join(', ')}`);
  return { errors, unmapped, duplicated };
}

/** Pertentangan yang memuat catatan role, dan apakah semuanya ada di satu pertentangan. */
function roleMerge(output) {
  const owners = new Set(
    (output?.conflicts ?? [])
      .filter((c) => (c.note_ids ?? []).some((id) => roleNoteIds.includes(id)))
      .map((c) => c.id),
  );
  return { merged: owners.size === 1, conflicts: [...owners] };
}

// --- Pemanggilan -------------------------------------------------------------------------------

/** `spawn` yang menyalin stdout mentah (event `thinking_tokens` tidak diteruskan runner). */
function capturingSpawn(capture) {
  return (file, ...rest) => {
    capture.command = rest.length === 1 ? file : [file, ...rest[0]].join(' ');
    const child = spawn(file, ...rest);
    child.stdout?.on('data', (chunk) => capture.chunks.push(Buffer.from(chunk)));
    return child;
  };
}

function streamUsage(ndjson) {
  for (const line of ndjson.split('\n').reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'result') return event.usage ?? null;
    } catch {}
  }
  return null;
}

const resultsPath = join(OUT, 'results.json');
mkdirSync(OUT, { recursive: true });
const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, 'utf8')) : {};
const save = () => writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);

const plan = [];
for (let rep = 1; rep <= REPEATS; rep++) {
  for (const config of CONFIGS) plan.push({ id: `${config.id}-${rep}`, config });
}

writeFileSync(join(OUT, 'notes.json'), `${JSON.stringify(notes, null, 2)}\n`);
writeFileSync(join(OUT, 'prompt-7c.txt'), prompt);
console.log(
  `Proyek ${project.id}; TASKS versi ${tasksDoc.version}, PRD versi ${prdDoc.version}, ${taskList.length} task 7a.`,
);
console.log(
  `Template commit ${conventions.commit} (proyek: ${project.templateCommit ?? '-'}); ${notes.length} catatan (role: ${roleNoteIds.join(', ')}); prompt ${prompt.length} karakter.`,
);
console.log(
  `Perintah dasar runner: claude ${claudeArgs({ model: '<model>', effort: '<effort>' }).join(' ')}`,
);

if (dryRun) {
  for (const note of notes) console.log(`${note.id} ${note.task} ${note.path}\n  ${note.text}`);
  for (const run of plan) {
    console.log(`${run.id}: --model ${run.config.model} --effort ${run.config.effort}`);
  }
  console.log(`Catatan dan prompt ditulis ke ${OUT}. Tidak ada pemanggilan (--dry-run).`);
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

    const capture = { command: '', chunks: [] };
    const runner = new CliClaudeRunner({
      command: fake ? `node ${resolve('test/helpers/fake-claude-cli.mjs')}` : undefined,
      env: fake
        ? { FAKE_CLAUDE_MODE: 'fixture', FAKE_CLAUDE_FIXTURE: join(HERE, 'fake-7c.json') }
        : {},
      spawnFn: capturingSpawn(capture),
    });
    process.stdout.write(`${run.id} ... `);
    const record = { config: run.config.id, model: run.config.model, effort: run.config.effort };
    try {
      const result = await runner.run(prompt, {
        model: run.config.model,
        effort: run.config.effort,
      });
      const ndjson = Buffer.concat(capture.chunks).toString('utf8');
      writeFileSync(join(OUT, `${run.id}.ndjson`), ndjson);
      writeFileSync(join(OUT, `${run.id}.txt`), result.result);
      let output = null;
      let validation;
      try {
        output = extractJson(result.result);
        validation = validate(output);
      } catch (error) {
        validation = { errors: [`parse gagal: ${error.message}`], unmapped: [], duplicated: [] };
      }
      const role = roleMerge(output);
      Object.assign(record, {
        status: 'ok',
        initModel: result.initModel ?? null,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        usage: streamUsage(ndjson),
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        valid: validation.errors.length === 0,
        errors: validation.errors,
        conflicts: Array.isArray(output?.conflicts) ? output.conflicts.length : null,
        sources: Object.fromEntries(
          SOURCES.map((s) => [s, (output?.conflicts ?? []).filter((c) => c.source === s).length]),
        ),
        answeredBy: (output?.conflicts ?? []).filter((c) => c.answered_by).map((c) => c.id),
        roleMerged: role.merged,
        roleConflicts: role.conflicts,
        unmapped: validation.unmapped,
        duplicated: validation.duplicated,
        command: capture.command,
      });
      console.log(
        `${result.durationMs} ms, $${result.costUsd}, valid ${record.valid}, ${record.conflicts} pertentangan, role digabung ${record.roleMerged}`,
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

function writeSummary() {
  const rows = plan
    .map((run) => [run.id, results[run.id]])
    .filter(([, r]) => r)
    .map(([id, r]) =>
      r.status !== 'ok'
        ? `| ${id} | gagal: ${r.error} | | | | | | | | |`
        : `| ${id} | ${r.initModel ?? '-'} | ${r.valid ? 'ya' : `tidak (${r.errors.length})`} | ${r.conflicts} | ${SOURCES.map((s) => r.sources[s]).join(' / ')} | ${r.roleMerged ? 'ya' : `tidak (${r.roleConflicts.join(', ')})`} | ${[...r.unmapped, ...r.duplicated.map((id) => `${id}×2`)].join(', ') || '-'} | ${r.inputTokens} / ${r.outputTokens} | ${r.costUsd?.toFixed(3)} | ${(r.durationMs / 1000).toFixed(0)} |`,
    );
  const text = [
    '# Hasil spike T-044',
    '',
    `${notes.length} catatan pertentangan; catatan role: ${roleNoteIds.join(', ')}. Sumber: prd / template / generator / pilihan_bebas. Penilaian salah gabung dan salah sumber di \`docs/logs/T-044.md\`.`,
    '',
    '| Run | Model (init) | Lolos bentuk | Pertentangan | Sumber | Role jadi satu | Tidak terpetakan / ganda | Token input / output | Biaya USD | Durasi dtk |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(join(OUT, 'summary.md'), text);
}
