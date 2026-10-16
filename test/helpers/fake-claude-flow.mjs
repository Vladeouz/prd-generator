// Pemilihan fixture untuk runner palsu mode `flow` (fake-claude-cli.mjs). Dipisah agar bisa diimpor
// test tanpa menjalankan script CLI-nya.

/** Nama tahap di prompt → fixture di test/fixtures/claude/. */
export const FLOW_FIXTURES = {
  'Klarifikasi Produk': 'stage2.json',
  'Klarifikasi Teknis': 'derived/stage3-gym.json',
  'Struktur Fitur': 'stage4.json',
  'Review Kritis': 'stage5.json',
  'Generate PRD': 'derived/stage6-gym.json',
  'Review Kedua': 'synthetic/review2-daftar-belanja.json',
  'Generate Task Plan': 'derived/stage7-gym.json',
};

const FIXTURE_DIR = new URL('../fixtures/claude/', import.meta.url);

/** Path fixture untuk prompt itu, atau null bila nama tahapnya tidak dikenal. */
export function flowFixture(prompt) {
  const name = /Kamu adalah tahap "([^"]+)"/.exec(prompt)?.[1];
  const file =
    name === undefined
      ? undefined
      : FLOW_FIXTURES[/** @type {keyof typeof FLOW_FIXTURES} */ (name)];
  return file ? new URL(file, FIXTURE_DIR) : null;
}
