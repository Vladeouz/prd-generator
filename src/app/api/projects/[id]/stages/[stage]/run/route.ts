import { jobHandlers } from '../../../../../../../jobs/handlers.ts';
import { getJobQueue } from '../../../../../../../jobs/instance.ts';

type Context = { params: Promise<{ id: string; stage: string }> };

export async function POST(_request: Request, { params }: Context) {
  const { id, stage } = await params;
  return jobHandlers(getJobQueue()).run(id, stage);
}
