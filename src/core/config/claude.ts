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

/**
 * Asal nilai variabel profil (T-041): `env` (variabel lingkungan proses, misalnya diwarisi dari shell
 * sesi Claude Code), `dotenv` (sama dengan isi `.env`), atau `default` (kosong, memakai bawaan).
 */
export type ProfileValueSource = 'env' | 'dotenv' | 'default';

export type ProfileVarSource = {
  name: string;
  value: string;
  defaultValue: string;
  source: ProfileValueSource;
};

/**
 * Asal nilai model dan effort `profile`. `env` adalah env proses (di server Next.js sudah berisi
 * `.env`), `dotenv` isi file `.env` di root. Nilai yang sama dengan `.env` dianggap berasal dari
 * `.env`.
 */
export function profileSources(
  profile: ClaudeProfile,
  env: Record<string, string | undefined>,
  dotenv: Record<string, string | undefined>,
): { model: ProfileVarSource; effort: ProfileVarSource } {
  const sourceOf = (kind: 'model' | 'effort'): ProfileVarSource => {
    const name = PROFILE_ENV[profile][kind];
    const defaultValue = PROFILE_DEFAULTS[profile][kind];
    const value = env[name]?.trim() ?? '';
    if (!value) return { name, value: defaultValue, defaultValue, source: 'default' };
    const source = dotenv[name]?.trim() === value ? 'dotenv' : 'env';
    return { name, value, defaultValue, source };
  };
  return { model: sourceOf('model'), effort: sourceOf('effort') };
}

/**
 * Peringatan (bukan error) untuk nilai profil dari env proses yang berbeda dari bawaan: mudah
 * terlewat, karena shell sesi Claude Code membawa `CLAUDE_EFFORT` miliknya sendiri (temuan 19 uji
 * T-018).
 */
export function profileSourceWarnings(
  profile: ClaudeProfile,
  env: Record<string, string | undefined>,
  dotenv: Record<string, string | undefined>,
): string[] {
  const sources = profileSources(profile, env, dotenv);
  return [sources.model, sources.effort]
    .filter((variable) => variable.source === 'env' && variable.value !== variable.defaultValue)
    .map(
      ({ name, value, defaultValue }) =>
        `${name}=${value} berasal dari variabel lingkungan proses, bukan dari .env, dan berbeda dari bawaan (${defaultValue}). Bila server dijalankan dari shell Claude Code, nilai ini milik sesi Claude Code: jalankan server dari terminal biasa, atau hapus variabelnya dulu (env -u ${name} pnpm start).`,
    );
}

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
