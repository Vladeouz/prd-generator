// Isi route handler `PUT /api/projects/{id}/answers/{stage}`.
import type { Clock } from '../core/clock.ts';
import type { Db } from '../core/db/client.ts';
import { handle, parseBody } from '../core/http.ts';
import { parseStage } from '../jobs/handlers.ts';
import { saveAnswers, saveAnswersSchema } from './answers.ts';

export function answerHandlers(deps: { db: Db; clock: Clock }) {
  return {
    /** → 200 `{ answers }`; 422 bila jawaban tidak cocok dengan pertanyaan. */
    save: (request: Request, projectId: string, stage: string) =>
      handle(async () => {
        const input = await parseBody(request, saveAnswersSchema);
        return Response.json({ answers: saveAnswers(deps, projectId, parseStage(stage), input) });
      }),
  };
}
