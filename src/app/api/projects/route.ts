import { systemClock } from '../../../core/clock.ts';
import { getDb } from '../../../core/db/client.ts';
import { projectHandlers } from '../../../projects/handlers.ts';

const handlers = () => projectHandlers({ db: getDb(), clock: systemClock });

export function GET() {
  return handlers().list();
}

export function POST(request: Request) {
  return handlers().create(request);
}
