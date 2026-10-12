import { defineConfig } from 'drizzle-kit';

// Hanya untuk `drizzle-kit generate` (migrasi di drizzle/, di-commit). Migrasi dijalankan aplikasi
// lewat src/core/db/migrate.ts, bukan oleh drizzle-kit.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/core/db/schema.ts',
  out: './drizzle',
});
