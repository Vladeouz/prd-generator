import { systemClock } from '../../../../core/clock.ts';
import { getDb } from '../../../../core/db/client.ts';
import { projectHandlers } from '../../../../projects/handlers.ts';

type Context = { params: Promise<{ id: string }> };

const handlers = () => projectHandlers({ db: getDb(), clock: systemClock });

export async function GET(_request: Request, { params }: Context) {
  return handlers().get((await params).id);
}

export async function DELETE(_request: Request, { params }: Context) {
  return handlers().remove((await params).id);
}
