import { systemClock } from '../../../../../../core/clock.ts';
import { getDb } from '../../../../../../core/db/client.ts';
import { getJobQueue } from '../../../../../../jobs/instance.ts';
import { decisionHandlers } from '../../../../../../stages/stage-5/decision-handlers.ts';

type Context = { params: Promise<{ id: string; origin: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { id, origin } = await params;
  return decisionHandlers({ db: getDb(), clock: systemClock, queue: getJobQueue() }).save(
    request,
    id,
    origin,
  );
}
