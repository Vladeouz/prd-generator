// Spike T-002, dihapus bersama spikes/ di T-019.
import { listHandler, startHandler } from '../../../../../spikes/jobs/handlers.ts';

export function GET() {
  return listHandler();
}

export function POST(request: Request) {
  return startHandler(request);
}
