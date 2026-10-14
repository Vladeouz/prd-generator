// Isi route handler `POST /api/projects/{id}/stages/{stage}/run` dan `GET /api/jobs/{id}`.
import { STAGES } from '../core/db/schema.ts';
import { AppError } from '../core/errors.ts';
import { handle } from '../core/http.ts';
import type { Stage } from '../stages/run-stage.ts';
import type { JobQueue } from './job-queue.ts';

export function parseStage(value: string): Stage {
  if (!(STAGES as readonly string[]).includes(value)) {
    throw new AppError('BAD_REQUEST', `Tahap tidak dikenal: ${value}.`);
  }
  return value as Stage;
}

export function jobHandlers(queue: JobQueue) {
  return {
    /** → 202 Job; 409 bila ada job lain berjalan atau tahap sebelumnya belum selesai. */
    run: (projectId: string, stage: string) =>
      handle(() => Response.json(queue.start(projectId, parseStage(stage)), { status: 202 })),

    /** → 200 Job beserta `attempts` (dipakai UI untuk polling); 404 bila tidak ada. */
    get: (id: string) =>
      handle(() => {
        const job = queue.getJob(id);
        if (!job) throw new AppError('NOT_FOUND', 'Job tidak ditemukan.');
        return Response.json({ ...job, attempts: queue.attempts(job) });
      }),
  };
}
