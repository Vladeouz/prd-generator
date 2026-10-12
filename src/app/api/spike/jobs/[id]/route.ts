// Spike T-002, dihapus bersama spikes/ di T-019.
import { getHandler } from '../../../../../../spikes/jobs/handlers';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return getHandler((await params).id);
}
