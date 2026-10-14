import { getDb } from '../../../../../core/db/client.ts';
import { exportHandlers } from '../../../../../projects/export-handlers.ts';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return exportHandlers({ db: getDb() }).export(request, (await params).id);
}
