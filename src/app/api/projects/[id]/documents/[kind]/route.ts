import { getDb } from '../../../../../../core/db/client.ts';
import { exportHandlers } from '../../../../../../projects/export-handlers.ts';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string; kind: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id, kind } = await params;
  return exportHandlers({ db: getDb() }).document(request, id, kind);
}
