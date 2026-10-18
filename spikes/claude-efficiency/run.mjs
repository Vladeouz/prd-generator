// Spike T-022: membandingkan bentuk perintah `claude -p` untuk tahap 2 dan tahap 6 proyek uji
// T-012. Memakai kuota langganan; dijalankan user, tidak pernah oleh test.
//
//   node spikes/claude-efficiency/run.mjs --dry-run      (tanpa kuota: susun prompt dan perintah)
//   node spikes/claude-efficiency/run.mjs                (semua pemanggilan, ±30–45 menit)
//   node spikes/claude-efficiency/run.mjs --only s6-D,s2-C
//   node spikes/claude-efficiency/run.mjs --command "node <path absolut ke CLI palsu>"
//
// Konfigurasi:
//   A  perintah sekarang: -p --output-format json --max-turns 1
//   B  A + --model sonnet + thinking mati (env MAX_THINKING_TOKENS=0 dan --settings
//      alwaysThinkingEnabled=false; probe menentukan mana yang cukup)
//   C  B + pengurang overhead (system prompt sendiri, tanpa tool, tanpa MCP dan pengaturan user,
//      tanpa skill, tanpa sesi tersimpan, --safe-mode) + stream-json
//   D  C + bagian conventions terpilih (hanya tahap 6; untuk tahap 2 sama dengan C)
// Setiap pemanggilan berjalan di folder sementara kosong dan menerima prompt lewat stdin.
//
// Hasil: spikes/claude-efficiency/results/ (results.json, summary.md, output per pemanggilan).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJson, extractMarkdown } from '../../src/stages/parse.ts';
import { validateStage2 } from '../../src/stages/stage-2/validate.ts';
import { prdSection, validatePrd } from '../../src/stages/stage-6/validate.ts';
import { buildPrompts, STAGE6_HEADINGS } from './prompts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS = join(HERE, 'results');
const TIMEOUT_MS = 15 * 60_000;
const MODEL = 'sonnet';
const SYSTEM_PROMPT =
  'Kamu adalah generator dokumen non-interaktif. Ikuti instruksi di pesan user persis. ' +
  'Jangan memakai tool. Balas hanya dengan output yang diminta.';
const PROBE_PROMPT = 'Berapa 37 x 43? Balas hanya angkanya.';

// --- argumen ---------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const dryRun = flag('--dry-run');
const rescore = flag('--rescore');
const command = option('--command') ?? 'claude';
const only = option('--only')
  ?.split(',')
  .map((s) => s.trim());

// --- konfigurasi -----------------------------------------------------------------------------
const settingsDir = mkdtempSync(join(tmpdir(), 'prd-generator-t022-settings-'));
const settingsPath = join(settingsDir, 'settings.json');
writeFileSync(settingsPath, JSON.stringify({ alwaysThinkingEnabled: false }));

const JSON_OUT = ['--output-format', 'json'];
const STREAM_OUT = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
const THINKING_ENV = { MAX_THINKING_TOKENS: '0' };
const THINKING_SETTINGS = ['--settings', settingsPath];
const OVERHEAD = [
  '--system-prompt',
  SYSTEM_PROMPT,
  '--tools',
  '',
  '--strict-mcp-config',
  '--setting-sources',
  'project',
  '--disable-slash-commands',
  '--no-session-persistence',
];

