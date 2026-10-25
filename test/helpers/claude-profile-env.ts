// Test tidak membaca profil Claude (D-14) dari shell (T-040): shell sesi Claude Code membawa
// `CLAUDE_EFFORT`, yang membuat perkiraan FR-10 memakai effort lain dari `PROFILE_DEFAULTS`. Test yang
// menguji nilai env memberi env eksplisit (`claudeProfile(profile, env)`).
import { PROFILE_ENV } from '../../src/core/config/claude.ts';

/** `CLAUDE_MODEL`, `CLAUDE_EFFORT`, `CLAUDE_MODEL_REASONING`, `CLAUDE_EFFORT_REASONING`. */
export const CLAUDE_PROFILE_VARS = Object.values(PROFILE_ENV).flatMap(({ model, effort }) => [
  model,
  effort,
]);

export function clearClaudeProfileEnv(env: NodeJS.ProcessEnv = process.env) {
  for (const name of CLAUDE_PROFILE_VARS) delete env[name];
}
