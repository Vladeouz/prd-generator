import { systemClock } from '../../../../../core/clock.ts';
import { getDb } from '../../../../../core/db/client.ts';
import { featureHandlers } from '../../../../../stages/stage-4/feature-handlers.ts';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  return featureHandlers({ db: getDb(), clock: systemClock }).save(request, (await params).id);
}
