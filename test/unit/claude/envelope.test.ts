import { describe, expect, it } from 'vitest';
import { envelopeResult, parseEnvelope } from '../../../src/claude/envelope.ts';
import { ClaudeRunError } from '../../../src/claude/types.ts';

const usage = {
  input_tokens: 2,
  cache_creation_input_tokens: 8112,
  cache_read_input_tokens: 16023,
  output_tokens: 1521,
};

function errorOf(fn: () => unknown): ClaudeRunError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ClaudeRunError) return error;
    throw error;
  }
  throw new Error('tidak melempar error');
}

describe('parseEnvelope', () => {
  it('membaca result, token (input termasuk cache), biaya, dan durasi', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '{"ok":true}',
      total_cost_usd: 0.0985,
      usage,
    });
    expect(parseEnvelope(stdout, 18959)).toEqual({
      result: '{"ok":true}',
      inputTokens: 2 + 8112 + 16023,
      outputTokens: 1521,
      costUsd: 0.0985,
      durationMs: 18959,
      rawEnvelope: stdout,
    });
  });

  it('biaya null bila total_cost_usd tidak ada, cache opsional', () => {
    const result = parseEnvelope(
      JSON.stringify({
        is_error: false,
        result: 'x',
        usage: { input_tokens: 5, output_tokens: 1 },
      }),
      1,
    );
    expect(result.costUsd).toBeNull();
    expect(result.inputTokens).toBe(5);
  });

  it('stdout bukan JSON → INVALID_ENVELOPE', () => {
    const error = errorOf(() => parseEnvelope('Error: sesuatu', 1));
    expect(error.code).toBe('INVALID_ENVELOPE');
    expect(error.message).toContain('Error: sesuatu');
  });

  it('stdout kosong → INVALID_ENVELOPE dengan keterangan kosong', () => {
    expect(errorOf(() => parseEnvelope('', 1)).message).toContain('(kosong)');
  });

  it('usage hilang → INVALID_ENVELOPE yang menyebut field-nya', () => {
    const error = errorOf(() => parseEnvelope(JSON.stringify({ is_error: false, result: 'x' }), 1));
    expect(error.code).toBe('INVALID_ENVELOPE');
    expect(error.message).toContain('usage');
  });

  it('result hilang padahal tidak error → INVALID_ENVELOPE', () => {
    const error = errorOf(() => parseEnvelope(JSON.stringify({ is_error: false, usage }), 1));
    expect(error.code).toBe('INVALID_ENVELOPE');
    expect(error.message).toContain('result');
  });

  it('is_error → IS_ERROR dengan pesan dari result', () => {
    const error = errorOf(() =>
      parseEnvelope(
        JSON.stringify({ is_error: true, result: 'Invalid API key · Please run /login', usage }),
        1,
      ),
    );
    expect(error.code).toBe('IS_ERROR');
    expect(error.message).toBe('Claude Code melaporkan error: Invalid API key · Please run /login');
  });

  it('is_error tanpa result → pesan memakai subtype', () => {
    const error = errorOf(() =>
      parseEnvelope(JSON.stringify({ is_error: true, subtype: 'error_max_turns', usage }), 1),
    );
    expect(error.message).toContain('error_max_turns');
  });
});

describe('envelopeResult', () => {
  it('mengembalikan result utuh, termasuk dari envelope is_error tanpa usage', () => {
    const long = 'x'.repeat(1000);
    expect(envelopeResult(JSON.stringify({ is_error: true, result: long }))).toBe(long);
  });

  it('null bila stdout bukan JSON atau tidak punya result berupa teks', () => {
    expect(envelopeResult('ini bukan JSON')).toBeNull();
    expect(envelopeResult('')).toBeNull();
    expect(envelopeResult('null')).toBeNull();
    expect(envelopeResult(JSON.stringify({ is_error: true, subtype: 'error' }))).toBeNull();
    expect(envelopeResult(JSON.stringify({ result: 42 }))).toBeNull();
  });
});
