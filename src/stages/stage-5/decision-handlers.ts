// Isi route handler `PUT /api/projects/{id}/decisions/{origin}`.
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { AppError } from '../../core/errors.ts';
import { handle, parseBody } from '../../core/http.ts';
import { CONFLICT_MESSAGE, type JobQueue } from '../../jobs/job-queue.ts';
import { saveDecisionsSchema, saveReviewDecisions } from './decisions.ts';

export type DecisionDeps = {
  db: Db;
  clock: Clock;
  /** Antrean untuk menulis ulang PRD setelah perbaikan review kedua. */
  queue?: Pick<JobQueue, 'start' | 'activeJob'>;
};

export function decisionHandlers(deps: DecisionDeps) {
  return {
    /**
     * → 200 `{ decisions, currentStage, regenerate, job }`; 422 bila opsi atau temuan tidak ada;
     * 409 bila review kedua memilih perbaikan selagi job lain berjalan (tidak ada yang disimpan).
     */
    save: (request: Request, projectId: string, origin: string) =>
      handle(async () => {
        const input = await parseBody(request, saveDecisionsSchema);
        const active = origin === 'review2' ? deps.queue?.activeJob() : undefined;
        if (active) throw new AppError('CONFLICT', CONFLICT_MESSAGE, { activeJobId: active.id });
        const result = saveReviewDecisions(deps, projectId, origin, input);
        if (result.regenerate && !deps.queue) {
          throw new AppError('INTERNAL_ERROR', 'Antrean job tidak tersedia.');
        }
        const job = result.regenerate ? (deps.queue?.start(projectId, 'stage6') ?? null) : null;
        return Response.json({ ...result, job });
      }),
  };
}
