// Port pemanggilan Claude Code. Aplikasi hanya bergantung pada `ClaudeRunner`; implementasinya
// `CliClaudeRunner` (perintah `claude` sungguhan) atau `FakeClaudeRunner` (fixture, untuk test).
//
// File di folder ini bisa dijalankan langsung oleh Node 24 (type stripping, lihat smoke.ts), jadi
// tidak boleh memakai sintaks TypeScript yang perlu ditransformasi (enum, parameter property).
import { brandedInstanceCheck } from '../core/errors.ts';

export type ClaudeResult = {
  /** Isi `result` dari envelope: teks jawaban model. */
  result: string;
  /** Token input termasuk cache (`input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`). */
  inputTokens: number;
  outputTokens: number;
  /** `total_cost_usd` dari envelope: perkiraan, bukan tagihan (pemakaian langganan). */
  costUsd: number | null;
  durationMs: number;
  /** Event `result` mentah (envelope JSON), untuk keterlacakan. */
  rawEnvelope: string;
  /**
   * Model yang dilaporkan Claude Code di event `system`/`init` stream (nama lengkap, misalnya
   * `claude-opus-5-5`); tidak ada untuk envelope `--output-format json` dan runner palsu.
   */
  initModel?: string | null;
};

/**
 * Progres selama pemanggilan (D-12): potongan teks jawaban beserta jumlah karakter sejauh ini, atau
 * perkiraan token thinking sebelum teks pertama keluar.
 */
export type ClaudeProgress =
  | { kind: 'text'; text: string; chars: number }
  | { kind: 'thinking'; estimatedTokens: number };

export type ClaudeRunOptions = {
  /** `--model` pemanggilan ini (profil tahap, D-14); bawaan runner bila kosong. */
  model?: string;
  /** `--effort` pemanggilan ini (profil tahap, D-14); bawaan runner bila kosong. */
  effort?: string;
  /** Batas waktu pemanggilan ini; bawaan runner bila kosong. */
  timeoutMs?: number;
  /** Dipanggil untuk setiap potongan stream; error di dalamnya diabaikan. */
  onProgress?: (progress: ClaudeProgress) => void;
};

export interface ClaudeRunner {
  run(prompt: string, options?: ClaudeRunOptions): Promise<ClaudeResult>;
}

export type ClaudeErrorCode =
  | 'EXIT_CODE'
  | 'INVALID_ENVELOPE'
  | 'IS_ERROR'
  | 'TIMEOUT'
  | 'SPAWN_FAILED'
  | 'FORBIDDEN_IN_TEST'
  | 'INVALID_CONFIG';

export type ClaudeErrorDetails = {
  exitCode?: number | null;
  stderr?: string;
  stdout?: string;
  durationMs?: number;
};

/** Kegagalan pemanggilan; `message` dalam Bahasa Indonesia dan menyebut penyebabnya (FR-02). */
const CLAUDE_RUN_ERROR = Symbol.for('prd-generator.ClaudeRunError');

export class ClaudeRunError extends Error {
  // Dikenali lewat penanda agar `instanceof` benar lintas bundle Next.js (lihat core/errors.ts).
  static [Symbol.hasInstance] = brandedInstanceCheck(CLAUDE_RUN_ERROR);
  readonly [CLAUDE_RUN_ERROR] = true;
  readonly code: ClaudeErrorCode;
  readonly details: ClaudeErrorDetails;

  constructor(code: ClaudeErrorCode, message: string, details: ClaudeErrorDetails = {}) {
    super(message);
    this.name = 'ClaudeRunError';
    this.code = code;
    this.details = details;
  }
}
