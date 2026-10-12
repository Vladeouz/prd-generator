// Spike T-002: isi route handler, di-re-export oleh src/app/api/spike/jobs/**.
import {
  getStore,
  listJobs,
  moduleId,
  moduleLoadedAt,
  SpikeJobConflict,
  startJob,
} from './job-store.ts';

function meta() {
  const store = getStore();
  return {
    serverPid: process.pid,
    moduleId,
    moduleLoadedAt,
    storeCreatedAt: store.createdAt,
    storeCreatedByModule: store.createdByModule,
  };
}

export async function listHandler() {
  return Response.json({ ...meta(), jobs: listJobs() });
}

export async function startHandler(request: Request) {
  const seconds = Number(new URL(request.url).searchParams.get('seconds') ?? 180);
  try {
    return Response.json({ ...meta(), job: startJob(seconds) }, { status: 202 });
  } catch (error) {
    if (error instanceof SpikeJobConflict) {
      return Response.json(
        { error: { code: 'CONFLICT', message: error.message } },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function getHandler(id: string) {
  const job = getStore().jobs.get(id);
  if (!job) {
    return Response.json(
      { error: { code: 'NOT_FOUND', message: 'Job tidak ditemukan.' } },
      { status: 404 },
    );
  }
  return Response.json({ ...meta(), job });
}
