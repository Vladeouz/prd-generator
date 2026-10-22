// Eksekusi satu tahap secara generik (FR-02, D-08), diturunkan dari `runStage` di
// docs/reference/e2e-gym.mjs:
// - output yang gagal parse atau validasi dicoba ulang SEKALI dengan daftar error-nya;
// - setiap percobaan dicatat di stage_runs (versi prompt, model dan effort profil tahap, output
//   mentah, token, biaya, durasi);
// - hanya percobaan yang valid yang menjadi `is_current = 1`, menggantikan output tahap itu
//   sebelumnya dalam satu transaksi;
// - kegagalan runner (exit code, batas waktu, envelope rusak, is_error) tidak dicoba ulang dan
//   tidak menyimpan output apa pun.
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  type ClaudeResult,
  ClaudeRunError,
  type ClaudeRunner,
  type ClaudeRunOptions,
} from '../claude/types.ts';
import type { Clock } from '../core/clock.ts';
import {
  type ClaudeProfile,
  type ClaudeProfileConfig,
  claudeProfile,
} from '../core/config/claude.ts';
import type { Db } from '../core/db/client.ts';
import {
  DOCUMENT_KINDS,
  decisions,
  documents,
  type RUN_STAGES,
  STAGES,
  stageRuns,
} from '../core/db/schema.ts';
import { brandedInstanceCheck } from '../core/errors.ts';
import { MAX_ATTEMPTS } from './attempts.ts';

export type Stage = (typeof STAGES)[number];
/** Tahap di `stage_runs`: `stage7` dipecah menjadi `stage7a` dan `stage7b` (D-11). */
export type RunStage = (typeof RUN_STAGES)[number];

/** Tahap `stage_runs` milik tahap job: `stage7` → `stage7a` dan `stage7b`, lainnya sama. */
export function runStagesOf(stage: Stage): RunStage[] {
  return stage === 'stage7' ? ['stage7a', 'stage7b'] : [stage];
}

/** Tahap job pemilik run: kebalikan `runStagesOf`. */
export function stageOfRun(stage: RunStage): Stage {
  return stage === 'stage7a' || stage === 'stage7b' ? 'stage7' : stage;
}

export type StageContext = { db: Db; projectId: string };

/** Transaksi Drizzle di dalam `db.transaction`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type StageValidation = { errors: string[]; warnings?: string[] };

export type StageDefinition<T = unknown> = {
  /** Tahap job (kunci registry dan `jobs.stage`). */
  stage: Stage;
  /** Tahap yang dicatat di `stage_runs`; bawaan sama dengan `stage` (wajib diisi untuk `stage7`). */
  runStage?: RunStage;
  /** `stage_runs.scope`: nomor fase untuk `stage7b`; bawaan null. */
  scope?: string | null;
  /** `version` dari front matter prompt di prompts/. */
  promptVersion: string;
  /** Profil model dan effort (D-14), dari `STAGE_PROFILES`. */
  profile: ClaudeProfile;
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

/** Kondisi `stage_runs.scope`: sama dengan `scope`, atau NULL bila `scope` null. */
const scopeIs = (scope: string | null) =>
  scope === null ? isNull(stageRuns.scope) : eq(stageRuns.scope, scope);

/** Output tahap (dan scope) yang sedang berlaku (`is_current = 1`), atau null bila belum ada. */
export function currentOutput<T>(
  db: Db,
  projectId: string,
  stage: RunStage,
  scope: string | null = null,
): T | null {
  const run = db
    .select({ outputJson: stageRuns.outputJson })
    .from(stageRuns)
    .where(
      and(
        eq(stageRuns.projectId, projectId),
        eq(stageRuns.stage, stage),
        scopeIs(scope),
        eq(stageRuns.isCurrent, 1),
      ),
    )
    .get();
  return run?.outputJson ? (JSON.parse(run.outputJson) as T) : null;
}

/** Tahap yang menghasilkan dokumen; dokumen ikut tidak berlaku bila tahap sebelumnya dijalankan ulang. */
export const DOCUMENT_STAGES = { prd: 'stage6', tasks: 'stage7' } as const satisfies Record<
  (typeof DOCUMENT_KINDS)[number],
  Stage
>;

/**
 * Menjalankan ulang sebuah tahap (PRD bagian 5, FR-10): output tahap-tahap sesudahnya tidak berlaku
 * lagi (`is_current = 0`) dan dokumen yang dihasilkan tahap sesudahnya dihapus. Keputusan review
 * kedua ikut dihapus bila tahap sebelum PRD dijalankan ulang, karena PRD-nya akan ditulis ulang
 * dari awal. Run tahap 6 sendiri (termasuk penulisan ulang setelah review kedua) mempertahankan
 * keputusan itu. Jawaban, pilihan fitur, dan keputusan lain diganti oleh `onSuccess` tahapnya saat
 * tahap itu dijalankan lagi; prasyarat tiap tahap memastikan tahap yang tidak berlaku dijalankan
 * ulang dulu.
 */
