// Isi route handler `PUT /api/projects/{id}/features`.
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { handle, parseBody } from '../../core/http.ts';
import { saveFeatureChoices, saveFeaturesSchema } from './features.ts';

export function featureHandlers(deps: { db: Db; clock: Clock }) {
  return {
    /** → 200 `{ accepted, currentStage }`; 422 bila kode fitur tidak ada di rekomendasi. */
    save: (request: Request, projectId: string) =>
      handle(async () => {
        const input = await parseBody(request, saveFeaturesSchema);
        return Response.json(saveFeatureChoices(deps, projectId, input));
      }),
  };
}
