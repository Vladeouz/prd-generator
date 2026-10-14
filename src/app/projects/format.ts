import type { TokenTotals } from '../../projects/projects.ts';
import type { ProjectStage } from '../../projects/stage-labels.ts';

const numberFormat = new Intl.NumberFormat('id-ID');

/** Contoh: `24.412`. */
export const formatCount = (value: number) => numberFormat.format(value);

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

/** Nomor tahap di alur 8 tahap (1 = ide). Review kedua bagian dari tahap 6 (PRD). */
export const STAGE_NUMBERS: Record<ProjectStage, number> = {
  stage2: 2,
  stage3: 3,
  stage4: 4,
  stage5: 5,
  stage6: 6,
  review2: 6,
  stage7: 7,
  export: 8,
};

export const stageNumber = (stage: ProjectStage) => STAGE_NUMBERS[stage];

/** Contoh: `19 dtk`, `2 mnt 14 dtk`. */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds} dtk` : `${Math.floor(seconds / 60)} mnt ${seconds % 60} dtk`;
}

/** Perkiraan biaya dari envelope, contoh `$0,72`. Bukan tagihan: pemakaian langganan. */
export const formatCost = (usd: number) =>
  `$${usd.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Jumlah token dibulatkan untuk perkiraan, contoh `±33 rb`. */
export const formatApproxTokens = (tokens: number) =>
  tokens >= 1000 ? `±${Math.round(tokens / 1000)} rb` : `±${tokens}`;
