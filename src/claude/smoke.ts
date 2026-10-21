// Verifikasi manual T-004 dan T-023: satu pemanggilan `claude` sungguhan dengan prompt kecil lewat
// CliClaudeRunner (bentuk perintah stream dari spike T-022), lalu menampilkan hasil, jumlah potongan
// stream, token, perkiraan biaya, dan durasi. Model dari `CLAUDE_MODEL` (env atau `.env`, bawaan
// sonnet). Memakai kuota langganan; tidak pernah dijalankan oleh test.
//
//   pnpm claude:smoke
//   pnpm claude:smoke --command "node <path absolut>/test/helpers/fake-claude-cli.mjs"
//     (tanpa kuota, untuk menguji script ini; path harus absolut karena claude berjalan di folder
//     sementara)
//
// Dijalankan langsung oleh Node 24 (type stripping), jadi import relatif memakai `.ts`.
import { existsSync } from 'node:fs';
import { claudeModel } from '../core/config/claude.ts';
import { CliClaudeRunner } from './cli-runner.ts';
import { envelopeResult } from './envelope.ts';
import { ClaudeRunError } from './types.ts';

const PROMPT = `Balas HANYA dengan JSON berikut, tanpa teks lain dan tanpa code fence:
{"ok": true, "pesan": "halo dari Claude Code"}
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.`;

const commandIndex = process.argv.indexOf('--command');
const command = commandIndex === -1 ? undefined : process.argv[commandIndex + 1];
// CLAUDE_MODEL dari .env, sama dengan aplikasi; variabel lingkungan proses tetap menang.
if (existsSync('.env')) process.loadEnvFile('.env');
const model = claudeModel();

console.log(
  `Perintah: ${command ?? 'claude'}, model ${model} (prompt lewat stdin, ${PROMPT.length} karakter)`,
);
console.log('Menunggu Claude Code...\n');

try {
  let chunks = 0;
  let firstChunkMs: number | null = null;
  const started = performance.now();
  const result = await new CliClaudeRunner({ command, model, timeoutMs: 3 * 60_000 }).run(PROMPT, {
    onProgress: (progress) => {
      if (progress.kind !== 'text') return;
      chunks++;
      firstChunkMs ??= performance.now() - started;
    },
  });
  let ok = false;
  try {
    ok = JSON.parse(result.result).ok === true;
  } catch {}
  console.log(`result      : ${result.result.trim()}`);
  console.log(`token input : ${result.inputTokens} (termasuk cache)`);
  console.log(`token output: ${result.outputTokens}`);
  console.log(`biaya (USD) : ${result.costUsd ?? '-'} (perkiraan dari envelope)`);
  console.log(`durasi      : ${(result.durationMs / 1000).toFixed(1)} dtk`);
  console.log(
    `stream      : ${chunks} potongan teks, pertama di ${firstChunkMs === null ? '-' : `${(firstChunkMs / 1000).toFixed(1)} dtk`}`,
  );
  console.log(
    ok
      ? '\nBERHASIL: Claude Code menjawab JSON yang diminta.'
      : '\nPERINGATAN: pemanggilan berhasil, tetapi result bukan JSON {"ok": true}.',
  );
  if (!ok) process.exitCode = 1;
} catch (error) {
  if (!(error instanceof ClaudeRunError)) throw error;
  console.error(`GAGAL [${error.code}]: ${error.message}`);
  if (error.details.stderr) console.error(`stderr: ${error.details.stderr.trim()}`);
  // Pesan error hanya memuat cuplikan; tampilkan `result` dari envelope secara utuh bila ada.
  const result = envelopeResult(error.details.stdout ?? '');
  if (result !== null) console.error(`result (utuh dari envelope):\n${result}`);
  process.exitCode = 1;
}
