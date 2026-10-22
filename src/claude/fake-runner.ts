// Runner palsu untuk test dan end-to-end (D-07): tidak pernah menjalankan proses. Respons diambil
// berurutan dari antrean; fixture di test/fixtures/claude/ adalah envelope nyata yang dibaca lewat
// parser yang sama dengan runner CLI. Bila `onProgress` diberikan, `result` dikirim dulu sebagai
// potongan teks bertahap, seperti stream runner CLI.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseEnvelope } from './envelope.ts';
import {
  type ClaudeResult,
  ClaudeRunError,
  type ClaudeRunner,
  type ClaudeRunOptions,
} from './types.ts';

export const CLAUDE_FIXTURES_DIR = join(process.cwd(), 'test', 'fixtures', 'claude');

/** Envelope fixture `<nama>.json` sebagai hasil pemanggilan; durasi dari `duration_ms`-nya. */
export function loadClaudeFixture(name: string): ClaudeResult {
  const raw = readFileSync(join(CLAUDE_FIXTURES_DIR, `${name}.json`), 'utf8');
  const { duration_ms: durationMs } = JSON.parse(raw) as { duration_ms?: number };
  return parseEnvelope(raw, durationMs ?? 0);
}

export type FakeResponse =
  | ClaudeResult
  | ClaudeRunError
  | ((prompt: string) => ClaudeResult | ClaudeRunError);

export type FakeRunnerOptions = {
  /** Ukuran potongan teks untuk `onProgress` (bawaan 2000 karakter). */
  chunkSize?: number;
  /** Jeda sebelum setiap potongan (bawaan 0). */
  chunkDelayMs?: number;
};

export class FakeClaudeRunner implements ClaudeRunner {
  /** Prompt yang diterima, berurutan. */
  readonly prompts: string[] = [];
  /** Model dan effort yang diminta per pemanggilan, berurutan (sejajar dengan `prompts`). */
  readonly calls: { model: string | undefined; effort: string | undefined }[] = [];
  private readonly queue: FakeResponse[];
  private readonly chunkSize: number;
  private readonly chunkDelayMs: number;

  constructor(responses: FakeResponse[], options: FakeRunnerOptions = {}) {
    this.queue = [...responses];
    this.chunkSize = options.chunkSize ?? 2000;
    this.chunkDelayMs = options.chunkDelayMs ?? 0;
  }

  async run(prompt: string, options: ClaudeRunOptions = {}): Promise<ClaudeResult> {
    this.prompts.push(prompt);
    this.calls.push({ model: options.model, effort: options.effort });
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error(
        `FakeClaudeRunner: tidak ada respons untuk pemanggilan ke-${this.prompts.length}.`,
      );
    }
    const response = typeof next === 'function' ? next(prompt) : next;
    if (response instanceof ClaudeRunError) throw response;
    if (options.onProgress) {
      for (let at = 0; at < response.result.length; at += this.chunkSize) {
        if (this.chunkDelayMs > 0) await sleep(this.chunkDelayMs);
        const text = response.result.slice(at, at + this.chunkSize);
        // Sama dengan runner CLI: error di callback progres diabaikan.
        try {
          options.onProgress({ kind: 'text', text, chars: at + text.length });
        } catch {}
      }
    }
    return response;
  }
}
