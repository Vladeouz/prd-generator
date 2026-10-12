// Antrean job di proses server Next.js (D-03, rekomendasi spike T-002):
// - satu job `queued`/`running` di seluruh aplikasi; dijamin partial unique index
//   `jobs_one_active_idx`, dan pemeriksaan + insert berjalan sinkron (better-sqlite3) sehingga dua
//   permintaan bersamaan tidak bisa sama-sama lolos;
// - job tidak terikat ke request: `start` langsung kembali, eksekusi berjalan di latar belakang;
// - saat server start, job yang masih `queued`/`running` ditandai `interrupted`
//   (`markInterrupted`, dipanggil sekali per proses lewat src/instrumentation.ts), karena proses
//   anaknya selalu ikut mati bersama server di Windows.
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { ClaudeRunner } from '../claude/types.ts';
import type { Clock } from '../core/clock.ts';
import type { Db } from '../core/db/client.ts';
import { ACTIVE_JOB_STATUSES, jobs } from '../core/db/schema.ts';
import { AppError } from '../core/errors.ts';
import {
  runStage,
  type Stage,
  type StageDefinition,
  StageFailedError,
} from '../stages/run-stage.ts';

export type Job = typeof jobs.$inferSelect;

export type StageRegistry = Partial<Record<Stage, StageDefinition>>;

export type JobQueueDeps = {
  db: Db;
  runner: ClaudeRunner;
  clock: Clock;
  stages: StageRegistry;
};

export const CONFLICT_MESSAGE =
  'Masih ada tahap lain yang berjalan. Hanya satu tahap yang bisa berjalan dalam satu waktu; tunggu sampai selesai.';
export const INTERRUPTED_MESSAGE =
  'Server berhenti saat tahap ini berjalan. Jalankan tahap ini lagi.';

const sqliteCode = (error: unknown) => (error as { code?: string }).code ?? '';

export class JobQueue {
  private readonly deps: JobQueueDeps;
  private readonly running = new Map<string, Promise<void>>();

  constructor(deps: JobQueueDeps) {
    this.deps = deps;
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
      await runStage(this.deps, definition, projectId);
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
    }
  }
}
