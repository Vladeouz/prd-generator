import type { TokenTotals } from '../../projects/projects.ts';

const numberFormat = new Intl.NumberFormat('id-ID');

/** Contoh: `24.412 input · 26 output`. */
export function formatTokens({ inputTokens, outputTokens }: TokenTotals): string {
  return `${numberFormat.format(inputTokens)} input · ${numberFormat.format(outputTokens)} output`;
}

/** Tanggal dan jam lokal untuk timestamp ISO, contoh `12 Okt 2026 15.04`. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
