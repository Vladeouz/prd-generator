// Antrean job di proses server Next.js (D-03, rekomendasi spike T-002):
// - satu job `queued`/`running` di seluruh aplikasi; dijamin partial unique index
//   `jobs_one_active_idx`, dan pemeriksaan + insert berjalan sinkron (better-sqlite3) sehingga dua
//   permintaan bersamaan tidak bisa sama-sama lolos;
// - job tidak terikat ke request: `start` langsung kembali, eksekusi berjalan di latar belakang;
// - saat server start, job yang masih `queued`/`running` ditandai `interrupted`
//   (`markInterrupted`, dipanggil sekali per proses lewat src/instrumentation.ts), karena proses
//   anaknya selalu ikut mati bersama server di Windows;
// - progres terakhir job yang berjalan (potongan stream runner) disimpan di `ProgressStore` di
//   memori (D-12) dan dihapus saat job selesai, setelah statusnya tertulis di database.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import type { ClaudeRunner } from '../claude/types.ts';
import type { Clock } from '../core/clock.ts';
import type { Db } from '../core/db/client.ts';
import { ACTIVE_JOB_STATUSES, jobs, projects, stageRuns } from '../core/db/schema.ts';
import { AppError } from '../core/errors.ts';
import {
  runStage,
  type Stage,
  type StageDefinition,
  StageFailedError,
} from '../stages/run-stage.ts';
import { type ProgressStore, sharedProgressStore } from './progress.ts';

export type Job = typeof jobs.$inferSelect;

/** Percobaan sebuah job (FR-02, D-08): untuk menampilkan percobaan ulang beserta alasannya. */
export type JobAttempt = { attempt: number; status: 'succeeded' | 'failed'; errors: string[] };

export type StageRegistry = Partial<Record<Stage, StageDefinition>>;

export type JobQueueDeps = {
  db: Db;
  runner: ClaudeRunner;
  clock: Clock;
  stages: StageRegistry;
  /** Bawaan: store bersama di globalThis. Test memberi store sendiri. */
  progress?: ProgressStore;
};

export const CONFLICT_MESSAGE =
  'Masih ada tahap lain yang berjalan. Hanya satu tahap yang bisa berjalan dalam satu waktu; tunggu sampai selesai.';
export const INTERRUPTED_MESSAGE =
  'Server berhenti saat tahap ini berjalan. Jalankan tahap ini lagi.';

const sqliteCode = (error: unknown) => (error as { code?: string }).code ?? '';

export class JobQueue {
  private deps: JobQueueDeps;
  private readonly running = new Map<string, Promise<void>>();
  readonly progress: ProgressStore;

  constructor(deps: JobQueueDeps) {
    this.deps = deps;
    this.progress = deps.progress ?? sharedProgressStore();
  }

  /** Mengganti definisi tahap untuk job berikutnya; job yang sedang berjalan tidak terpengaruh. */
  setStages(stages: StageRegistry) {
    this.deps = { ...this.deps, stages };
  }

  /** Menandai job aktif dari proses server sebelumnya sebagai `interrupted`; mengembalikan jumlahnya. */
  markInterrupted(): number {
    const { db, clock } = this.deps;
    return db
      .update(jobs)
      .set({ status: 'interrupted', error: INTERRUPTED_MESSAGE, finishedAt: clock() })
      .where(inArray(jobs.status, [...ACTIVE_JOB_STATUSES]))
      .run().changes;
  }

  getJob(id: string): Job | undefined {
    return this.deps.db.select().from(jobs).where(eq(jobs.id, id)).get();
  }