export function invalidateLaterStages(tx: Tx, projectId: string, stage: Stage) {
  const later = STAGES.slice(STAGES.indexOf(stage) + 1);
  if (later.length === 0) return;
  tx.update(stageRuns)
    .set({ isCurrent: 0 })
    .where(
      and(
        eq(stageRuns.projectId, projectId),
        inArray(stageRuns.stage, later.flatMap(runStagesOf)),
        eq(stageRuns.isCurrent, 1),
      ),
    )
    .run();
  const kinds = DOCUMENT_KINDS.filter((kind) =>
    (later as readonly Stage[]).includes(DOCUMENT_STAGES[kind]),
  );
  if (kinds.length > 0) {
    tx.delete(documents)
      .where(and(eq(documents.projectId, projectId), inArray(documents.kind, kinds)))
      .run();
  }
  if (STAGES.indexOf(stage) < STAGES.indexOf('stage6')) {
    tx.delete(decisions)
      .where(and(eq(decisions.projectId, projectId), eq(decisions.origin, 'review2')))
      .run();
  }
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

export type RunStageDeps = {
  db: Db;
  runner: ClaudeRunner;
  clock: Clock;
  /** Dipanggil di awal setiap percobaan (D-08), sebelum runner dipanggil. */
  onAttempt?: (attempt: number) => void;
  /** Potongan stream dari runner (D-12), diteruskan apa adanya. */
  onProgress?: ClaudeRunOptions['onProgress'];
  /** Langkah ke-`step` dari `totalSteps` dimulai, untuk tahap berlangkah (tahap 7: 7a lalu detail fase). */
  onStep?: (step: number, totalSteps: number) => void;
  /** Detail fase tahap 7 yang berjalan bersamaan (T-033): `done` selesai dan `failed` gagal dari `total`. */
  onPhases?: (done: number, total: number, failed: number) => void;
  /** Model dan effort per profil; bawaan dari env saat tahap dijalankan (`claudeProfile`). */
  profiles?: (profile: ClaudeProfile) => ClaudeProfileConfig;
};

/**
 * Tahap yang dijalankan sebagai beberapa pemanggilan dalam satu job (tahap 7, D-11): setiap
 * pemanggilan tetap lewat `runStage` dengan definisinya sendiri, sehingga tercatat di `stage_runs`
 * dan dicoba ulang sendiri-sendiri.
 */
export type StageJob = {
  stage: Stage;
  notReadyReason?(context: StageContext): string | null;
  execute(deps: RunStageDeps, projectId: string): Promise<void>;
};

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
  if (definition.stage === 'stage7' && !definition.runStage) {
    throw new Error('Definisi tahap 7 wajib mengisi runStage (stage7a atau stage7b).');
  }
  const runStage = definition.runStage ?? (definition.stage as RunStage);
  const scope = definition.scope ?? null;
  // Env yang tidak valid menggagalkan tahap sebelum prompt dibuat dan `claude` dipanggil (FR-11).
  const { model, effort, problems } = (deps.profiles ?? claudeProfile)(definition.profile);
  if (problems.length > 0) {
    throw new StageFailedError(
      `Pengaturan model profil ${definition.profile} belum valid, jadi tahap ini belum bisa dijalankan: ${problems.join(' ')} Perbaiki di .env, lalu jalankan ulang server.`,
    );
  }
  // `await` hanya untuk prompt async: prompt sinkron tetap dikirim ke runner pada tick yang sama.
  const built = definition.buildPrompt({ db, projectId });
  const prompt = typeof built === 'string' ? built : await built;

  let currentPrompt = prompt;
  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const createdAt = clock();
    const base = {
      projectId,
      stage: runStage,
      scope,
      attempt,
      promptVersion: definition.promptVersion,
      model,
      effort,
      createdAt,
    };

    let result: ClaudeResult;
    try {
      deps.onAttempt?.(attempt);
      result = await runner.run(currentPrompt, { model, effort, onProgress: deps.onProgress });
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

    // Log server: model yang diminta profil dan model yang dilaporkan Claude Code di event `init`
    // (verifikasi manual T-035). Runner palsu tidak punya event `init`.
    if (result.initModel) {
      const label = scope === null ? runStage : `${runStage} fase ${scope}`;
      console.info(
        `[${label}] profil ${definition.profile}: diminta ${model} (effort ${effort}), Claude Code memakai ${result.initModel}.`,
      );
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
              eq(stageRuns.stage, runStage),
              scopeIs(scope),
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
        invalidateLaterStages(tx, projectId, definition.stage);
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
