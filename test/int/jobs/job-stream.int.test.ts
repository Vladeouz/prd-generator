// `GET /api/jobs/{id}/stream` dengan antrean job sungguhan dan runner palsu yang mengirim potongan
// bertahap (FakeClaudeRunner chunkSize/chunkDelayMs).
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ClaudeResult, ClaudeRunner } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { projects } from '../../../src/core/db/schema.ts';
import { jobEventStream } from '../../../src/jobs/event-stream.ts';
import { jobHandlers } from '../../../src/jobs/handlers.ts';
import { type Job, type JobAttempt, JobQueue } from '../../../src/jobs/job-queue.ts';
import { type JobProgress, ProgressStore } from '../../../src/jobs/progress.ts';
import type { StageDefinition } from '../../../src/stages/run-stage.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';

const stage2: StageDefinition<{ questions: unknown[] }> = {
  stage: 'stage2',
  promptVersion: 'test-1',
  buildPrompt: () => 'PROMPT',
  parse: (result) => JSON.parse(result) as { questions: unknown[] },
  validate: (output) => ({
    errors:
      Array.isArray(output.questions) && output.questions.length > 0 ? [] : ['tanpa pertanyaan'],
  }),
};

const fixture = loadClaudeFixture('stage2');
const CHUNK = 200;
const CHUNKS = Math.ceil(fixture.result.length / CHUNK);

let t: TestDb;
let tick = 0;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 21, 0, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  t.db
    .insert(projects)
    .values({
      id: 'p1',
      name: 'p1',
      idea: 'Aplikasi membership untuk sebuah gym.',
      currentStage: 'stage2',
      createdAt: clock(),
      updatedAt: clock(),
    })
    .run();
});
afterEach(() => t.close());

function queueWith(responses: ClaudeResult[], chunkDelayMs = 15) {
  const runner = new FakeClaudeRunner(responses, { chunkSize: CHUNK, chunkDelayMs });
  return new JobQueue({
    db: t.db,
    runner,
    clock,
    stages: { stage2 },
    progress: new ProgressStore(),
  });
}

type Event = { event: string; data: unknown };

/** Membaca seluruh event SSE sampai stream ditutup server. */
async function readEvents(body: ReadableStream<Uint8Array>): Promise<Event[]> {
  const text = await new Response(body).text();
  return text
    .split('\n\n')
    .filter((block) => block.startsWith('event: '))
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n');
      return {
        event: eventLine?.slice('event: '.length) ?? '',
        data: JSON.parse(dataLine?.slice('data: '.length) ?? 'null'),
      };
    });
}

async function until(condition: () => boolean, timeoutMs = 5000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('kondisi tidak tercapai');
    await sleep(5);
  }
}

