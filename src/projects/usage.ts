// Pemakaian token (FR-10): token input, token output, perkiraan biaya, dan durasi per tahap dan total
// per proyek, serta perkiraan untuk konfirmasi sebelum tahap 6 dan 7 dijalankan.
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { type ClaudeProfileConfig, claudeProfile, STAGE_PROFILES } from '../core/config/claude.ts';
import type { Db } from '../core/db/client.ts';
import { type STAGES, stageRuns } from '../core/db/schema.ts';
import { STAGE7B_CONCURRENCY } from '../stages/attempts.ts';
import { loadPrompt } from '../stages/prompt.ts';
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
  /** Model dan effort pemanggilan terakhir tahap ini (D-14); null untuk run sebelum T-035. */
  model: string | null;
  effort: string | null;
};

/**
 * Token dan biaya per tahap (semua percobaan, termasuk yang gagal), durasi run yang berlaku, serta
 * model dan effort pemanggilan terakhir.
 */
export function getStageUsage({ db }: { db: Db }, id: string): Partial<Record<Stage, StageUsage>> {
  const rows = db
    .select({
      stage: stageRuns.stage,
      inputTokens: stageRuns.inputTokens,
      outputTokens: stageRuns.outputTokens,
      costUsd: stageRuns.costEstimateUsd,
      durationMs: stageRuns.durationMs,
      isCurrent: stageRuns.isCurrent,
      model: stageRuns.model,
      effort: stageRuns.effort,
    })
    .from(stageRuns)
    .where(eq(stageRuns.projectId, id))
    .orderBy(asc(stageRuns.createdAt))
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
      model: null,
      effort: null,
    };
    total.inputTokens += row.inputTokens ?? 0;
    total.outputTokens += row.outputTokens ?? 0;
    total.costUsd += row.costUsd ?? 0;
    // Baris urut waktu: yang terakhir menang. Run lama tanpa model tidak menimpa yang sudah ada.
    if (row.model !== null) {
      total.model = row.model;
      total.effort = row.effort;
    }
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

type EstimateRunStage = 'stage6' | 'stage7a' | 'stage7b';

/** File prompt per run yang diperkirakan; versinya menentukan run mana yang dirata-rata. */
const ESTIMATE_PROMPTS: Record<EstimateRunStage, string> = {
  stage6: 'stage-6',
  stage7a: 'stage-7a',
  stage7b: 'stage-7b',
};

/** Pengaturan pemanggilan yang menentukan run mana yang dirata-rata. */
export type EstimateSetting = { promptVersion: string; model: string; effort: string };

/**
 * Versi prompt (dibaca dari `prompts/`) serta model dan effort profil tahap (env, D-14) yang sedang
 * dipakai per run.
 */
export function currentEstimateSettings(
  profiles: (profile: ClaudeProfileConfig['profile']) => ClaudeProfileConfig = claudeProfile,
): Record<EstimateRunStage, EstimateSetting> {
  const setting = (runStage: EstimateRunStage): EstimateSetting => {
    const { model, effort } = profiles(STAGE_PROFILES[runStage]);
    return { promptVersion: loadPrompt(ESTIMATE_PROMPTS[runStage]).version, model, effort };
  };
  return { stage6: setting('stage6'), stage7a: setting('stage7a'), stage7b: setting('stage7b') };
}

/**
 * Perkiraan menjalankan tahap 6 atau 7 (FR-10) dari pemanggilan sebelumnya di semua proyek dengan
 * versi prompt, model, dan effort yang sedang dipakai (`settings`), yang mencatat durasi dan token
 * (termasuk yang gagal validasi, karena pemanggilannya tetap terjadi), atau angka awal bila belum
 * ada. Run dengan pengaturan lain tidak dihitung: di uji T-018, rata-rata yang ikut menghitung run
 * sebelum efisiensi T-023/T-025 menyebut "sekitar 8 menit" untuk tahap 6 yang selesai dalam 65
 * detik, dan model lain (T-035) punya durasi yang jauh berbeda. Run sebelum T-035 tidak mencatat
 * model, jadi tidak dihitung.
 * - Tahap 6: rata-rata satu pemanggilan.
 * - Tahap 7 (D-11): token adalah rata-rata pemanggilan 7a ditambah rata-rata pemanggilan 7b per
 *   fase dikali `phases`, masing-masing dengan versi prompt-nya sendiri. Detail fase berjalan
 *   bersamaan (T-033), jadi durasinya rata-rata 7a ditambah durasi fase terlama (rata-rata per fase,
 *   lalu yang terbesar), dikali jumlah gelombang bila `concurrency` lebih kecil dari `phases`. Run
 *   tahap 7 lama hasil migrasi (`stage7b` tanpa scope) tidak dihitung.
 */
export function stageEstimate(
  { db }: { db: Db },
  stage: 'stage6' | 'stage7',
  phases = 4,
  settings: Record<EstimateRunStage, EstimateSetting> = currentEstimateSettings(),
  concurrency = STAGE7B_CONCURRENCY,
): StageEstimate {
  const rowsOf = (runStage: EstimateRunStage) =>
    db
      .select({
        scope: stageRuns.scope,
        durationMs: stageRuns.durationMs,
        inputTokens: stageRuns.inputTokens,
        outputTokens: stageRuns.outputTokens,
      })
      .from(stageRuns)
      .where(
        and(
          eq(stageRuns.stage, runStage),
          eq(stageRuns.promptVersion, settings[runStage].promptVersion),
          eq(stageRuns.model, settings[runStage].model),
          eq(stageRuns.effort, settings[runStage].effort),
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
  const scopes = Map.groupBy(details, (row) => row.scope);
  const longest = Math.max(...[...scopes.values()].map((rows) => averageOf(rows).durationMs));
  const waves = Math.ceil(phases / Math.max(1, Math.min(concurrency, phases)));
  return {
    durationMs: a.durationMs + longest * waves,
    inputTokens: a.inputTokens + b.inputTokens * phases,
    outputTokens: a.outputTokens + b.outputTokens * phases,
    basis: 'average',
    samples: list.length + details.length,
  };
}