const CONFIGS = {
  A: { args: ['-p', ...JSON_OUT, '--max-turns', '1'], env: {} },
  B: {
    args: ['-p', ...JSON_OUT, '--max-turns', '1', '--model', MODEL, ...THINKING_SETTINGS],
    env: THINKING_ENV,
  },
  C: {
    args: [
      '-p',
      ...STREAM_OUT,
      '--max-turns',
      '1',
      '--model',
      MODEL,
      ...THINKING_SETTINGS,
      ...OVERHEAD,
      '--safe-mode',
    ],
    env: THINKING_ENV,
  },
  // Probe: thinking menyala atau tidak (dilihat dari blok thinking di stream), dan overhead.
  'P-sonnet': { args: ['-p', ...STREAM_OUT, '--max-turns', '1', '--model', MODEL], env: {} },
  'P-env': {
    args: ['-p', ...STREAM_OUT, '--max-turns', '1', '--model', MODEL],
    env: THINKING_ENV,
  },
  'P-settings': {
    args: ['-p', ...STREAM_OUT, '--max-turns', '1', '--model', MODEL, ...THINKING_SETTINGS],
    env: {},
  },
  'P-C-tanpa-safe-mode': {
    args: [
      '-p',
      ...STREAM_OUT,
      '--max-turns',
      '1',
      '--model',
      MODEL,
      ...THINKING_SETTINGS,
      ...OVERHEAD,
    ],
    env: THINKING_ENV,
  },
};
CONFIGS['P-C'] = CONFIGS.C;
CONFIGS.D = CONFIGS.C;
// Run tambahan setelah hasil pertama (thinking tidak bisa dimatikan di Sonnet 5.5):
//   E  D + --effort low
//   F  E + batas ukuran PRD di prompt (stage6Compact)
CONFIGS.E = { args: [...CONFIGS.C.args, '--effort', 'low'], env: CONFIGS.C.env };

/** Urutan: probe dulu (murah), lalu tahap 2, lalu tahap 6 dengan A (paling lama) terakhir. */
const RUNS = [
  { id: 'probe-sonnet', config: 'P-sonnet', prompt: 'probe' },
  { id: 'probe-env', config: 'P-env', prompt: 'probe' },
  { id: 'probe-settings', config: 'P-settings', prompt: 'probe' },
  { id: 'probe-C-tanpa-safe-mode', config: 'P-C-tanpa-safe-mode', prompt: 'probe' },
  { id: 'probe-C', config: 'P-C', prompt: 'probe' },
  { id: 's2-A', config: 'A', prompt: 'stage2', stage: 2 },
  { id: 's2-B', config: 'B', prompt: 'stage2', stage: 2 },
  { id: 's2-C', config: 'C', prompt: 'stage2', stage: 2 },
  { id: 's6-D', config: 'D', prompt: 'stage6Selected', stage: 6 },
  { id: 's6-C', config: 'C', prompt: 'stage6', stage: 6 },
  { id: 's6-B', config: 'B', prompt: 'stage6', stage: 6 },
  { id: 's6-A', config: 'A', prompt: 'stage6', stage: 6 },
  { id: 's6-E', config: 'E', prompt: 'stage6Selected', stage: 6, extra: true },
  { id: 's6-F', config: 'E', prompt: 'stage6Compact', stage: 6, extra: true },
];

// --- pemanggilan -----------------------------------------------------------------------------
function quoteWin(arg) {
  if (/["%!^&|<>]/.test(arg)) throw new Error(`Argumen tidak aman untuk cmd.exe: ${arg}`);
  return arg === '' || /\s/.test(arg) ? `"${arg}"` : arg;
}

function commandLine(config) {
  return [command, ...config.args.map(quoteWin)].join(' ');
}

function killTree(child) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else child.kill('SIGKILL');
}

/** Menjalankan satu pemanggilan; mengembalikan stdout, stderr, exit code, dan event stream. */
function invoke(config, prompt) {
  const cwd = mkdtempSync(join(tmpdir(), 'prd-generator-claude-'));
  const started = performance.now();
  const at = () => Math.round(performance.now() - started);
  const options = {
    cwd,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...config.env },
  };
  // Sama dengan runner CLI: Windows satu string dengan shell, platform lain array argumen.
  const child =
    process.platform === 'win32'
      ? spawn(commandLine(config), { ...options, shell: true })
      : spawn(command, config.args, options);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let pending = '';
    const lines = []; // [ms, baris]
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
      pending += chunk;
      const parts = pending.split('\n');
      pending = parts.pop() ?? '';
      for (const line of parts) if (line.trim()) lines.push([at(), line]);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, TIMEOUT_MS);
    const finish = (exitCode, spawnError) => {
      clearTimeout(timer);
      if (pending.trim()) lines.push([at(), pending]);
      rmSync(cwd, { recursive: true, force: true });
      resolve({ stdout, stderr, exitCode, spawnError, timedOut, lines, durationMs: at() });
    };
    child.on('error', (error) => finish(null, error.message));
    child.on('close', (exitCode) => finish(exitCode));
    child.stdin.on('error', () => {});
    child.stdin.end(prompt, 'utf8');
  });
}

