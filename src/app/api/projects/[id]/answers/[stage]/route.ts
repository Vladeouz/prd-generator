import { systemClock } from '../../../../../../core/clock.ts';
import { getDb } from '../../../../../../core/db/client.ts';
import { answerHandlers } from '../../../../../../stages/answers-handlers.ts';

type Context = { params: Promise<{ id: string; stage: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { id, stage } = await params;
  return answerHandlers({ db: getDb(), clock: systemClock }).save(request, id, stage);
}
