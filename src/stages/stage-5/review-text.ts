// Teks UI untuk temuan review; dipakai komponen klien, jadi tanpa kode server.
import type { Severity } from './validate.ts';

export const SEVERITY_TEXT: Record<Severity, string> = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',
};

export const CATEGORY_TEXT: Record<string, string> = {
  stack_deploy: 'Stack dan deploy',
  dependency_order: 'Urutan dependensi',
  security: 'Keamanan',
  consistency: 'Konsistensi',
  scope_creep: 'Fitur tambahan',
  testability: 'Bisa diuji',
  stack: 'Stack',
};
