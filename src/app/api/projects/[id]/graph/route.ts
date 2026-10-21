import { getDb } from '../../../../../core/db/client.ts';
import { graphHandlers } from '../../../../../projects/graph.ts';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  return graphHandlers({ db: getDb() }).get(id);
}
