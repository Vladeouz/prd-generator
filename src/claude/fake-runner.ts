// Runner palsu untuk test dan end-to-end (D-07): tidak pernah menjalankan proses. Respons diambil
// berurutan dari antrean; fixture di test/fixtures/claude/ adalah envelope nyata yang dibaca lewat
// parser yang sama dengan runner CLI.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnvelope } from './envelope.ts';
import { type ClaudeResult, ClaudeRunError, type ClaudeRunner } from './types.ts';

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

export class FakeClaudeRunner implements ClaudeRunner {
  /** Prompt yang diterima, berurutan. */
  readonly prompts: string[] = [];
  private readonly queue: FakeResponse[];

  constructor(responses: FakeResponse[]) {
    this.queue = [...responses];
  }

  async run(prompt: string): Promise<ClaudeResult> {
    this.prompts.push(prompt);
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error(
        `FakeClaudeRunner: tidak ada respons untuk pemanggilan ke-${this.prompts.length}.`,
      );
    }
    const response = typeof next === 'function' ? next(prompt) : next;
    if (response instanceof ClaudeRunError) throw response;
    return response;
  }
}
