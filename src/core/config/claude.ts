// Konfigurasi pemanggilan Claude Code dari env (D-09). Bisa dijalankan Node langsung (smoke.ts),
// jadi tanpa sintaks TypeScript yang perlu ditransformasi.

/** Model bawaan: alias Sonnet terbaru (D-09, hasil spike T-022). */
export const DEFAULT_CLAUDE_MODEL = 'sonnet';

/**
 * Nama model yang aman disisipkan ke string perintah Windows (`shell: true`): alias (`sonnet`) atau
 * nama lengkap (`claude-sonnet-5-5`, `claude-opus-5-5[1m]`), tanpa spasi atau karakter khusus shell.
 */
export const isValidClaudeModel = (model: string) => /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/.test(model);

/** `CLAUDE_MODEL` dari env, atau `sonnet` bila kosong. Validasinya di runner CLI. */
export function claudeModel(env: Record<string, string | undefined> = process.env): string {
  return env.CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
}
