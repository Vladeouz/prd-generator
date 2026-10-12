import { defineConfig } from 'vitest/config';

// Integration test: database SQLite di folder sementara (test/helpers/db.ts) dan proses eksternal.
export default defineConfig({
  test: {
    include: ['test/int/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
