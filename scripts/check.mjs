// Satu perintah verifikasi (PRD bagian 3, Konvensi): menjalankan semua langkah berurutan, lalu
// menampilkan ringkasan.
//
//   node scripts/check.mjs   (pnpm check)
//
// Langkah yang gagal tidak menghentikan langkah berikutnya; semua hasil dilaporkan di ringkasan dan
// exit code bukan 0 bila ada satu saja yang gagal. Langkah baru (misalnya end-to-end)
// ditambahkan ke STEPS.
//
// Output setiap langkah tampil di terminal sekaligus ditampung; output lengkap langkah yang gagal
// ditulis ke `.check-logs/<waktu run>/<no>-<langkah>.log` (di-ignore Git) agar kegagalan yang tidak
// selalu terulang bisa didiagnosis. Karena output dialirkan lewat pipe, tool tidak menampilkan warna.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Tanpa `:` agar valid sebagai nama folder di Windows, misalnya `2026-10-04T14-05-09Z`.
const LOG_DIR = join(
  ROOT,
  '.check-logs',
  `${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}Z`,
);

const STEPS = [
  { name: 'Biome', command: 'pnpm lint', cwd: ROOT },
  { name: 'Typecheck', command: 'pnpm typecheck', cwd: ROOT },
  { name: 'Unit test', command: 'pnpm test:unit', cwd: ROOT },
  { name: 'Integration test', command: 'pnpm test:int', cwd: ROOT },
];

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} dtk` : `${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`;
}

const fromRoot = (path) => relative(ROOT, path).split(sep).join('/');

/** Menjalankan perintah; output diteruskan ke terminal sekaligus ditampung. */
function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const chunks = [];
    // `2>&1` (berlaku di cmd.exe dan sh) menggabungkan stderr ke stdout dalam satu pipe, sehingga
    // urutan baris di log sama dengan di terminal.
    const child = spawn(`${command} 2>&1`, {
      cwd,
      shell: true,
      stdio: ['inherit', 'pipe', 'inherit'],
    });
    child.stdout.on('data', (chunk) => {
      chunks.push(chunk);
      process.stdout.write(chunk);
    });
    child.on('error', (error) => resolve({ exit: error.message, output: Buffer.concat(chunks) }));
    child.on('close', (code, signal) =>
      resolve({ exit: code ?? signal ?? 'tanpa kode', output: Buffer.concat(chunks) }),
    );
  });
}

function writeFailureLog(step, index, { startedAt, durationMs, exit, output }) {
  mkdirSync(LOG_DIR, { recursive: true });
  const slug = step.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
  const file = join(LOG_DIR, `${index + 1}-${slug}.log`);
  const header = [
    `Langkah: ${step.name}`,
    `Perintah: ${step.command}`,
    `Folder: ${fromRoot(step.cwd) || '.'}`,
    `Mulai: ${startedAt.toISOString()}`,
    `Durasi: ${formatDuration(durationMs)}`,
    `Exit: ${exit}`,
    '',
    '',
  ].join('\n');
  writeFileSync(file, Buffer.concat([Buffer.from(header), output]));
  return fromRoot(file);
}

async function runStep(step, index) {
  console.log(`\n=== [${index + 1}/${STEPS.length}] ${step.name}: ${step.command}\n`);
  const startedAt = new Date();
  const started = performance.now();
  const { exit, output } = await runCommand(step.command, step.cwd);
  const durationMs = performance.now() - started;
  const ok = exit === 0;
  const logFile = ok ? '' : writeFailureLog(step, index, { startedAt, durationMs, exit, output });
  return {
    ...step,
    ok,
    durationMs,
    detail: ok ? '' : [`exit ${exit}`, step.hint?.(), logFile].filter(Boolean).join('; '),
  };
}

const startedAt = performance.now();
const results = [];
for (const [index, step] of STEPS.entries()) {
  results.push(await runStep(step, index));
}
const totalMs = performance.now() - startedAt;

const rows = results.map((result) => [
  result.name,
  result.ok ? 'OK' : 'GAGAL',
  formatDuration(result.durationMs),
  result.detail,
]);
const headers = ['Langkah', 'Status', 'Waktu', 'Keterangan'];
const widths = headers.map((header, i) =>
  Math.max(header.length, ...rows.map((cells) => cells[i].length)),
);
const formatRow = (cells) =>
  cells
    .map((cell, i) => cell.padEnd(widths[i]))
    .join('  ')
    .trimEnd();

console.log('\npnpm check: ringkasan\n');
console.log(formatRow(headers));
console.log(widths.map((width) => '-'.repeat(width)).join('  '));
for (const cells of rows) console.log(formatRow(cells));

const failed = results.filter((result) => !result.ok);
console.log(`\nTotal waktu: ${formatDuration(totalMs)}`);
if (failed.length > 0) {
  console.log(
    `${failed.length} dari ${results.length} langkah gagal. Output lengkap: ${fromRoot(LOG_DIR)}/`,
  );
  process.exitCode = 1;
} else {
  console.log(`Semua ${results.length} langkah OK.`);
}
