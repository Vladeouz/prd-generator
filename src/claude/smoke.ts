// Verifikasi manual T-004: satu pemanggilan `claude` sungguhan dengan prompt kecil lewat
// CliClaudeRunner, lalu menampilkan hasil, token, perkiraan biaya, dan durasi. Memakai kuota
// langganan; tidak pernah dijalankan oleh test.
//
//   pnpm claude:smoke
//   pnpm claude:smoke --command "node <path absolut>/test/helpers/fake-claude-cli.mjs"
//     (tanpa kuota, untuk menguji script ini; path harus absolut karena claude berjalan di folder
//     sementara)
//
// Dijalankan langsung oleh Node 24 (type stripping), jadi import relatif memakai `.ts`.
import { CliClaudeRunner } from './cli-runner.ts';
import { ClaudeRunError } from './types.ts';

const PROMPT = `Balas HANYA dengan JSON berikut, tanpa teks lain dan tanpa code fence:
{"ok": true, "pesan": "halo dari Claude Code"}
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.`;

const commandIndex = process.argv.indexOf('--command');
const command = commandIndex === -1 ? undefined : process.argv[commandIndex + 1];

console.log(`Perintah: ${command ?? 'claude'} (prompt lewat stdin, ${PROMPT.length} karakter)`);
console.log('Menunggu Claude Code...\n');

try {
  const result = await new CliClaudeRunner({ command, timeoutMs: 3 * 60_000 }).run(PROMPT);
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
    ok
      ? '\nBERHASIL: Claude Code menjawab JSON yang diminta.'
      : '\nPERINGATAN: pemanggilan berhasil, tetapi result bukan JSON {"ok": true}.',
  );
  if (!ok) process.exitCode = 1;
} catch (error) {
  if (!(error instanceof ClaudeRunError)) throw error;
  console.error(`GAGAL [${error.code}]: ${error.message}`);
  if (error.details.stderr) console.error(`stderr: ${error.details.stderr.trim()}`);
  process.exitCode = 1;
}
