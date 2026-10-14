// Eksekusi satu tahap secara generik (FR-02, D-08), diturunkan dari `runStage` di
// docs/reference/e2e-gym.mjs:
// - output yang gagal parse atau validasi dicoba ulang SEKALI dengan daftar error-nya;
// - setiap percobaan dicatat di stage_runs (versi prompt, output mentah, token, biaya, durasi);
// - hanya percobaan yang valid yang menjadi `is_current = 1`, menggantikan output tahap itu
//   sebelumnya dalam satu transaksi;
// - kegagalan runner (exit code, batas waktu, envelope rusak, is_error) tidak dicoba ulang dan
//   tidak menyimpan output apa pun.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { type ClaudeResult, ClaudeRunError, type ClaudeRunner } from '../claude/types.ts';
import type { Clock } from '../core/clock.ts';
import type { Db } from '../core/db/client.ts';
import { type STAGES, stageRuns } from '../core/db/schema.ts';
import { brandedInstanceCheck } from '../core/errors.ts';
import { MAX_ATTEMPTS } from './attempts.ts';

export type Stage = (typeof STAGES)[number];

export type StageContext = { db: Db; projectId: string };

/** Transaksi Drizzle di dalam `db.transaction`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type StageValidation = { errors: string[]; warnings?: string[] };

export type StageDefinition<T = unknown> = {
  stage: Stage;
  /** `version` dari front matter prompt di prompts/. */
  promptVersion: string;
  /**
   * Prasyarat sebelum tahap boleh dijalankan; mengembalikan alasan (Bahasa Indonesia) bila belum
   * terpenuhi, yang dikirim ke user sebagai 409.
   */
  notReadyReason?(context: StageContext): string | null;
  /** Boleh async, misalnya untuk membaca repo template (tahap 6). Error yang dilempar menggagalkan job. */
  buildPrompt(context: StageContext): string | Promise<string>;
  /** Mengubah teks `result` menjadi output; melempar error bila tidak bisa. */
  parse(result: string): T;
  /** `context` dipakai validator yang memeriksa output terhadap data proyek (review kedua). */
  validate(output: T, context: StageContext): StageValidation;
  /** Dijalankan di transaksi yang sama dengan pencatatan output yang berlaku. */
  onSuccess?(context: { tx: Tx; projectId: string; output: T; now: string }): void;
};

export { MAX_ATTEMPTS } from './attempts.ts';

/** Output tahap yang sedang berlaku (`is_current = 1`), atau null bila belum ada. */
export function currentOutput<T>(db: Db, projectId: string, stage: Stage): T | null {
  const run = db
    .select({ outputJson: stageRuns.outputJson })
    .from(stageRuns)
    .where(
      and(
        eq(stageRuns.projectId, projectId),
        eq(stageRuns.stage, stage),
        eq(stageRuns.isCurrent, 1),
      ),
    )
    .get();
  return run?.outputJson ? (JSON.parse(run.outputJson) as T) : null;
}

/** Prompt percobaan ulang: prompt awal ditambah daftar error (pola uji end-to-end). */
export function retryPrompt(prompt: string, errors: string[]): string {
  const listed = errors
    .slice(0, 10)
    .map((error) => `- ${error}`)
    .join('\n');
  return `${prompt}\n\nPERHATIAN: output kamu sebelumnya tidak valid karena:\n${listed}\nPerbaiki dan kirim ulang output lengkap sesuai format.`;
}

/** Ringkasan error validasi untuk pesan job yang gagal. */
export function summarizeErrors(errors: string[], max = 3): string {
  const shown = errors.slice(0, max).join('; ');
  return errors.length > max ? `${shown} (+${errors.length - max} lainnya)` : shown;
}

/** Tahap gagal: pesan berbahasa Indonesia yang menyebut penyebabnya, untuk `jobs.error`. */
const STAGE_FAILED_ERROR = Symbol.for('prd-generator.StageFailedError');

export class StageFailedError extends Error {
  // Dikenali lewat penanda agar `instanceof` benar lintas bundle Next.js (lihat core/errors.ts).
  static [Symbol.hasInstance] = brandedInstanceCheck(STAGE_FAILED_ERROR);
  readonly [STAGE_FAILED_ERROR] = true;

  constructor(message: string) {
    super(message);
    this.name = 'StageFailedError';
  }
}

export type RunStageDeps = { db: Db; runner: ClaudeRunner; clock: Clock };

export type StageRunOutcome<T> = { output: T; stageRunId: string; attempts: number };

function check<T>(definition: StageDefinition<T>, result: string, context: StageContext) {
  let output: T;
  try {
    output = definition.parse(result);
  } catch (error) {
    return { errors: [`parse gagal: ${(error as Error).message}`] };
  }
  const { errors } = definition.validate(output, context);
  return errors.length === 0 ? { output } : { errors };
}

export async function runStage<T>(
  deps: RunStageDeps,
  definition: StageDefinition<T>,
  projectId: string,
): Promise<StageRunOutcome<T>> {
  const { db, runner, clock } = deps;
  // `await` hanya untuk prompt async: prompt sinkron tetap dikirim ke runner pada tick yang sama.
  const built = definition.buildPrompt({ db, projectId });
  const prompt = typeof built === 'string' ? built : await built;

  let currentPrompt = prompt;
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const createdAt = clock();
    const base = {
      projectId,
      stage: definition.stage,
      attempt,
      promptVersion: definition.promptVersion,
      createdAt,
    };

    let result: ClaudeResult;
    try {
      result = await runner.run(currentPrompt);
    } catch (error) {
      if (!(error instanceof ClaudeRunError)) throw error;
      db.insert(stageRuns)
        .values({
          ...base,
          id: randomUUID(),
          status: 'failed',
          errorsJson: JSON.stringify([`${error.code}: ${error.message}`]),
          durationMs: error.details.durationMs ?? null,
          isCurrent: 0,
          finishedAt: clock(),
        })
        .run();
      throw new StageFailedError(error.message);
    }

    const measured = {
      ...base,
      id: randomUUID(),
      outputRaw: result.result,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costEstimateUsd: result.costUsd,
      durationMs: result.durationMs,
    };
    const checked = check(definition, result.result, { db, projectId });

    if ('output' in checked) {
      db.transaction((tx) => {
        tx.update(stageRuns)
          .set({ isCurrent: 0 })
          .where(
            and(
              eq(stageRuns.projectId, projectId),
              eq(stageRuns.stage, definition.stage),
              eq(stageRuns.isCurrent, 1),
            ),
          )
          .run();
        tx.insert(stageRuns)
          .values({
            ...measured,
            status: 'succeeded',
            outputJson: JSON.stringify(checked.output),
            isCurrent: 1,
            finishedAt: clock(),
          })
          .run();
        definition.onSuccess?.({ tx, projectId, output: checked.output as T, now: clock() });
      });
      return { output: checked.output as T, stageRunId: measured.id, attempts: attempt };
    }

    lastErrors = checked.errors;
    db.insert(stageRuns)
      .values({
        ...measured,
        status: 'failed',
        errorsJson: JSON.stringify(lastErrors),
        isCurrent: 0,
        finishedAt: clock(),
      })
      .run();
    currentPrompt = retryPrompt(prompt, lastErrors);
  }

  throw new StageFailedError(
    `Output tahap tidak valid setelah ${MAX_ATTEMPTS} percobaan: ${summarizeErrors(lastErrors)}`,
  );
}
