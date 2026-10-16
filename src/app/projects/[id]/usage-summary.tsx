import { Card } from '../../../components/ui/card.tsx';
import type { Stage, StageUsage } from '../../../projects/projects.ts';
import { STAGE_LABELS } from '../../../projects/stage-labels.ts';
import { type StageUsage as Usage, usageTotals } from '../../../projects/usage.ts';
import { formatCost, formatCount, formatDuration } from '../format.ts';

const ORDER: Stage[] = ['stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2', 'stage7'];

/**
 * Pemakaian token per tahap dan total proyek (FR-10): token input (termasuk cache) dan output dari
 * semua percobaan, perkiraan biaya dari envelope, dan durasi run yang berlaku.
 */
export function UsageSummary({ usage }: { usage: Partial<Record<Stage, StageUsage>> }) {
  const rows = ORDER.flatMap((stage) => {
    const value = usage[stage] as Usage | undefined;
    return value ? [{ stage, value }] : [];
  });
  const total = usageTotals(usage);
  // Panjang bilah relatif terhadap tahap dengan token terbanyak (mockup Prd.dc.html).
  const most = Math.max(1, ...rows.map(({ value }) => value.inputTokens + value.outputTokens));
  return (
    <Card as="section" aria-labelledby="usage-title" className="flex flex-col gap-2.5 text-[13px]">
      <h2 id="usage-title" className="text-[15px] font-bold">
        Pemakaian token
      </h2>
      {rows.length === 0 ? (
        <p className="text-ink-muted">Belum ada tahap yang dijalankan.</p>
      ) : (
        <table className="w-full border-collapse" data-testid="usage-summary">
          <thead className="sr-only">
            <tr>
              <th>Tahap</th>
              <th>Token</th>
              <th>Perkiraan biaya dan durasi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ stage, value }) => (
              <tr key={stage} className="border-t border-line-subtle first:border-t-0">
                <th scope="row" className="py-1.5 pr-2 text-left font-semibold">
                  {STAGE_LABELS[stage]}
                  <span
                    className="mt-1 block h-1.5 overflow-hidden rounded-full bg-line-subtle"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.max(2, Math.round(((value.inputTokens + value.outputTokens) / most) * 100))}%`,
                      }}
                    />
                  </span>
                </th>
                <td className="py-1.5 pr-2 font-mono text-ink-muted">
                  {formatCount(value.inputTokens)} / {formatCount(value.outputTokens)}
                </td>
                <td className="py-1.5 text-right font-mono text-ink-muted">
                  {formatCost(value.costUsd)}
                  {value.durationMs !== null && (
                    <span className="block">{formatDuration(value.durationMs)}</span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t border-line">
              <th scope="row" className="py-1.5 pr-2 text-left font-bold">
                Total
              </th>
              <td className="py-1.5 pr-2 font-mono" data-testid="usage-total-tokens">
                {formatCount(total.inputTokens)} / {formatCount(total.outputTokens)}
              </td>
              <td className="py-1.5 text-right font-mono" data-testid="usage-total-cost">
                {formatCost(total.costUsd)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="text-xs text-ink-faint">
        Token input / output, termasuk percobaan yang ditolak. Biaya adalah perkiraan dari Claude
        Code, bukan tagihan.
      </p>
    </Card>
  );
}
