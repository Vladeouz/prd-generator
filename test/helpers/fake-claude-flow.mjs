// Pemilihan fixture untuk runner palsu mode `flow` (fake-claude-cli.mjs). Dipisah agar bisa diimpor
// test tanpa menjalankan script CLI-nya.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Nama tahap di prompt → fixture di test/fixtures/claude/. */
export const FLOW_FIXTURES = {
  'Klarifikasi Produk': 'stage2.json',
  'Klarifikasi Teknis': 'derived/stage3-gym.json',
  'Struktur Fitur': 'stage4.json',
  'Review Kritis': 'stage5.json',
  'Generate PRD': 'derived/stage6-gym.json',
  'Review Kedua': 'synthetic/review2-daftar-belanja.json',
  'Generate Task Plan': 'derived/stage7-gym.json',
  'Daftar Task': 'derived/stage7a-gym.json',
};

const FIXTURE_DIR = new URL('../fixtures/claude/', import.meta.url);

const stageName = (prompt) => /Kamu adalah tahap "([^"]+)"/.exec(prompt)?.[1];

/** Path fixture untuk prompt itu, atau null bila nama tahapnya tidak dikenal. */
export function flowFixture(prompt) {
  const name = stageName(prompt);
  const file =
    name === undefined
      ? undefined
      : FLOW_FIXTURES[/** @type {keyof typeof FLOW_FIXTURES} */ (name)];
  return file ? new URL(file, FIXTURE_DIR) : null;
}

/**
 * Jawaban mode `flow`: fixture beserta jedanya, atau null bila tahap tidak dikenal. Variabel
 * lingkungan:
 *   FAKE_CLAUDE_DELAY_MS        jeda sebelum mencetak (bawaan 0)
 *   FAKE_CLAUDE_INVALID_ONCE    nama tahap (misalnya `Klarifikasi Teknis`) yang pemanggilan
 *                               pertamanya dijawab FAKE_CLAUDE_INVALID_FIXTURE, untuk menguji
 *                               percobaan ulang; pemanggilan berikutnya memakai fixture flow
 *   FAKE_CLAUDE_INVALID_FIXTURE path envelope yang ditolak validator tahap itu
 *   FAKE_CLAUDE_STATE_DIR       folder penanda bahwa jawaban tidak valid sudah dikirim (antar proses)
 *   FAKE_CLAUDE_RETRY_DELAY_MS  jeda pemanggilan sesudah jawaban tidak valid (bawaan DELAY_MS), agar
 *                               keterangan percobaan ulang sempat terlihat di layar
 *
 * @param {string} prompt
 * @param {Record<string, string | undefined>} env
 * @returns {{ file: URL, delayMs: number } | null}
 */
export function flowResponse(prompt, env) {
  const fixture = flowFixture(prompt);
  if (!fixture) return null;
  const delayMs = Number(env.FAKE_CLAUDE_DELAY_MS ?? 0);
  if (!env.FAKE_CLAUDE_INVALID_ONCE || stageName(prompt) !== env.FAKE_CLAUDE_INVALID_ONCE) {
    return { file: fixture, delayMs };
  }
  if (!env.FAKE_CLAUDE_STATE_DIR || !env.FAKE_CLAUDE_INVALID_FIXTURE) {
    throw new Error(
      'FAKE_CLAUDE_INVALID_ONCE butuh FAKE_CLAUDE_STATE_DIR dan FAKE_CLAUDE_INVALID_FIXTURE',
    );
  }
  const marker = join(env.FAKE_CLAUDE_STATE_DIR, 'invalid-once.txt');
  const state = existsSync(marker) ? readFileSync(marker, 'utf8') : 'belum';
  if (state === 'belum') {
    writeFileSync(marker, 'terkirim');
    return { file: pathToFileURL(resolve(env.FAKE_CLAUDE_INVALID_FIXTURE)), delayMs };
  }
  if (state === 'terkirim') {
    writeFileSync(marker, 'selesai');
    return { file: fixture, delayMs: Number(env.FAKE_CLAUDE_RETRY_DELAY_MS ?? delayMs) };
  }
  return { file: fixture, delayMs };
}
