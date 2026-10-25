import { defineConfig } from 'vitest/config';

// Unit test: cepat, tanpa database dan tanpa proses eksternal. Integration test memakai
// vitest.int.config.ts (T-003).
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Profil Claude dari shell dihapus agar test memakai PROFILE_DEFAULTS (T-040).
    setupFiles: ['test/helpers/vitest-setup.ts'],
  },
});
