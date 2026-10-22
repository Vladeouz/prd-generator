// Konfigurasi pemanggilan Claude Code dari env: model dan effort per profil tahap (D-09, D-14). Bisa
// dijalankan Node langsung (smoke.ts), jadi tanpa sintaks TypeScript yang perlu ditransformasi.

/** Nilai `--effort` yang diterima `claude` (`claude --help`). */
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ClaudeEffort = (typeof CLAUDE_EFFORTS)[number];

/**
 * Profil tahap (D-14): `standard` untuk tahap penulisan, `reasoning` untuk review kedua. Bawaan
 * `reasoning` dari spike T-034 (Opus `medium`: temuan review 2 lebih dalam, ±$0,19 per proyek).
 */
export const CLAUDE_PROFILES = ['standard', 'reasoning'] as const;
export type ClaudeProfile = (typeof CLAUDE_PROFILES)[number];

export const PROFILE_ENV = {
  standard: { model: 'CLAUDE_MODEL', effort: 'CLAUDE_EFFORT' },
  reasoning: { model: 'CLAUDE_MODEL_REASONING', effort: 'CLAUDE_EFFORT_REASONING' },
} as const satisfies Record<ClaudeProfile, { model: string; effort: string }>;

export const PROFILE_DEFAULTS = {
  standard: { model: 'sonnet', effort: 'low' },
  reasoning: { model: 'opus', effort: 'medium' },
} as const satisfies Record<ClaudeProfile, { model: string; effort: ClaudeEffort }>;

/** Profil setiap tahap di `stage_runs` (D-14). Definisi tahap mengambil profilnya dari sini. */
export const STAGE_PROFILES = {
  stage2: 'standard',
  stage3: 'standard',
  stage4: 'standard',
  stage5: 'standard',
  stage6: 'standard',
  review2: 'reasoning',
  stage7a: 'standard',
  stage7b: 'standard',
} as const satisfies Record<string, ClaudeProfile>;

/**
 * Nama model yang aman disisipkan ke string perintah Windows (`shell: true`): alias (`sonnet`) atau
 * nama lengkap (`claude-sonnet-5-5`, `claude-opus-5-5[1m]`), tanpa spasi atau karakter khusus shell.
 */
export const isValidClaudeModel = (model: string) => /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/.test(model);

export const isValidClaudeEffort = (effort: string): effort is ClaudeEffort =>
  (CLAUDE_EFFORTS as readonly string[]).includes(effort);

/** Model dan effort satu pemanggilan. */
export type ClaudeCallConfig = { model: string; effort: string };

export type ClaudeProfileConfig = ClaudeCallConfig & {
  profile: ClaudeProfile;
  /** Masalah nilai env (Bahasa Indonesia, menyebut variabelnya); kosong bila valid. */
  problems: string[];
};

/** Model dan effort `profile` dari env (kosong → bawaan), beserta masalahnya bila tidak valid. */
export function claudeProfile(
  profile: ClaudeProfile,
  env: Record<string, string | undefined> = process.env,
): ClaudeProfileConfig {
  const names = PROFILE_ENV[profile];
  const defaults = PROFILE_DEFAULTS[profile];
  const model = env[names.model]?.trim() || defaults.model;
  const effort = env[names.effort]?.trim() || defaults.effort;
  const problems = [];
  if (!isValidClaudeModel(model)) {
    problems.push(
      `${names.model} tidak valid: "${model}". Isi dengan alias (misalnya ${defaults.model}) atau nama model lengkap, tanpa spasi.`,
    );
  }
  if (!isValidClaudeEffort(effort)) {
    problems.push(
      `${names.effort} tidak valid: "${effort}". Pilih salah satu: ${CLAUDE_EFFORTS.join(', ')}.`,
    );
  }
  return { profile, model, effort, problems };
}
