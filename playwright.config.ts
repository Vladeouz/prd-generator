// Test end-to-end (T-017): build produksi aplikasi dijalankan di port sendiri dengan database
// sementara, repo template buatan, dan runner palsu mode `flow` (fixture nyata). Tidak pernah
// memanggil `claude` sungguhan (NFR-02): CLAUDE_COMMAND menunjuk script palsu, dan `claude` di PATH
// server diganti shim yang gagal keras.
//
//   pnpm test:e2e   (bagian dari pnpm check)
//
// Browser: `pnpm exec playwright install chromium` sekali per mesin.
import { delimiter, resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { e2eEnvironment, prepareE2eEnvironment } from './test/e2e/environment.ts';
import { CLAUDE_PROFILE_VARS } from './test/helpers/claude-profile-env.ts';

const PORT = 3517;
const FAKE_CLI = resolve('test/helpers/fake-claude-cli.mjs');

// Config dievaluasi ulang di setiap proses worker; lingkungan hanya dibuat di proses utama.
const env = process.env.PRD_E2E_DIR
  ? e2eEnvironment(process.env.PRD_E2E_DIR)
  : prepareE2eEnvironment();
process.env.PRD_E2E_DIR = env.dir;
// Di Windows namanya biasanya `Path`; kunci kedua dengan huruf lain membuat isinya ambigu.
const PATH_KEY = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';

export default defineConfig({
  testDir: 'test/e2e',
  outputDir: '.check-logs/playwright',
  // Satu server dan satu database: test berjalan berurutan.
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalTeardown: './test/e2e/teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      // Profil Claude tidak diwarisi dari shell (T-040). Kosong berarti PROFILE_DEFAULTS, dan karena
      // sudah terdefinisi, Next.js juga tidak mengisinya dari `.env`. Test yang butuh nilai lain
      // menimpanya di bawah baris ini.
      ...Object.fromEntries(CLAUDE_PROFILE_VARS.map((name) => [name, ''])),
      DATABASE_PATH: env.databasePath,
      TEMPLATE_DIR: env.templateDir,
      // Bentuk perintah sama dengan test runner CLI: satu string untuk cmd.exe di Windows.
      CLAUDE_COMMAND:
        process.platform === 'win32' ? `"${process.execPath}" "${FAKE_CLI}"` : FAKE_CLI,
      FAKE_CLAUDE_MODE: 'flow',
      FAKE_CLAUDE_DELAY_MS: '300',
      // Teks dikirim bertahap (stream) agar progres dan cuplikan teks terlihat sebelum job selesai
      // (T-024): tahap 6 ±23 potongan × 150 ms.
      FAKE_CLAUDE_CHUNK_SIZE: '2000',
      FAKE_CLAUDE_CHUNK_DELAY_MS: '150',
      // Tahap 3 pertama dijawab output nyata tanpa `default_policy_key` (ditolak validator), lalu
      // percobaan ulang memakai fixture turunan yang valid (FR-02).
      FAKE_CLAUDE_INVALID_ONCE: 'Klarifikasi Teknis',
      FAKE_CLAUDE_INVALID_FIXTURE: resolve('test/fixtures/claude/stage3.json'),
      FAKE_CLAUDE_STATE_DIR: env.stateDir,
      FAKE_CLAUDE_RETRY_DELAY_MS: '5000',
      [PATH_KEY]: `${env.binDir}${delimiter}${process.env[PATH_KEY] ?? ''}`,
    },
  },
});
