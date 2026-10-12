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

export type Stage = (typeof STAGES)[number];

export type StageContext = { db: Db; projectId: string };

export type StageValidation = { errors: string[]; warnings?: string[] };

export type StageDefinition<T = unknown> = {
  stage: Stage;
  /** `version` dari front matter prompt di prompts/. */
  promptVersion: string;
  buildPrompt(context: StageContext): string;
  /** Mengubah teks `result` menjadi output; melempar error bila tidak bisa. */
  parse(result: string): T;
  validate(output: T): StageValidation;
};

export const MAX_ATTEMPTS = 2;

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
export class StageFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StageFailedError';
  }
}

export type RunStageDeps = { db: Db; runner: ClaudeRunner; clock: Clock };

export type StageRunOutcome<T> = { output: T; stageRunId: string; attempts: number };

function check<T>(definition: StageDefinition<T>, result: string) {
  let output: T;
  try {
    output = definition.parse(result);
  } catch (error) {
    return { errors: [`parse gagal: ${(error as Error).message}`] };
  }
  const { errors } = definition.validate(output);
  return errors.length === 0 ? { output } : { errors };
}

export async function runStage<T>(
  deps: RunStageDeps,
  definition: StageDefinition<T>,
  projectId: string,
): Promise<StageRunOutcome<T>> {
  const { db, runner, clock } = deps;
  const prompt = definition.buildPrompt({ db, projectId });

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
    const checked = check(definition, result.result);

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
