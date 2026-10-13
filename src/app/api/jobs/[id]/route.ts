import { jobHandlers } from '../../../../jobs/handlers.ts';
import { getJobQueue } from '../../../../jobs/instance.ts';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return jobHandlers(getJobQueue()).get((await params).id);
}