  /**
   * Percobaan yang sudah selesai untuk job ini. `stage_runs` tidak menyimpan id job, jadi dikenali
   * dari proyek, tahap, dan waktu mulai job; aman karena hanya satu job aktif dalam satu waktu.
   */
  attempts(job: Job): JobAttempt[] {
    const since = job.startedAt ?? job.createdAt;
    return this.deps.db
      .select({
        attempt: stageRuns.attempt,
        status: stageRuns.status,
        errorsJson: stageRuns.errorsJson,
        createdAt: stageRuns.createdAt,
      })
      .from(stageRuns)
      .where(
        and(
          eq(stageRuns.projectId, job.projectId),
          eq(stageRuns.stage, job.stage),
          gte(stageRuns.createdAt, since),
        ),
      )
      .orderBy(asc(stageRuns.createdAt))
      .all()
      .filter((run) => !job.finishedAt || run.createdAt <= job.finishedAt)
      .map((run) => ({
        attempt: run.attempt,
        status: run.status,
        errors: run.errorsJson ? (JSON.parse(run.errorsJson) as string[]) : [],
      }));
  }

  /** Job yang sedang `queued`/`running`, bila ada. */
  activeJob(): Job | undefined {
    return this.deps.db
      .select()
      .from(jobs)
      .where(inArray(jobs.status, [...ACTIVE_JOB_STATUSES]))
      .get();
  }

  /**
   * Memulai tahap `stage` untuk proyek `projectId` di latar belakang dan mengembalikan job-nya.
   * `CONFLICT` (409) bila ada job aktif, `NOT_FOUND` bila proyek tidak ada, `BAD_REQUEST` bila
   * tahap belum tersedia.
   */
  start(projectId: string, stage: Stage): Job {
    const { db, clock } = this.deps;
    const definition = this.deps.stages[stage];
    if (!definition) {
      throw new AppError('BAD_REQUEST', `Tahap ${stage} belum tersedia.`);
    }

    const id = randomUUID();
    try {
      db.transaction((tx) => {
        const active = tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(inArray(jobs.status, [...ACTIVE_JOB_STATUSES]))
          .get();
        if (active) throw new AppError('CONFLICT', CONFLICT_MESSAGE, { activeJobId: active.id });
        const project = tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, projectId))
          .get();
        if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
        const notReady = definition.notReadyReason?.({ db, projectId });
        if (notReady) throw new AppError('CONFLICT', notReady);
        tx.insert(jobs)
          .values({ id, projectId, stage, status: 'queued', createdAt: clock() })
          .run();
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (sqliteCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new AppError('CONFLICT', CONFLICT_MESSAGE);
      }
      if (sqliteCode(error) === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
      }
      throw error;
    }

    const execution = this.execute(id, projectId, definition).finally(() =>
      this.running.delete(id),
    );
    this.running.set(id, execution);
    return this.getJob(id) as Job;
  }

  /** Menunggu eksekusi job di proses ini selesai (untuk test dan shutdown). */
  async waitFor(id: string): Promise<Job | undefined> {
    await this.running.get(id);
    return this.getJob(id);
  }

  private async execute(id: string, projectId: string, definition: StageDefinition) {
    const { db, clock } = this.deps;
    const finish = (status: 'succeeded' | 'failed', error: string | null = null) =>
      db.update(jobs).set({ status, error, finishedAt: clock() }).where(eq(jobs.id, id)).run();

    try {
      db.update(jobs).set({ status: 'running', startedAt: clock() }).where(eq(jobs.id, id)).run();
      await runStage(
        {
          ...this.deps,
          onAttempt: (attempt) => this.progress.startAttempt(id, attempt),
          onProgress: (item) => this.progress.report(id, item),
        },
        definition,
        projectId,
      );
      finish('succeeded');
    } catch (error) {
      const message =
        error instanceof StageFailedError
          ? error.message
          : `Terjadi kesalahan tak terduga: ${(error as Error).message ?? String(error)}`;
      try {
        finish('failed', message);
      } catch {
        // Database tidak bisa diperbarui (misalnya sudah ditutup); job akan ditandai
        // `interrupted` saat server start berikutnya.
      }
    } finally {
      this.progress.finish(id);
    }
  }
}
