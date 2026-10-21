// `GET /api/jobs/{id}/stream` (PRD bagian 5, D-12): Server-Sent Events untuk satu job.
// - Saat tersambung, progres terkini langsung dikirim, sehingga halaman yang dibuka ulang di tengah
//   job tidak mulai dari nol.
// - Event `progress` dibatasi paling sering sekali per `PROGRESS_THROTTLE_MS` (potongan stream bisa
//   ribuan per pemanggilan); yang dikirim selalu keadaan terbaru.
// - Satu event `done` berisi `Job` beserta `attempts`, lalu stream ditutup. Job yang sudah selesai
//   saat tersambung langsung mendapat `done`.
// Polling `GET /api/jobs/{id}` tetap ada sebagai cadangan.
import type { Job, JobQueue } from './job-queue.ts';
import type { JobProgress } from './progress.ts';

export const PROGRESS_THROTTLE_MS = 300;
export const HEARTBEAT_MS = 15_000;

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const isActive = (job: Job | undefined) =>
  job !== undefined && (job.status === 'queued' || job.status === 'running');

export type EventStreamOptions = {
  signal?: AbortSignal;
  throttleMs?: number;
  heartbeatMs?: number;
};

/** Body SSE untuk job yang ada; pemanggil memastikan job-nya ada (404 bila tidak). */
export function jobEventStream(
  queue: Pick<JobQueue, 'getJob' | 'attempts' | 'progress'>,
  id: string,
  {
    signal,
    throttleMs = PROGRESS_THROTTLE_MS,
    heartbeatMs = HEARTBEAT_MS,
  }: EventStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let stop = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let pending: JobProgress | null = null;
      let lastSent = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const flush = () => {
        clearTimeout(timer);
        timer = undefined;
        if (!pending) return;
        send(sseEvent('progress', pending));
        pending = null;
        lastSent = Date.now();
      };
      const onProgress = (progress: JobProgress) => {
        pending = progress;
        const wait = throttleMs - (Date.now() - lastSent);
        if (wait <= 0) flush();
        else timer ??= setTimeout(flush, wait);
      };
      const done = () => {
        if (closed) return;
        flush();
        const job = queue.getJob(id);
        if (job) send(sseEvent('done', { ...job, attempts: queue.attempts(job) }));
        stop();
        try {
          controller.close();
        } catch {}
      };

      // Berlangganan dulu, baru memeriksa status: job yang selesai di antaranya tetap mendapat `done`.
      const unsubscribe = queue.progress.subscribe(id, (event) =>
        event.type === 'done' ? done() : onProgress(event.progress),
      );
      const heartbeat = setInterval(() => send(': tetap tersambung\n\n'), heartbeatMs);
      stop = () => {
        closed = true;
        clearTimeout(timer);
        clearInterval(heartbeat);
        unsubscribe();
        signal?.removeEventListener('abort', stop);
      };
      signal?.addEventListener('abort', stop);

      if (!isActive(queue.getJob(id))) {
        done();
        return;
      }
      const current = queue.progress.get(id);
      if (current) onProgress(current);
    },
    cancel() {
      stop();
    },
  });
}
