// Isi route handler `PUT /api/projects/{id}/decisions/{origin}`.
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { handle, parseBody } from '../../core/http.ts';
import { saveDecisionsSchema, saveReviewDecisions } from './decisions.ts';

export function decisionHandlers(deps: { db: Db; clock: Clock }) {
  return {
    /** → 200 `{ decisions, currentStage }`; 422 bila opsi atau temuan tidak ada. */
    save: (request: Request, projectId: string, origin: string) =>
      handle(async () => {
        const input = await parseBody(request, saveDecisionsSchema);
        return Response.json(saveReviewDecisions(deps, projectId, origin, input));
      }),
  };
}