describe('GET /api/jobs/{id}/stream', () => {
  it('mengirim progress (karakter dan cuplikan bertambah) lalu satu done berisi Job', async () => {
    const queue = queueWith([fixture], 40);
    const job = queue.start('p1', 'stage2');
    const response = await jobHandlers(queue).stream(job.id);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const events = await readEvents(response.body as ReadableStream<Uint8Array>);

    const progress = events.filter((e) => e.event === 'progress').map((e) => e.data as JobProgress);
    expect(progress.length).toBeGreaterThan(1);
    // Dibatasi: jauh lebih sedikit event daripada potongan dari runner.
    expect(progress.length).toBeLessThan(CHUNKS + 2);
    const chars = progress.map((p) => p.chars);
    expect(chars).toEqual([...chars].sort((a, b) => a - b));
    expect(chars.some((c) => c > 0 && c < fixture.result.length)).toBe(true);
    expect(progress.at(-1)?.preview).toBe(fixture.result.slice(-400));
    expect(progress.every((p) => p.attempt === 1)).toBe(true);

    expect(events.at(-1)?.event).toBe('done');
    expect(events.filter((e) => e.event === 'done')).toHaveLength(1);
    const done = events.at(-1)?.data as Job & { attempts: JobAttempt[] };
    expect(done).toMatchObject({ id: job.id, status: 'succeeded' });
    expect(done.attempts).toEqual([{ attempt: 1, status: 'succeeded', errors: [] }]);
    // Progres dihapus setelah job selesai.
    expect(queue.progress.get(job.id)).toBeUndefined();
  });

  it('tersambung di tengah job (halaman dibuka ulang): progres terkini langsung dikirim', async () => {
    // Runner yang mengirim dua potongan lalu berhenti sampai dilepas: selama berhenti, satu-satunya
    // event yang bisa diterima adalah progres yang sudah ada saat tersambung.
    let release = () => {};
    const paused: ClaudeRunner = {
      async run(_prompt, options) {
        options?.onProgress?.({ kind: 'text', text: 'satu ', chars: 5 });
        options?.onProgress?.({ kind: 'text', text: 'dua', chars: 8 });
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return fixture;
      },
    };
    const queue = new JobQueue({
      db: t.db,
      runner: paused,
      clock,
      stages: { stage2 },
      progress: new ProgressStore(),
    });
    const job = queue.start('p1', 'stage2');
    await until(() => queue.progress.get(job.id)?.chars === 8);

    const reader = jobEventStream(queue, job.id).getReader();
    const first = await Promise.race([
      reader.read(),
      sleep(1000).then(() => ({ value: undefined, done: true })),
    ]);
    const text = new TextDecoder().decode(first.value);
    expect(text.startsWith('event: progress\n')).toBe(true);
    expect(JSON.parse(text.split('data: ')[1] ?? '')).toMatchObject({
      chars: 8,
      preview: 'satu dua',
    });

    release();
    let rest = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      rest += new TextDecoder().decode(chunk.value);
    }
    expect(rest).toContain('event: done\n');
  });

  it('job yang sudah selesai: langsung done tanpa progress', async () => {
    const queue = queueWith([fixture], 0);
    const job = queue.start('p1', 'stage2');
    await queue.waitFor(job.id);
    const events = await readEvents(jobEventStream(queue, job.id));
    expect(events).toEqual([
      expect.objectContaining({
        event: 'done',
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    ]);
  });

  it('percobaan ulang: progres percobaan 2 mulai dari nol', async () => {
    const invalid = { ...fixture, result: JSON.stringify({ questions: [], isi: 'x'.repeat(600) }) };
    const queue = queueWith([invalid, fixture], 10);
    const job = queue.start('p1', 'stage2');
    const events = await readEvents(jobEventStream(queue, job.id, { throttleMs: 0 }));
    const progress = events.filter((e) => e.event === 'progress').map((e) => e.data as JobProgress);
    const second = progress.findIndex((p) => p.attempt === 2);
    expect(second).toBeGreaterThan(0);
    expect(progress[second]?.chars).toBe(0);
    expect(progress[second - 1]?.chars).toBeGreaterThan(0);
    const done = events.at(-1)?.data as Job & { attempts: JobAttempt[] };
    expect(done.attempts.map((a) => a.status)).toEqual(['failed', 'succeeded']);
  });

  it('koneksi ditutup klien: berhenti berlangganan, job tetap selesai', async () => {
    const queue = queueWith([fixture], 20);
    const job = queue.start('p1', 'stage2');
    const controller = new AbortController();
    const response = await jobHandlers(queue).stream(job.id, controller.signal);
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    controller.abort();
    await reader.cancel();
    expect((await queue.waitFor(job.id))?.status).toBe('succeeded');
  });

  it('polling GET /api/jobs/{id} tetap berfungsi sebagai cadangan', async () => {
    const queue = queueWith([fixture]);
    const job = queue.start('p1', 'stage2');
    await queue.waitFor(job.id);
    const response = await jobHandlers(queue).get(job.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: job.id, status: 'succeeded' });
  });

  it('job tidak ada → 404', async () => {
    const response = await jobHandlers(queueWith([])).stream('tidak-ada');
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });
});
