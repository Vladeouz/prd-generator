import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { type ClaudeResult, ClaudeRunError, type ClaudeRunner } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { jobs, projects, stageRuns } from '../../../src/core/db/schema.ts';
import { AppError } from '../../../src/core/errors.ts';
import { CONFLICT_MESSAGE, INTERRUPTED_MESSAGE, JobQueue } from '../../../src/jobs/job-queue.ts';
import type { StageDefinition } from '../../../src/stages/run-stage.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';

type Stage2Output = { clarity: number; questions: { id: string; options: string[] }[] };

/** Definisi tahap untuk test: output tahap 2 nyata harus punya minimal satu pertanyaan. */
const stage2: StageDefinition<Stage2Output> = {
  stage: 'stage2',
  promptVersion: 'test-1',
  buildPrompt: ({ projectId }) => `PROMPT AWAL untuk ${projectId}`,
  parse: (result) => JSON.parse(result) as Stage2Output,
  validate: (output) => ({
    errors:
      Array.isArray(output.questions) && output.questions.length > 0
        ? []
        : ['questions harus berisi minimal satu pertanyaan'],
  }),
};

const valid = () => loadClaudeFixture('stage2');
const withResult = (result: string): ClaudeResult => ({ ...valid(), result });

/** Runner yang menahan setiap pemanggilan sampai `release()` dipanggil. */
class GatedRunner implements ClaudeRunner {
  private readonly waiting: (() => void)[] = [];
  async run(): Promise<ClaudeResult> {
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    return valid();
  }
  release() {
    for (const resolve of this.waiting.splice(0)) resolve();
  }
}

let t: TestDb;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 12, 0, 0, tick++)).toISOString();

function queueWith(runner: ClaudeRunner) {
  return new JobQueue({ db: t.db, runner, clock, stages: { stage2 } });
}

function insertProject(id: string) {
  t.db
    .insert(projects)
    .values({
      id,
      name: id,
      idea: 'Aplikasi membership untuk sebuah gym.',
      currentStage: 'stage2',
      createdAt: clock(),
      updatedAt: clock(),
    })
    .run();
  return id;
}

const runsOf = (projectId: string) =>
  t.db
    .select()
    .from(stageRuns)
    .where(eq(stageRuns.projectId, projectId))
    .orderBy(asc(stageRuns.createdAt))
    .all();

