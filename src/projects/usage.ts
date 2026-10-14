// Pemakaian token (FR-10): token input, token output, perkiraan biaya, dan durasi per tahap dan total
// per proyek, serta perkiraan untuk konfirmasi sebelum tahap 6 dan 7 dijalankan.
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../core/db/client.ts';
import { type STAGES, stageRuns } from '../core/db/schema.ts';

type Stage = (typeof STAGES)[number];

export type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  /** Perkiraan dari envelope (`total_cost_usd`), bukan tagihan. */
  costUsd: number;
};

export type StageUsage = UsageTotals & {
  /** Durasi run yang berlaku (null bila belum ada run yang berhasil). */
  durationMs: number | null;
};

/** Token dan biaya per tahap (semua percobaan, termasuk yang gagal) dan durasi run yang berlaku. */
export function getStageUsage({ db }: { db: Db }, id: string): Partial<Record<Stage, StageUsage>> {
  const rows = db
    .select({
      stage: stageRuns.stage,
      inputTokens: stageRuns.inputTokens,
      outputTokens: stageRuns.outputTokens,
      costUsd: stageRuns.costEstimateUsd,
      durationMs: stageRuns.durationMs,
      isCurrent: stageRuns.isCurrent,
    })
    .from(stageRuns)
    .where(eq(stageRuns.projectId, id))
    .all();
  const usage: Partial<Record<Stage, StageUsage>> = {};
  for (const row of rows) {
    const total = usage[row.stage] ?? {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: null,
    };
    total.inputTokens += row.inputTokens ?? 0;
    total.outputTokens += row.outputTokens ?? 0;
    total.costUsd += row.costUsd ?? 0;
    if (row.isCurrent === 1) total.durationMs = row.durationMs;
    usage[row.stage] = total;
  }
  return usage;
}

/** Total proyek dari pemakaian per tahap. */
export function usageTotals(usage: Partial<Record<Stage, StageUsage>>): UsageTotals {
  return Object.values(usage).reduce<UsageTotals>(
    (sum, stage) => ({
      inputTokens: sum.inputTokens + (stage?.inputTokens ?? 0),
      outputTokens: sum.outputTokens + (stage?.outputTokens ?? 0),
      costUsd: sum.costUsd + (stage?.costUsd ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
}

export type StageEstimate = {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  /** `average`: rata-rata pemanggilan sebelumnya; `test`: angka uji end-to-end. */
  basis: 'average' | 'test';
  /** Jumlah pemanggilan yang dirata-rata (0 untuk angka uji). */
  samples: number;
};

/**
 * Angka uji end-to-end (docs/reference/e2e-output/report.json, percobaan pertama yang lolos),
 * dipakai bila belum ada pemanggilan sebelumnya. Token input termasuk cache.
 */
export const TEST_ESTIMATES: Record<
  'stage6' | 'stage7',
  Omit<StageEstimate, 'basis' | 'samples'>
> = {
  stage6: { durationMs: 267_620, inputTokens: 32_815, outputTokens: 29_739 },
  stage7: { durationMs: 169_820, inputTokens: 48_382, outputTokens: 19_302 },
};

/**
 * Perkiraan satu pemanggilan tahap 6 atau 7 (FR-10): rata-rata semua pemanggilan sebelumnya di
 * semua proyek yang mencatat durasi dan token (termasuk yang gagal validasi, karena pemanggilannya
 * tetap terjadi), atau angka uji bila belum ada.
 */
export function stageEstimate({ db }: { db: Db }, stage: 'stage6' | 'stage7'): StageEstimate {
  const rows = db
    .select({
      durationMs: stageRuns.durationMs,
      inputTokens: stageRuns.inputTokens,
      outputTokens: stageRuns.outputTokens,
    })
    .from(stageRuns)
    .where(
      and(
        eq(stageRuns.stage, stage),
        isNotNull(stageRuns.durationMs),
        isNotNull(stageRuns.outputTokens),
      ),
    )
    .all();
  if (rows.length === 0) return { ...TEST_ESTIMATES[stage], basis: 'test', samples: 0 };
  const average = (pick: (row: (typeof rows)[number]) => number | null) =>
    Math.round(rows.reduce((sum, row) => sum + (pick(row) ?? 0), 0) / rows.length);
  return {
    durationMs: average((row) => row.durationMs),
    inputTokens: average((row) => row.inputTokens),
    outputTokens: average((row) => row.outputTokens),
    basis: 'average',
    samples: rows.length,
  };
}
