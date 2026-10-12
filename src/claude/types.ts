// Port pemanggilan Claude Code. Aplikasi hanya bergantung pada `ClaudeRunner`; implementasinya
// `CliClaudeRunner` (perintah `claude` sungguhan) atau `FakeClaudeRunner` (fixture, untuk test).
//
// File di folder ini bisa dijalankan langsung oleh Node 24 (type stripping, lihat smoke.ts), jadi
// tidak boleh memakai sintaks TypeScript yang perlu ditransformasi (enum, parameter property).

export type ClaudeResult = {
  /** Isi `result` dari envelope: teks jawaban model. */
  result: string;
  /** Token input termasuk cache (`input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`). */
  inputTokens: number;
  outputTokens: number;
  /** `total_cost_usd` dari envelope: perkiraan, bukan tagihan (pemakaian langganan). */
  costUsd: number | null;
  durationMs: number;
  /** stdout mentah (envelope JSON), untuk keterlacakan. */
  rawEnvelope: string;
};

export type ClaudeRunOptions = {
  /** Batas waktu pemanggilan ini; bawaan runner bila kosong. */
  timeoutMs?: number;
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
  | 'FORBIDDEN_IN_TEST';

export type ClaudeErrorDetails = {
  exitCode?: number | null;
  stderr?: string;
  stdout?: string;
  durationMs?: number;
};

/** Kegagalan pemanggilan; `message` dalam Bahasa Indonesia dan menyebut penyebabnya (FR-02). */
export class ClaudeRunError extends Error {
  readonly code: ClaudeErrorCode;
  readonly details: ClaudeErrorDetails;

  constructor(code: ClaudeErrorCode, message: string, details: ClaudeErrorDetails = {}) {
    super(message);
    this.name = 'ClaudeRunError';
    this.code = code;
    this.details = details;
  }
}
