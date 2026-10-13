import { systemClock } from '../../../../../core/clock.ts';
import { getDb } from '../../../../../core/db/client.ts';
import { profileHandlers } from '../../../../../stages/stage-3/profile-handlers.ts';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  return profileHandlers({ db: getDb(), clock: systemClock }).choose(request, (await params).id);
}
