import { defineConfig } from 'vitest/config';

// Integration test: database SQLite di folder sementara (test/helpers/db.ts) dan proses eksternal.
export default defineConfig({
  test: {
    include: ['test/int/**/*.int.test.ts'],
    environment: 'node',
    // Profil Claude dari shell dihapus agar test memakai PROFILE_DEFAULTS (T-040).
    setupFiles: ['test/helpers/vitest-setup.ts'],
    testTimeout: 60_000,
  },
});