function startError(queue: JobQueue, projectId: string): AppError {
  try {
    queue.start(projectId, 'stage2');
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('start tidak gagal');
}

beforeEach(() => {
  t = createTestDb();
  tick = 0;
});
afterEach(() => t.close());

describe('satu job dalam satu waktu', () => {
  it('job kedua ditolak 409 selama job pertama berjalan, juga untuk proyek lain', async () => {
    const runner = new GatedRunner();
    const queue = queueWith(runner);
    const first = queue.start(insertProject('p1'), 'stage2');
    expect(first.status).toBe('running');

    for (const projectId of ['p1', insertProject('p2')]) {
      const error = startError(queue, projectId);
      expect(error.code).toBe('CONFLICT');
      expect(error.status).toBe(409);
      expect(error.message).toBe(CONFLICT_MESSAGE);
      expect(error.toBody()).toEqual({
        error: { code: 'CONFLICT', message: CONFLICT_MESSAGE, details: { activeJobId: first.id } },
      });
    }

    runner.release();
    expect((await queue.waitFor(first.id))?.status).toBe('succeeded');
    const second = queue.start('p2', 'stage2');
    runner.release();
    expect((await queue.waitFor(second.id))?.status).toBe('succeeded');
    expect(t.db.select().from(jobs).all()).toHaveLength(2);
  });

  it('dua antrean pada database yang sama tetap hanya meloloskan satu job aktif', () => {
    const runner = new GatedRunner();
    insertProject('p1');
    queueWith(runner).start('p1', 'stage2');
    expect(startError(queueWith(runner), 'p1').code).toBe('CONFLICT');
  });
});

describe('percobaan ulang (D-08)', () => {
  it('output pertama gagal validasi, percobaan kedua valid dipakai; keduanya tercatat', async () => {
    const runner = new FakeClaudeRunner([withResult('{"clarity": 2, "questions": []}'), valid()]);
    const queue = queueWith(runner);
    const job = queue.start(insertProject('p1'), 'stage2');

    expect(await queue.waitFor(job.id)).toMatchObject({ status: 'succeeded', error: null });
    const [first, second] = runsOf('p1');
    expect(first).toMatchObject({
      attempt: 1,
      status: 'failed',
      isCurrent: 0,
      outputRaw: '{"clarity": 2, "questions": []}',
      outputJson: null,
      errorsJson: JSON.stringify(['questions harus berisi minimal satu pertanyaan']),
    });
    expect(second).toMatchObject({
      attempt: 2,
      status: 'succeeded',
      isCurrent: 1,
      errorsJson: null,
    });
    expect(JSON.parse(second?.outputJson ?? '')).toEqual(JSON.parse(valid().result));

    // Prompt kedua = prompt awal + daftar error.
    expect(runner.prompts[0]).toBe('PROMPT AWAL untuk p1');
    expect(runner.prompts[1]).toBe(
      'PROMPT AWAL untuk p1\n\nPERHATIAN: output kamu sebelumnya tidak valid karena:\n' +
        '- questions harus berisi minimal satu pertanyaan\n' +
        'Perbaiki dan kirim ulang output lengkap sesuai format.',
    );
  });

  it('output yang tidak bisa di-parse juga dicoba ulang', async () => {
    const runner = new FakeClaudeRunner([withResult('ini bukan JSON'), valid()]);
    const queue = queueWith(runner);
    const job = queue.start(insertProject('p1'), 'stage2');
    expect((await queue.waitFor(job.id))?.status).toBe('succeeded');
    expect(JSON.parse(runsOf('p1')[0]?.errorsJson ?? '')[0]).toMatch(/^parse gagal: /);
  });

  it('kedua percobaan gagal → job failed dengan error validasi, tidak ada output yang berlaku', async () => {
    const runner = new FakeClaudeRunner([withResult('{}'), withResult('{"questions": []}')]);
    const queue = queueWith(runner);
    const job = queue.start(insertProject('p1'), 'stage2');

    expect(await queue.waitFor(job.id)).toMatchObject({
      status: 'failed',
      error:
        'Output tahap tidak valid setelah 2 percobaan: questions harus berisi minimal satu pertanyaan',
    });
    expect(runsOf('p1').map((run) => [run.attempt, run.status, run.isCurrent])).toEqual([
      [1, 'failed', 0],
      [2, 'failed', 0],
    ]);
    expect(runner.prompts).toHaveLength(2);
  });
});

describe('server berhenti saat job berjalan', () => {
  it.each(['running', 'queued'] as const)(
    'job %s ditandai interrupted saat startup, lalu tahap bisa dijalankan lagi',
    async (status) => {
      insertProject('p1');
      // Sisa proses server sebelumnya: satu job aktif.
      t.db
        .insert(jobs)
        .values({
          id: 'lama',
          projectId: 'p1',
          stage: 'stage2',
          status,
          createdAt: clock(),
        })
        .run();

      const queue = queueWith(new FakeClaudeRunner([valid()]));
      expect(queue.markInterrupted()).toBe(1);
      expect(queue.getJob('lama')).toMatchObject({
        status: 'interrupted',
        error: INTERRUPTED_MESSAGE,
      });
      expect(queue.getJob('lama')?.finishedAt).not.toBeNull();
      expect(queue.markInterrupted()).toBe(0);

      const again = queue.start('p1', 'stage2');
      expect((await queue.waitFor(again.id))?.status).toBe('succeeded');
    },
  );
});

describe('kegagalan runner', () => {
  it.each([
    new ClaudeRunError(
      'TIMEOUT',
      'Claude Code tidak selesai dalam batas waktu 15 menit; proses dihentikan.',
      { durationMs: 900_000 },
    ),
    new ClaudeRunError('EXIT_CODE', 'Claude Code keluar dengan kode 1: Error: kuota habis'),
    new ClaudeRunError(
      'IS_ERROR',
      'Claude Code melaporkan error: Invalid API key · Please run /login',
    ),
  ])(
    '$code → job failed dengan pesan penyebab, tanpa output setengah jadi, output lama tetap berlaku',
    async (error) => {
      insertProject('p1');
      // Output tahap ini dari run sebelumnya.
      const earlier = queueWith(new FakeClaudeRunner([valid()]));
      await earlier.waitFor(earlier.start('p1', 'stage2').id);
      const [previous] = runsOf('p1');

      const runner = new FakeClaudeRunner([error, valid()]);
      const queue = queueWith(runner);
      const job = queue.start('p1', 'stage2');

      expect(await queue.waitFor(job.id)).toMatchObject({ status: 'failed', error: error.message });
      expect(runner.prompts).toHaveLength(1);
      const failed = runsOf('p1')[1];
      expect(failed).toMatchObject({
        attempt: 1,
        status: 'failed',
        isCurrent: 0,
        outputRaw: null,
        outputJson: null,
        inputTokens: null,
        errorsJson: JSON.stringify([`${error.code}: ${error.message}`]),
      });
      expect(runsOf('p1').filter((run) => run.isCurrent === 1)).toEqual([previous]);
    },
  );

  it('error tak terduga di definisi tahap → job failed, bukan unhandled rejection', async () => {
    const broken: StageDefinition = {
      ...stage2,
      buildPrompt: () => {
        throw new Error('prompt tidak bisa dibaca');
      },
    } as StageDefinition;
    const queue = new JobQueue({
      db: t.db,
      runner: new FakeClaudeRunner([]),
      clock,
      stages: { stage2: broken },
    });
    const job = queue.start(insertProject('p1'), 'stage2');
    expect(await queue.waitFor(job.id)).toMatchObject({
      status: 'failed',
      error: 'Terjadi kesalahan tak terduga: prompt tidak bisa dibaca',
    });
  });
});

describe('pencatatan eksekusi', () => {
  it('mencatat versi prompt, output mentah, token, biaya, durasi, dan waktu', async () => {
    const queue = queueWith(new FakeClaudeRunner([valid()]));
    const job = queue.start(insertProject('p1'), 'stage2');
    const done = await queue.waitFor(job.id);
    const fixture = valid();

    expect(runsOf('p1')).toEqual([
      expect.objectContaining({
        stage: 'stage2',
        attempt: 1,
        promptVersion: 'test-1',
        status: 'succeeded',
        outputRaw: fixture.result,
        inputTokens: fixture.inputTokens,
        outputTokens: fixture.outputTokens,
        costEstimateUsd: fixture.costUsd,
        durationMs: fixture.durationMs,
        isCurrent: 1,
      }),
    ]);
    const [run] = runsOf('p1');
    for (const value of [
      run?.createdAt,
      run?.finishedAt,
      done?.createdAt,
      done?.startedAt,
      done?.finishedAt,
    ]) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('menjalankan ulang tahap mengganti output yang berlaku', async () => {
    const queue = queueWith(new FakeClaudeRunner([valid(), valid()]));
    insertProject('p1');
    await queue.waitFor(queue.start('p1', 'stage2').id);
    await queue.waitFor(queue.start('p1', 'stage2').id);
    expect(runsOf('p1').map((run) => run.isCurrent)).toEqual([0, 1]);
  });
});

describe('validasi start', () => {
  it('proyek tidak ada → NOT_FOUND', () => {
    const error = startError(queueWith(new FakeClaudeRunner([])), 'tidak-ada');
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(t.db.select().from(jobs).all()).toEqual([]);
  });

  it('tahap tanpa definisi → BAD_REQUEST', () => {
    insertProject('p1');
    const queue = new JobQueue({ db: t.db, runner: new FakeClaudeRunner([]), clock, stages: {} });
    expect(startError(queue, 'p1')).toMatchObject({ code: 'BAD_REQUEST', status: 400 });
  });
});
