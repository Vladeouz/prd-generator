import { describe, expect, it } from 'vitest';
import { StreamReader } from '../../../src/claude/stream.ts';
import type { ClaudeProgress } from '../../../src/claude/types.ts';
import { ClaudeRunError } from '../../../src/claude/types.ts';

const usage = {
  input_tokens: 2,
  cache_creation_input_tokens: 24_721,
  cache_read_input_tokens: 0,
  output_tokens: 60_932,
};

// Bentuk event dari output nyata spike T-022 (spikes/claude-efficiency/results/s6-D.ndjson).
const init = { type: 'system', subtype: 'init', model: 'claude-sonnet-5-5', tools: [] };
const thinking = (n: number) => ({
  type: 'system',
  subtype: 'thinking_tokens',
  estimated_tokens: n,
  estimated_tokens_delta: 50,
});
const delta = (text: string) => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } },
});
const result = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: '# PRD\nisi',
  total_cost_usd: 0.7082,
  usage,
};
const lines = (...events: unknown[]) => events.map((e) => `${JSON.stringify(e)}\n`).join('');

function errorOf(fn: () => unknown): ClaudeRunError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ClaudeRunError) return error;
    throw error;
  }
  throw new Error('tidak melempar error');
}

describe('StreamReader', () => {
  it('meneruskan thinking dan potongan teks berurutan, lalu membaca event result', () => {
    const progress: ClaudeProgress[] = [];
    const reader = new StreamReader((p) => progress.push(p));
    const stdout = lines(init, thinking(50), thinking(200), delta('# PRD\n'), delta('isi'), result);
    reader.push(stdout);

    expect(progress).toEqual([
      { kind: 'thinking', estimatedTokens: 50 },
      { kind: 'thinking', estimatedTokens: 200 },
      { kind: 'text', text: '# PRD\n', chars: 6 },
      { kind: 'text', text: 'isi', chars: 9 },
    ]);
    expect(reader.receivedChars).toBe(9);
    expect(reader.finish(stdout, 393_200)).toEqual({
      result: '# PRD\nisi',
      inputTokens: 24_723,
      outputTokens: 60_932,
      costUsd: 0.7082,
      durationMs: 393_200,
      rawEnvelope: JSON.stringify(result),
    });
  });

  it('baris yang terpotong di tengah potongan stdout tetap terbaca utuh', () => {
    const progress: ClaudeProgress[] = [];
    const reader = new StreamReader((p) => progress.push(p));
    const stdout = lines(delta('halo ✓'), result);
    for (const char of stdout) reader.push(char);
    expect(progress).toEqual([{ kind: 'text', text: 'halo ✓', chars: 6 }]);
    expect(reader.finish(stdout, 1).result).toBe('# PRD\nisi');
  });

  it('baris result terakhir tanpa newline tetap dibaca', () => {
    const reader = new StreamReader();
    const stdout = `${lines(delta('x'))}${JSON.stringify(result)}`;
    reader.push(stdout);
    expect(reader.finish(stdout, 1).outputTokens).toBe(60_932);
  });

  it('mengabaikan baris bukan JSON dan event lain', () => {
    const progress: ClaudeProgress[] = [];
    const reader = new StreamReader((p) => progress.push(p));
    const other = {
      type: 'stream_event',
      event: { type: 'content_block_start', content_block: { type: 'thinking' } },
    };
    const stdout = `peringatan bukan JSON\n${lines(other, { type: 'assistant' }, 'teks', result)}`;
    reader.push(stdout);
    expect(progress).toEqual([]);
    expect(reader.finish(stdout, 1).result).toBe('# PRD\nisi');
  });

  it('error di callback progres tidak menggagalkan pembacaan', () => {
    const reader = new StreamReader(() => {
      throw new Error('UI rusak');
    });
    const stdout = lines(delta('a'), result);
    reader.push(stdout);
    expect(reader.finish(stdout, 1).result).toBe('# PRD\nisi');
  });

  it('tanpa event result → INVALID_ENVELOPE dengan cuplikan stdout', () => {
    const reader = new StreamReader();
    const stdout = lines(init, delta('teks'));
    reader.push(stdout);
    const error = errorOf(() => reader.finish(stdout, 5));
    expect(error.code).toBe('INVALID_ENVELOPE');
    expect(error.message).toContain('tidak berisi event result');
    expect(error.details).toMatchObject({ stdout, durationMs: 5 });
  });

  it('stdout kosong → INVALID_ENVELOPE dengan keterangan kosong', () => {
    expect(errorOf(() => new StreamReader().finish('', 1)).message).toContain('(kosong)');
  });

  it('event result is_error → IS_ERROR, detail berisi seluruh stream', () => {
    const reader = new StreamReader();
    const stdout = lines(init, {
      type: 'result',
      is_error: true,
      result: 'Invalid API key · Please run /login',
      usage,
    });
    reader.push(stdout);
    const error = errorOf(() => reader.finish(stdout, 1));
    expect(error.code).toBe('IS_ERROR');
    expect(error.message).toContain('Please run /login');
    expect(error.details.stdout).toBe(stdout);
  });

  it('event result tanpa usage → INVALID_ENVELOPE', () => {
    const reader = new StreamReader();
    const stdout = lines({ type: 'result', is_error: false, result: 'x' });
    reader.push(stdout);
    expect(errorOf(() => reader.finish(stdout, 1)).code).toBe('INVALID_ENVELOPE');
  });
});