// --- membaca output --------------------------------------------------------------------------
function parseStream(lines) {
  const info = {
    init: null,
    final: null,
    textDeltas: 0,
    firstTextMs: null,
    thinkingBlocks: 0,
    thinkingChars: 0,
    badLines: 0,
  };
  for (const [ms, line] of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      info.badLines++;
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init') info.init = event;
    if (event.type === 'result') info.final = { ...event, receivedMs: ms };
    const inner = event.type === 'stream_event' ? event.event : null;
    if (inner?.type === 'content_block_start' && /thinking/.test(inner.content_block?.type ?? '')) {
      info.thinkingBlocks++;
    }
    if (inner?.type === 'content_block_delta') {
      if (inner.delta?.type === 'text_delta') {
        info.textDeltas++;
        info.firstTextMs ??= ms;
      }
      if (inner.delta?.type === 'thinking_delta') info.thinkingChars += inner.delta.thinking.length;
    }
    // Tanpa partial message, blok thinking tetap terlihat di pesan assistant utuh.
    if (event.type === 'assistant' && !info.textDeltas) {
      for (const block of event.message?.content ?? []) {
        if (/thinking/.test(block.type)) info.thinkingChars += (block.thinking ?? '').length;
      }
    }
  }
  return info;
}

/** Baris conventions (≥ 60 karakter, bukan heading) yang muncul persis di output. */
function copiedConventionLines(conventions, output) {
  const candidates = [
    ...new Set(
      conventions
        .replaceAll('\r\n', '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length >= 60 && !l.startsWith('#')),
    ),
  ];
  return candidates.filter((l) => output.includes(l)).length;
}

function validate(stage, result) {
  try {
    const v =
      stage === 2 ? validateStage2(extractJson(result)) : validatePrd(extractMarkdown(result));
    return { errors: v.errors, warnings: v.warnings ?? [] };
  } catch (error) {
    return { errors: [`parse: ${error.message}`], warnings: [] };
  }
}

function summarize(run, config, prompt, raw, conventions) {
  const record = {
    id: run.id,
    config: run.config,
    stage: run.stage ?? null,
    command: commandLine(config),
    env: config.env,
    promptChars: prompt.length,
    exitCode: raw.exitCode,
    timedOut: raw.timedOut,
    wallMs: raw.durationMs,
    finishedAt: new Date().toISOString(),
  };
  const stream = config.args.includes('stream-json');
  let envelope;
  if (stream) {
    const info = parseStream(raw.lines);
    envelope = info.final;
    record.stream = {
      lines: raw.lines.length,
      badLines: info.badLines,
      textDeltas: info.textDeltas,
      firstTextMs: info.firstTextMs,
      resultEventMs: info.final?.receivedMs ?? null,
      thinkingBlocks: info.thinkingBlocks,
      thinkingChars: info.thinkingChars,
      finalHasUsage: Boolean(info.final?.usage),
      finalHasCost: typeof info.final?.total_cost_usd === 'number',
    };
    if (info.init) {
      record.init = {
        model: info.init.model,
        tools: info.init.tools,
        mcpServers: info.init.mcp_servers,
        slashCommands: info.init.slash_commands?.length ?? null,
        skills: info.init.skills?.length ?? null,
        plugins: info.init.plugins?.length ?? null,
        keys: Object.keys(info.init),
      };
    }
  } else {
    try {
      envelope = JSON.parse(raw.stdout);
    } catch {
      envelope = null;
    }
  }
  if (raw.exitCode !== 0 || !envelope) {
    record.error = raw.spawnError ?? (raw.stderr || raw.stdout).trim().slice(0, 2000);
    return { record, result: envelope?.result ?? null, envelope };
  }
  const usage = envelope.usage ?? {};
  const result = envelope.result ?? '';
  record.isError = envelope.is_error;
  record.usage = {
    input: usage.input_tokens,
    cacheCreation: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    output: usage.output_tokens,
  };
  record.inputTokens = record.usage.input + record.usage.cacheCreation + record.usage.cacheRead;
  record.outputTokens = usage.output_tokens;
  record.costUsd = envelope.total_cost_usd ?? null;
  record.modelUsage = Object.keys(envelope.modelUsage ?? {});
  record.resultChars = result.length;
  record.resultBytes = Buffer.byteLength(result, 'utf8');
  record.charsPerOutputToken = usage.output_tokens
    ? Math.round((result.length / usage.output_tokens) * 100) / 100
    : null;
  if (run.stage) record.validation = validate(run.stage, result);
  scoreStage6(record, run, result, conventions);
  return { record, result, envelope };
}

function scoreStage6(record, run, result, conventions) {
  if (run.stage !== 6) return;
  record.copiedConventionLines = copiedConventionLines(conventions, result);
  record.quality = prdQuality(result);
}

/**
 * Pemeriksaan kualitas di luar validator: fitur yang diterima tanpa FR, keputusan yang tidak
 * dirujuk, dan tabel erDiagram yang tidak disebut di API Contract atau FR. Bukan pengganti
 * membaca PRD; hanya untuk membandingkan konfigurasi.
 */
function prdQuality(md) {
  const section = (heading) => prdSection(md, heading);
  const frs = section('## 6. Functional Requirements');
  const api = section('## 5. API Contract');
  const er = md.match(/```mermaid\s*\n\s*erDiagram([\s\S]*?)```/)?.[1] ?? '';
  const tables = [...er.matchAll(/^\s*([A-Za-z_][\w]*)\s*\{/gm)].map((m) => m[1]);
  const lower = (text) => text.toLowerCase();
  return {
    frCount: (frs.match(/^### FR-\d+/gm) ?? []).length,
    acceptanceCriteria: (frs.match(/^\s*- \[ \]/gm) ?? []).length,
    endpoints: new Set(api.match(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[^\s`|)]*/g) ?? []).size,
    sectionBytes: Object.fromEntries(
      [
        '## 3. Tech Constraints',
        '## 4. Data Model',
        '## 5. API Contract',
        '## 6. Functional Requirements',
      ].map((h) => [h[3], Buffer.byteLength(section(h), 'utf8')]),
    ),
    featuresWithoutFr: built.features
      .filter((f) => !frs.includes(f.id) && !lower(frs).includes(lower(f.name)))
      .map((f) => f.id),
    decisionsNotReferenced: built.decisionCodes.filter(
      (code) => !new RegExp(`\\b${code}\\b`).test(md),
    ),
    tables: tables.length,
    tablesUnused: tables.filter((t) => !lower(api + frs).includes(lower(t))),
  };
}

// --- ringkasan -------------------------------------------------------------------------------
const fmt = (n, digits = 0) => (typeof n === 'number' ? n.toFixed(digits) : '-');

function summaryMarkdown(meta, records) {
  const rows = RUNS.map((run) => records[run.id]).filter(Boolean);
  const out = [
    '# Hasil spike T-022',
    '',
    `- Claude Code: ${meta.claudeVersion}`,
    `- Proyek: ${meta.projectId}, commit template ${meta.templateCommit}`,
    `- conventions: ${meta.conventionsChars} karakter utuh, ${meta.selectedChars} karakter terpilih (D: ${STAGE6_HEADINGS.join(', ')})`,
    `- Prompt: ${Object.entries(meta.promptChars)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')} karakter`,
    '',
    '| Run | Exit | Token input (baru/cache tulis/cache baca) | Token output | Biaya USD | Durasi dtk | Output byte | Karakter/token output | Thinking (blok/karakter) | Teks pertama dtk | Validator | Baris konvensi tersalin |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const u = r.usage;
    const s = r.stream;
    const v = r.validation;
    out.push(
      [
        r.id,
        r.timedOut ? 'timeout' : r.exitCode,
        u ? `${r.inputTokens} (${u.input}/${u.cacheCreation}/${u.cacheRead})` : '-',
        fmt(r.outputTokens),
        fmt(r.costUsd, 4),
        fmt(r.wallMs / 1000, 1),
        fmt(r.resultBytes),
        fmt(r.charsPerOutputToken, 2),
        s ? `${s.thinkingBlocks}/${s.thinkingChars}` : '(json)',
        s ? fmt((s.firstTextMs ?? Number.NaN) / 1000, 1) : '-',
        v
          ? v.errors.length
            ? `GAGAL: ${v.errors.join('; ')}`
            : `lolos (${v.warnings.length} peringatan)`
          : '-',
        r.copiedConventionLines ?? '-',
      ]
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }
  out.push(
    '',
    '## Kualitas PRD (tahap 6)',
    '',
    `Fitur yang harus punya FR: ${meta.features ?? '-'}. Keputusan: ${meta.decisionCodes ?? '-'}.`,
    '',
    '| Run | FR | Acceptance criteria | Endpoint | Byte bagian 3/4/5/6 | Fitur tanpa FR | Keputusan tidak dirujuk | Tabel tidak disebut di API/FR |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const r of rows.filter((row) => row.quality)) {
    const q = r.quality;
    const b = q.sectionBytes;
    out.push(
      `| ${r.id} | ${q.frCount} | ${q.acceptanceCriteria} | ${q.endpoints} | ${b['3']}/${b['4']}/${b['5']}/${b['6']} | ${q.featuresWithoutFr.join(', ') || '-'} | ${q.decisionsNotReferenced.length}: ${q.decisionsNotReferenced.join(', ') || '-'} | ${q.tablesUnused.length}/${q.tables}: ${q.tablesUnused.join(', ') || '-'} |`,
    );
  }
  out.push('', '## Init stream dan error', '');
  for (const r of rows) {
    const parts = [];
    if (r.init) {
      parts.push(
        `model ${r.init.model}, tools ${JSON.stringify(r.init.tools)}, mcp ${JSON.stringify(r.init.mcpServers)}, slash ${r.init.slashCommands}, skills ${r.init.skills}, plugins ${r.init.plugins}`,
      );
    }
    if (r.modelUsage) parts.push(`modelUsage ${r.modelUsage.join(', ')}`);
    if (r.stream) {
      parts.push(
        `stream ${r.stream.lines} baris, ${r.stream.textDeltas} text_delta, event result di ${fmt(r.stream.resultEventMs / 1000, 1)} dtk, usage ${r.stream.finalHasUsage}, total_cost_usd ${r.stream.finalHasCost}`,
      );
    }
    if (r.error) parts.push(`ERROR: ${r.error.replaceAll('\n', ' ').slice(0, 400)}`);
    out.push(`- **${r.id}**: ${parts.join('; ')}`);
  }
  return `${out.join('\n')}\n`;
}

// --- main ------------------------------------------------------------------------------------
// TEMPLATE_DIR dari .env, sama dengan aplikasi.
if (existsSync('.env')) process.loadEnvFile('.env');
const built = await buildPrompts();
const prompts = { ...built.prompts, probe: PROBE_PROMPT };
mkdirSync(join(RESULTS, 'prompts'), { recursive: true });
for (const [name, text] of Object.entries(built.prompts)) {
  writeFileSync(join(RESULTS, 'prompts', `${name}.txt`), text);
}

// Tanpa --only: 12 run pertama; run tambahan (E, F) hanya lewat --only.
const selected = RUNS.filter((run) => (only ? only.includes(run.id) : !run.extra));
if (selected.length === 0) throw new Error(`--only tidak cocok dengan run mana pun: ${only}`);

if (dryRun) {
  console.log(`Proyek ${built.projectId}, commit template ${built.templateCommit}`);
  for (const [name, text] of Object.entries(built.prompts)) {
    console.log(`prompt ${name}: ${text.length} karakter`);
  }
  for (const run of selected) {
    const config = CONFIGS[run.config];
    console.log(`\n[${run.id}] ${commandLine(config)}`);
    if (Object.keys(config.env).length) console.log(`  env: ${JSON.stringify(config.env)}`);
    console.log(`  prompt: ${run.prompt} (${prompts[run.prompt].length} karakter, lewat stdin)`);
  }
  rmSync(settingsDir, { recursive: true, force: true });
  process.exit(0);
}

const resultsPath = join(RESULTS, 'results.json');
const saved = existsSync(resultsPath)
  ? JSON.parse(readFileSync(resultsPath, 'utf8'))
  : { runs: {} };
const quality = {
  features: built.features.map((f) => f.id).join(', '),
  decisionCodes: built.decisionCodes.join(', '),
};

// --rescore: hitung ulang validator dan kualitas dari output tersimpan, tanpa memanggil claude.
if (rescore) {
  for (const run of RUNS) {
    const record = saved.runs[run.id];
    const file = join(RESULTS, `${run.id}.txt`);
    if (!record || !run.stage || !existsSync(file)) continue;
    const result = readFileSync(file, 'utf8');
    record.validation = validate(run.stage, result);
    scoreStage6(record, run, result, built.conventions);
  }
  saved.meta = { ...saved.meta, ...quality };
  writeFileSync(resultsPath, JSON.stringify(saved, null, 2));
  writeFileSync(join(RESULTS, 'summary.md'), summaryMarkdown(saved.meta, saved.runs));
  console.log(`Dihitung ulang. Ringkasan: ${join(RESULTS, 'summary.md')}`);
  process.exit(0);
}

const version = spawnSync(`${command} --version`, { shell: true, encoding: 'utf8' });
const meta = {
  ...quality,
  claudeVersion: (version.stdout || version.stderr || '').trim(),
  projectId: built.projectId,
  templateCommit: built.templateCommit,
  conventionsChars: built.conventionsChars,
  selectedChars: built.selectedChars,
  promptChars: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.length])),
};

console.log(
  `Claude Code ${meta.claudeVersion}; ${selected.length} pemanggilan. Perkiraan: lihat docs/logs/T-022.md.`,
);
let failed = 0;
for (const [index, run] of selected.entries()) {
  const config = CONFIGS[run.config];
  const prompt = prompts[run.prompt];
  const started = new Date().toLocaleTimeString();
  process.stdout.write(`[${index + 1}/${selected.length}] ${run.id} (mulai ${started}) ... `);
  const raw = await invoke(config, prompt);
  const { record, result, envelope } = summarize(run, config, prompt, raw, built.conventions);
  if (result !== null) writeFileSync(join(RESULTS, `${run.id}.txt`), result);
  if (raw.lines.length && config.args.includes('stream-json')) {
    writeFileSync(join(RESULTS, `${run.id}.ndjson`), raw.lines.map(([, l]) => l).join('\n'));
  } else if (envelope) {
    const { result: _omit, ...rest } = envelope;
    writeFileSync(join(RESULTS, `${run.id}.envelope.json`), JSON.stringify(rest, null, 2));
  }
  saved.runs[run.id] = record;
  saved.meta = meta;
  writeFileSync(resultsPath, JSON.stringify(saved, null, 2));
  writeFileSync(join(RESULTS, 'summary.md'), summaryMarkdown(meta, saved.runs));
  console.log(
    record.error
      ? `GAGAL (${record.error.split('\n')[0].slice(0, 160)})`
      : `${fmt(record.wallMs / 1000, 1)} dtk, in ${record.inputTokens}, out ${record.outputTokens}, $${fmt(record.costUsd, 4)}${record.validation ? `, validator ${record.validation.errors.length ? 'GAGAL' : 'lolos'}` : ''}`,
  );
  if (record.error) {
    failed++;
    console.log(record.error.split('\n').slice(0, 5).join('\n'));
    // Probe yang gagal (misalnya flag tidak dikenal) membuat konfigurasi C dan D ikut gagal;
    // berhenti sebelum memakai kuota untuk tahap 2 dan 6.
    if (run.prompt === 'probe') {
      console.log('\nProbe gagal; pemanggilan berikutnya dibatalkan. Kirim output ini ke agent.');
      break;
    }
  }
}
rmSync(settingsDir, { recursive: true, force: true });
console.log(`\nSelesai, ${failed} gagal. Ringkasan: ${join(RESULTS, 'summary.md')}`);
if (failed > 0) process.exitCode = 1;
