import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UsageSummary } from '../../../src/app/projects/[id]/usage-summary.tsx';
import { formatCost } from '../../../src/app/projects/format.ts';

describe('UsageSummary (FR-10)', () => {
  it('token input/output, biaya, dan durasi per tahap sesuai urutan alur, dengan total proyek', () => {
    const html = renderToStaticMarkup(
      <UsageSummary
        usage={{
          stage6: { inputTokens: 32_815, outputTokens: 29_739, costUsd: 0.72, durationMs: 267_620 },
          stage2: { inputTokens: 24_137, outputTokens: 1_521, costUsd: 0.1, durationMs: 19_000 },
          review2: { inputTokens: 40_000, outputTokens: 5_000, costUsd: 0.2, durationMs: null },
        }}
      />,
    );
    const order = ['Klarifikasi produk', 'PRD', 'Review kedua'].map((label) => html.indexOf(label));
    expect(order.every((at, i) => at > (order[i - 1] ?? -1))).toBe(true);
    expect(html).toContain('24.137 / 1.521');
    expect(html).toContain('$0,72<span class="block">4 mnt 28 dtk</span>');
    expect(html).toContain('data-testid="usage-total-tokens">96.952 / 36.260<');
    expect(html).toContain('data-testid="usage-total-cost">$1,02<');
  });

  it('belum ada tahap yang dijalankan', () => {
    expect(renderToStaticMarkup(<UsageSummary usage={{}} />)).toContain(
      'Belum ada tahap yang dijalankan.',
    );
  });

  it('formatCost memakai koma desimal', () => {
    expect(formatCost(1.9655874)).toBe('$1,97');
    expect(formatCost(0)).toBe('$0,00');
  });
});
