// Pemakaian token (FR-10): token input, token output, perkiraan biaya, dan durasi per tahap dan total
// per proyek, serta perkiraan untuk konfirmasi sebelum tahap 6 dan 7 dijalankan.
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../core/db/client.ts';
import { type STAGES, stageRuns } from '../core/db/schema.ts';
import { stageOfRun } from '../stages/run-stage.ts';

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
    // stage7a dan stage7b (semua fase) dijumlahkan sebagai tahap 7.
    const stage = stageOfRun(row.stage);
    const total = usage[stage] ?? {
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: null,
    };
    total.inputTokens += row.inputTokens ?? 0;
    total.outputTokens += row.outputTokens ?? 0;
    total.costUsd += row.costUsd ?? 0;
    if (row.isCurrent === 1) {
      // Tahap 7 punya beberapa run berlaku (7a dan 7b per fase); durasinya dijumlahkan.
      total.durationMs =
        stage === 'stage7' ? (total.durationMs ?? 0) + (row.durationMs ?? 0) : row.durationMs;
    }
    usage[stage] = total;
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
 * Angka awal bila belum ada pemanggilan sebelumnya. Token input termasuk cache.
 * - Tahap 6: verifikasi manual T-025 (sonnet, `--effort low`, bagian konvensi, PRD ±45 KB).
 * - Tahap 7 (satu job: 7a + 7b untuk 4 fase): target NFR-06 (≤ 5 menit) dengan token diperkirakan
 *   dari ukuran prompt 7a/7b, sampai ada pemanggilan nyata yang dirata-rata.
 */
export const TEST_ESTIMATES: Record<
  'stage6' | 'stage7',
  Omit<StageEstimate, 'basis' | 'samples'>
> = {
  stage6: { durationMs: 235_111, inputTokens: 25_278, outputTokens: 35_727 },
  stage7: { durationMs: 300_000, inputTokens: 70_000, outputTokens: 30_000 },
};

type EstimateRow = {
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

function averageOf(rows: EstimateRow[]) {
  const average = (pick: (row: EstimateRow) => number | null) =>
    Math.round(rows.reduce((sum, row) => sum + (pick(row) ?? 0), 0) / rows.length);
  return {
    durationMs: average((row) => row.durationMs),
    inputTokens: average((row) => row.inputTokens),
    outputTokens: average((row) => row.outputTokens),
  };
}

/**
 * Perkiraan menjalankan tahap 6 atau 7 (FR-10) dari semua pemanggilan sebelumnya di semua proyek
 * yang mencatat durasi dan token (termasuk yang gagal validasi, karena pemanggilannya tetap
 * terjadi), atau angka awal bila belum ada.
 * - Tahap 6: rata-rata satu pemanggilan.
 * - Tahap 7 (D-11): rata-rata pemanggilan 7a ditambah rata-rata pemanggilan 7b per fase dikali
 *   `phases`. Run tahap 7 lama hasil migrasi (`stage7b` tanpa scope) tidak dihitung.
 */
export function stageEstimate(
  { db }: { db: Db },
  stage: 'stage6' | 'stage7',
  phases = 4,
): StageEstimate {
  const rowsOf = (runStage: 'stage6' | 'stage7a' | 'stage7b') =>
    db
      .select({
        durationMs: stageRuns.durationMs,
        inputTokens: stageRuns.inputTokens,
        outputTokens: stageRuns.outputTokens,
      })
      .from(stageRuns)
      .where(
        and(
          eq(stageRuns.stage, runStage),
          runStage === 'stage7b' ? isNotNull(stageRuns.scope) : undefined,
          isNotNull(stageRuns.durationMs),
          isNotNull(stageRuns.outputTokens),
        ),
      )
      .all();
  if (stage === 'stage6') {
    const rows = rowsOf('stage6');
    if (rows.length === 0) return { ...TEST_ESTIMATES.stage6, basis: 'test', samples: 0 };
    return { ...averageOf(rows), basis: 'average', samples: rows.length };
  }
  const list = rowsOf('stage7a');
  const details = rowsOf('stage7b');
  if (list.length === 0 || details.length === 0) {
    return { ...TEST_ESTIMATES.stage7, basis: 'test', samples: 0 };
  }
  const a = averageOf(list);
  const b = averageOf(details);
  return {
    durationMs: a.durationMs + b.durationMs * phases,
    inputTokens: a.inputTokens + b.inputTokens * phases,
    outputTokens: a.outputTokens + b.outputTokens * phases,
    basis: 'average',
    samples: list.length + details.length,
  };
}
