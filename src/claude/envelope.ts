// Membaca envelope `claude -p --output-format json`. Dipakai runner CLI dan runner palsu, sehingga
// fixture melewati jalur parsing yang sama dengan output sungguhan.
import { z } from 'zod';
import { type ClaudeResult, ClaudeRunError } from './types.ts';

const tokenCount = z.number().int().nonnegative();

const envelopeSchema = z.object({
  is_error: z.boolean(),
  subtype: z.string().optional(),
  result: z.string().optional(),
  total_cost_usd: z.number().nullable().optional(),
  usage: z.object({
    input_tokens: tokenCount,
    output_tokens: tokenCount,
    cache_creation_input_tokens: tokenCount.optional(),
    cache_read_input_tokens: tokenCount.optional(),
  }),
});

const excerpt = (text: string, max = 300) => {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
};

/**
 * Isi `result` dari stdout yang berupa envelope, tanpa memeriksa bagian lain; `null` bila stdout
 * bukan JSON atau tidak punya `result` berupa teks. Dipakai untuk menampilkan pesan error utuh
 * (misalnya di `pnpm claude:smoke`), karena pesan `ClaudeRunError` hanya memuat cuplikannya.
 */
export function envelopeResult(stdout: string): string | null {
  try {
    const json: unknown = JSON.parse(stdout);
    if (typeof json === 'object' && json !== null && 'result' in json) {
      return typeof json.result === 'string' ? json.result : null;
    }
  } catch {}
  return null;
}

export function parseEnvelope(stdout: string, durationMs: number): ClaudeResult {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new ClaudeRunError(
      'INVALID_ENVELOPE',
      `Output Claude Code bukan JSON yang valid: ${excerpt(stdout) || '(kosong)'}`,
      { stdout, durationMs },
    );
  }

  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ClaudeRunError(
      'INVALID_ENVELOPE',
      `Envelope Claude Code tidak sesuai format (${issues.join('; ')}).`,
      { stdout, durationMs },
    );
  }

  const envelope = parsed.data;
  if (envelope.is_error) {
    const reason = envelope.result
      ? excerpt(envelope.result)
      : (envelope.subtype ?? 'tanpa keterangan');
    throw new ClaudeRunError('IS_ERROR', `Claude Code melaporkan error: ${reason}`, {
      stdout,
      durationMs,
    });
  }
  if (envelope.result === undefined) {
    throw new ClaudeRunError('INVALID_ENVELOPE', 'Envelope Claude Code tidak berisi `result`.', {
      stdout,
      durationMs,
    });
  }

  const { usage } = envelope;
  return {
    result: envelope.result,
    inputTokens:
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
    costUsd: envelope.total_cost_usd ?? null,
    durationMs,
    rawEnvelope: stdout,
  };
}
