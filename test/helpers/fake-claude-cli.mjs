#!/usr/bin/env node
// Pengganti perintah `claude` untuk integration test runner CLI. Tidak pernah memanggil Claude.
// `--version` mencetak versi palsu lalu keluar. Selain itu, perilaku diatur lewat variabel lingkungan:
//
//   FAKE_CLAUDE_MODE  ok (bawaan) | exit | bad-json | bad-envelope | no-result | is-error | hang |
//                     fixture | flow
//   FAKE_CLAUDE_FIXTURE  untuk mode fixture: path envelope (misalnya test/fixtures/claude/stage2.json)
//   FAKE_CLAUDE_DELAY_MS  untuk mode fixture dan flow: jeda sebelum mencetak (meniru durasi pemanggilan)
//   FAKE_CLAUDE_CHUNK_SIZE  ukuran potongan teks di stream (bawaan 2000 karakter)
//   FAKE_CLAUDE_CHUNK_DELAY_MS  jeda antar potongan teks (bawaan 0)
//   FAKE_CLAUDE_PID_FILE  bila diisi, pid proses ini ditulis ke file itu (untuk memeriksa kill)
//
// Output meniru `claude -p --output-format stream-json --verbose --include-partial-messages`
// (spike T-022): event `system`/`init`, satu `system`/`thinking_tokens`, potongan teks sebagai
// `stream_event` `text_delta`, lalu event `result` berisi envelope (dari fixture atau buatan).
//
// Mode `flow` memilih fixture gym (sama dengan GYM_FIXTURES di test/helpers/stage-flow.ts) dari
// nama tahap di baris pertama prompt (`Kamu adalah tahap "…"`), sehingga satu proyek bisa dijalankan
// dari tahap 2 sampai 7 lewat UI tanpa kuota. Satu tahap bisa dibuat gagal validasi sekali
// (FAKE_CLAUDE_INVALID_ONCE, lihat flowResponse di fake-claude-flow.mjs).
//
// Mode `ok` mengembalikan envelope yang `result`-nya JSON berisi yang diterima script: argumen,
// isi stdin, cwd, dan isi folder cwd. Dengan begitu test bisa memeriksa cara runner memanggilnya.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { flowResponse } from './fake-claude-flow.mjs';

if (process.argv.includes('--version')) {
  process.stdout.write('9.9.9 (Claude Code palsu)\n');
  process.exit(0);
}

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

const line = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

/** Mencetak envelope sebagai stream: init, thinking, potongan teks `result`, lalu event result. */
async function stream(envelope, { withResult = true } = {}) {
  const size = Number(process.env.FAKE_CLAUDE_CHUNK_SIZE ?? 2000);
  const delayMs = Number(process.env.FAKE_CLAUDE_CHUNK_DELAY_MS ?? 0);
  line({ type: 'system', subtype: 'init', model: 'claude-palsu', tools: [], mcp_servers: [] });
  line({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 50 });
  const text = typeof envelope.result === 'string' ? envelope.result : '';
  for (let at = 0; at < text.length; at += size) {
    if (delayMs > 0) await sleep(delayMs);
    line({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: text.slice(at, at + size) },
      },
    });
  }
  if (withResult) line({ type: 'result', ...envelope });
}

let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdin += chunk;
});
process.stdin.on('end', async () => {
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
      await stream({ is_error: false, result: 'tanpa usage' });
      break;
    case 'no-result':
      await stream({ result: 'teks tanpa event result' }, { withResult: false });
      break;
    case 'is-error':
      await stream({
        subtype: 'success',
        is_error: true,
        result: 'Invalid API key · Please run /login',
        usage: { input_tokens: 0, output_tokens: 0 },
      });
      break;
    case 'fixture':
      await sleep(Number(process.env.FAKE_CLAUDE_DELAY_MS ?? 0));
      await stream(JSON.parse(readFileSync(process.env.FAKE_CLAUDE_FIXTURE ?? '', 'utf8')));
      break;
    case 'flow': {
      const response = flowResponse(stdin, process.env);
      if (!response) {
        process.stderr.write('Tahap tidak dikenali dari prompt (runner palsu mode flow)\n');
        process.exit(4);
      }
      await sleep(response.delayMs);
      await stream(JSON.parse(readFileSync(response.file, 'utf8')));
      break;
    }
    case 'hang':
      setInterval(() => {}, 1000);
      break;
    default:
      await stream({
        subtype: 'success',
        is_error: false,
        duration_ms: 1234,
        num_turns: 1,
        result: JSON.stringify(received),
        session_id: 'fake',
        total_cost_usd: 0.0123,
        usage,
      });
  }
});
