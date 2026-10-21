import { jobHandlers } from '../../../../../jobs/handlers.ts';
import { getJobQueue } from '../../../../../jobs/instance.ts';

// Stream bergantung pada job yang sedang berjalan di proses ini; tidak pernah di-cache.
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return jobHandlers(getJobQueue()).stream((await params).id, request.signal);
}
