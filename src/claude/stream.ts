// Membaca stdout `claude -p --output-format stream-json --verbose --include-partial-messages`
// baris demi baris (D-12, spike T-022):
// - `stream_event` dengan `content_block_delta`/`text_delta` adalah potongan teks jawaban;
// - `system`/`thinking_tokens` (tidak terdokumentasi) berisi perkiraan token thinking selama model
//   berpikir, sebelum teks pertama keluar;
// - event terakhir `type: "result"` berbentuk sama dengan envelope `--output-format json` (`result`,
//   `usage`, `total_cost_usd`, `is_error`), sehingga dibaca `parseEnvelope`.
// Baris yang bukan JSON atau bertipe lain diabaikan.
import { parseEnvelope } from './envelope.ts';
import type { ClaudeProgress, ClaudeResult } from './types.ts';
import { ClaudeRunError } from './types.ts';

type StreamEvent = {
  type?: string;
  subtype?: string;
  estimated_tokens?: number;
  event?: { type?: string; delta?: { type?: string; text?: string } };
};

function parseLine(line: string): StreamEvent | null {
  try {
    const json: unknown = JSON.parse(line);
    return typeof json === 'object' && json !== null ? (json as StreamEvent) : null;
  } catch {
    return null;
  }
}

export class StreamReader {
  private pending = '';
  private chars = 0;
  private resultLine: string | null = null;
  private readonly onProgress: ((progress: ClaudeProgress) => void) | undefined;

  constructor(onProgress?: (progress: ClaudeProgress) => void) {
    this.onProgress = onProgress;
  }

  /** Potongan stdout apa adanya; baris yang belum lengkap disimpan sampai potongan berikutnya. */
  push(chunk: string) {
    this.pending += chunk;
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';
    for (const line of lines) this.handle(line);
  }

  /** Jumlah karakter teks jawaban yang sudah diterima. */
  get receivedChars() {
    return this.chars;
  }

  /** Hasil dari event `result`; melempar `ClaudeRunError` bila event itu tidak ada atau rusak. */
  finish(stdout: string, durationMs: number): ClaudeResult {
    if (this.pending.trim()) this.handle(this.pending);
    this.pending = '';
    if (this.resultLine === null) {
      const text = stdout.trim();
      throw new ClaudeRunError(
        'INVALID_ENVELOPE',
        `Output stream Claude Code tidak berisi event result: ${text.length > 300 ? `${text.slice(0, 300)}…` : text || '(kosong)'}`,
        { stdout, durationMs },
      );
    }
    try {
      return parseEnvelope(this.resultLine, durationMs);
    } catch (error) {
      // Detail error memuat seluruh stream, bukan hanya baris result, untuk keterlacakan.
      if (error instanceof ClaudeRunError) {
        throw new ClaudeRunError(error.code, error.message, { ...error.details, stdout });
      }
      throw error;
    }
  }

  private handle(line: string) {
    if (!line.trim()) return;
    const event = parseLine(line);
    if (!event) return;
    if (event.type === 'result') {
      this.resultLine = line;
      return;
    }
    if (event.type === 'system' && event.subtype === 'thinking_tokens') {
      if (typeof event.estimated_tokens === 'number') {
        this.emit({ kind: 'thinking', estimatedTokens: event.estimated_tokens });
      }
      return;
    }
    const delta = event.type === 'stream_event' ? event.event : undefined;
    if (delta?.type === 'content_block_delta' && delta.delta?.type === 'text_delta') {
      const text = delta.delta.text ?? '';
      this.chars += text.length;
      this.emit({ kind: 'text', text, chars: this.chars });
    }
  }

  private emit(progress: ClaudeProgress) {
    // Callback progres (UI) tidak boleh menggagalkan pemanggilan.
    try {
      this.onProgress?.(progress);
    } catch {}
  }
}
