#!/usr/bin/env node
// Pengganti perintah `claude` untuk integration test runner CLI. Tidak pernah memanggil Claude.
// Perilaku diatur lewat variabel lingkungan:
//
//   FAKE_CLAUDE_MODE  ok (bawaan) | exit | bad-json | bad-envelope | is-error | hang
//   FAKE_CLAUDE_PID_FILE  bila diisi, pid proses ini ditulis ke file itu (untuk memeriksa kill)
//
// Mode `ok` mengembalikan envelope yang `result`-nya JSON berisi yang diterima script: argumen,
// isi stdin, cwd, dan isi folder cwd. Dengan begitu test bisa memeriksa cara runner memanggilnya.
import { readdirSync, writeFileSync } from 'node:fs';

const mode = process.env.FAKE_CLAUDE_MODE ?? 'ok';
if (process.env.FAKE_CLAUDE_PID_FILE) {
  writeFileSync(process.env.FAKE_CLAUDE_PID_FILE, String(process.pid));
}

const usage = {
  input_tokens: 3,
  cache_creation_input_tokens: 100,
  cache_read_input_tokens: 1000,
  output_tokens: 42,
};

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});
process.stdin.on('end', () => {
  const received = {
    argv: process.argv.slice(2),
    stdin,
    cwd: process.cwd(),
    cwdEntries: readdirSync(process.cwd()),
  };
  switch (mode) {
    case 'exit':
      process.stderr.write('Error: kuota habis (palsu)\n');
      process.exit(3);
      break;
    case 'bad-json':
      process.stdout.write('ini bukan JSON');
      break;
    case 'bad-envelope':
      process.stdout.write(JSON.stringify({ is_error: false, result: 'tanpa usage' }));
      break;
    case 'is-error':
      process.stdout.write(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: true,
          result: 'Invalid API key · Please run /login',
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      );
      break;
    case 'hang':
      setInterval(() => {}, 1000);
      break;
    default:
      process.stdout.write(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          duration_ms: 1234,
          num_turns: 1,
          result: JSON.stringify(received),
          session_id: 'fake',
          total_cost_usd: 0.0123,
          usage,
        }),
      );
  }
});
