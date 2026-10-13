// Isi route handler `PUT /api/projects/{id}/profile`.
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { handle, parseBody } from '../../core/http.ts';
import { chooseProfile, chooseProfileSchema } from './profile.ts';

export function profileHandlers(deps: { db: Db; clock: Clock }) {
  return {
    /** → 200 `{ profileChoice, currentStage, decision }`; 422 bila pilihan tidak tersedia. */
    choose: (request: Request, projectId: string) =>
      handle(async () => {
        const input = await parseBody(request, chooseProfileSchema);
        return Response.json(chooseProfile(deps, projectId, input));
      }),
  };
}
