import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ClaudeResult } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { answers, jobs, projects, stageRuns } from '../../../src/core/db/schema.ts';
import { jobHandlers } from '../../../src/jobs/handlers.ts';
import { JobQueue } from '../../../src/jobs/job-queue.ts';
import { answerHandlers } from '../../../src/stages/answers-handlers.ts';
import { createStageRegistry } from '../../../src/stages/registry.ts';
import { formatProductContext, productContext } from '../../../src/stages/stage-2/context.ts';
import type { Stage2Output } from '../../../src/stages/stage-2/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';

let t: TestDb;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 12, 0, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  tick = 0;
});
afterEach(() => t.close());

const IDEA = 'Aplikasi membership untuk sebuah gym.';
const gymFixture = () => loadClaudeFixture('stage2');
/** Output nyata validate-report-v2.json ide #1 (punya deferred_technical). */
const taskAppOutput = (
  JSON.parse(readFileSync('docs/reference/validate-report-v2.json', 'utf8')) as {
    results: { data: Stage2Output }[];
  }
).results[0]?.data as Stage2Output;
const withOutput = (output: Stage2Output): ClaudeResult => ({
  ...gymFixture(),
  result: JSON.stringify(output),
});

function insertProject(id = 'p1') {
  t.db
    .insert(projects)
    .values({
      id,
      name: 'Gym',
      idea: IDEA,
      currentStage: 'stage2',
      createdAt: clock(),
      updatedAt: clock(),
    })
    .run();
  return id;
}

function setup(responses: ClaudeResult[]) {
  const runner = new FakeClaudeRunner(responses);
  const queue = new JobQueue({ db: t.db, runner, clock, stages: createStageRegistry() });
  return {
    runner,
    queue,
    jobsApi: jobHandlers(queue),
    answersApi: answerHandlers({ db: t.db, clock }),
  };
}

async function runStage2(env: ReturnType<typeof setup>, projectId = 'p1') {
  const response = await env.jobsApi.run(projectId, 'stage2');
  expect(response.status).toBe(202);
  const job = await response.json();
  return env.queue.waitFor(job.id);
}

const put = (env: ReturnType<typeof setup>, body: unknown, projectId = 'p1', stage = 'stage2') =>
  env.answersApi.save(
    new Request('http://127.0.0.1/x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    projectId,
    stage,
  );

const projectRow = (id = 'p1') => t.db.select().from(projects).where(eq(projects.id, id)).get();
const answerRows = (id = 'p1') =>
  t.db
    .select()
    .from(answers)
    .where(and(eq(answers.projectId, id), eq(answers.stage, 'stage2')))
    .all()
    .map((row) => ({
      questionId: row.questionId,
      topic: row.topic,
      value: JSON.parse(row.valueJson),
      source: row.source,
    }))
    .sort((a, b) => a.questionId.localeCompare(b.questionId));

describe('menjalankan tahap 2', () => {
  it('POST run → 202, prompt berisi ide, output nyata lolos validator, versi prompt dicatat', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    const job = await runStage2(env);

    expect(job?.status).toBe('succeeded');
    expect(env.runner.prompts[0]).toContain(`"""${IDEA}"""`);
    const run = t.db.select().from(stageRuns).where(eq(stageRuns.projectId, 'p1')).get();
    expect(run).toMatchObject({
      stage: 'stage2',
      status: 'succeeded',
      promptVersion: '1',
      isCurrent: 1,
    });
    expect(projectRow()?.currentStage).toBe('stage2');
  });

  it('output tidak valid dicoba ulang dengan daftar error', async () => {
    insertProject();
    const invalid = structuredClone(taskAppOutput);
    invalid.clarity = 1; // harus 5 pertanyaan, ada 3
    const env = setup([withOutput(invalid), gymFixture()]);
    expect((await runStage2(env))?.status).toBe('succeeded');
    expect(env.runner.prompts[1]).toContain('- clarity 1 harus 5 pertanyaan, didapat 3');
  });

  it('409 saat job lain berjalan; 400 tahap tidak dikenal; 404 proyek tidak ada', async () => {
    insertProject();
    insertProject('p2');
    t.db
      .insert(jobs)
      .values({
        id: 'j-lain',
        projectId: 'p2',
        stage: 'stage2',
        status: 'running',
        createdAt: clock(),
      })
      .run();
    const env = setup([gymFixture()]);
    const conflict = await env.jobsApi.run('p1', 'stage2');
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.message).toContain('Hanya satu tahap');
    expect((await env.jobsApi.run('p1', 'stage9')).status).toBe(400);
    t.db.update(jobs).set({ status: 'succeeded' }).run();
    expect((await env.jobsApi.run('tidak-ada', 'stage2')).status).toBe(404);
  });

  it('GET /api/jobs/{id} untuk polling; 404 bila tidak ada', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    const job = await runStage2(env);
    const response = await env.jobsApi.get(job?.id as string);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: job?.id,
      status: 'succeeded',
      stage: 'stage2',
    });
    expect((await env.jobsApi.get('tidak-ada')).status).toBe(404);
  });
});

describe('PUT /api/projects/{id}/answers/stage2', () => {
  // Fixture gym: q1 masalah (single), q2 pengguna (single), q3 aksi_pertama (single), q4 fitur_wajib (multi).
  const gym = () => JSON.parse(gymFixture().result) as Stage2Output;

  it('opsi, multi, "Lainnya", dan lewati tersimpan dengan source yang sesuai; tahap pindah ke stage3', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    await runStage2(env);
    const [q1, , q3, q4] = gym().questions as Stage2Output['questions'];

    const response = await put(env, {
      answers: [
        { questionId: 'q1', value: q1?.options[1] },
        { questionId: 'q2', value: null },
        { questionId: 'q3', value: { lainnya: '  Daftar member dari HP  ' } },
        { questionId: 'q4', value: q4?.options.slice(0, 2) },
      ],
    });

    expect(response.status).toBe(200);
    expect(answerRows()).toEqual([
      { questionId: 'q1', topic: 'masalah', value: q1?.options[1], source: 'user' },
      {
        questionId: 'q2',
        topic: 'pengguna',
        value: gym().questions[1]?.recommended_default,
        source: 'guess',
      },
      { questionId: 'q3', topic: 'aksi_pertama', value: 'Daftar member dari HP', source: 'user' },
      { questionId: 'q4', topic: 'fitur_wajib', value: q4?.options.slice(0, 2), source: 'user' },
    ]);
    expect(q3?.topic).toBe('aksi_pertama');
    expect(projectRow()?.currentStage).toBe('stage3');
  });

  it('default untuk masalah dan pengguna tersimpan sebagai guess, topik lain sebagai default', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    await runStage2(env);
    const response = await put(env, {
      answers: ['q1', 'q2', 'q3', 'q4'].map((questionId) => ({ questionId, value: null })),
    });
    expect(response.status).toBe(200);
    expect(answerRows().map((row) => [row.topic, row.source])).toEqual([
      ['masalah', 'guess'],
      ['pengguna', 'guess'],
      ['aksi_pertama', 'default'],
      ['fitur_wajib', 'default'],
    ]);
    expect(answerRows()[3]?.value).toEqual(gym().questions[3]?.recommended_default);
  });

  it('jawaban yang tidak cocok dengan pertanyaan → 422 per pertanyaan, tidak ada yang tersimpan', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    await runStage2(env);
    const response = await put(env, {
      answers: [
        { questionId: 'q1', value: 'Opsi yang tidak ada' },
        { questionId: 'q2', value: ['bukan', 'single'] },
        { questionId: 'q3', value: { lainnya: '   ' } },
        { questionId: 'q4', value: ['Fitur rahasia'] },
        { questionId: 'q9', value: null },
      ],
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error.details).toEqual({
      q1: 'Pilih salah satu opsi yang tersedia.',
      q2: 'Pilih salah satu opsi yang tersedia.',
      q3: 'Isi jawaban "Lainnya".',
      q4: 'Pilih hanya dari opsi yang tersedia.',
      q9: 'Pertanyaan tidak dikenal.',
    });
    expect(answerRows()).toEqual([]);
    expect(projectRow()?.currentStage).toBe('stage2');
  });

  it('pertanyaan yang tidak dikirim atau dikirim dua kali → 422', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    await runStage2(env);
    const response = await put(env, {
      answers: [
        { questionId: 'q1', value: null },
        { questionId: 'q1', value: null },
        { questionId: 'q2', value: null },
        { questionId: 'q3', value: null },
      ],
    });
    expect((await response.json()).error.details).toEqual({
      q1: 'Pertanyaan ini dijawab lebih dari sekali.',
      q4: 'Pertanyaan ini belum dijawab atau dilewati.',
    });
  });

  it('bentuk value salah → 422; tahap belum dijalankan → 409; tahap tanpa pertanyaan → 400', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    expect((await put(env, { answers: [] })).status).toBe(409);
    expect((await put(env, { answers: [] }, 'p1', 'stage4')).status).toBe(400);
    await runStage2(env);
    const bad = await put(env, { answers: [{ questionId: 'q1', value: 5 }] });
    expect(bad.status).toBe(422);
  });

  it('menyimpan ulang mengganti jawaban sebelumnya', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    await runStage2(env);
    const all = (value: unknown) => ({
      answers: ['q1', 'q2', 'q3', 'q4'].map((questionId) => ({ questionId, value })),
    });
    await put(env, all(null));
    const q1 = gym().questions[0]?.options[2];
    await put(env, { answers: [{ questionId: 'q1', value: q1 }, ...all(null).answers.slice(1)] });
    expect(answerRows()).toHaveLength(4);
    expect(answerRows()[0]).toMatchObject({ value: q1, source: 'user' });
  });

  it('menjalankan ulang tahap 2 menghapus jawaban lama dan kembali ke tahap 2', async () => {
    insertProject();
    const env = setup([gymFixture(), gymFixture()]);
    await runStage2(env);
    await put(env, {
      answers: ['q1', 'q2', 'q3', 'q4'].map((questionId) => ({ questionId, value: null })),
    });
    expect(projectRow()?.currentStage).toBe('stage3');

    await runStage2(env);
    expect(answerRows()).toEqual([]);
    expect(projectRow()?.currentStage).toBe('stage2');
  });
});

describe('input tahap 3', () => {
  it('deferred_technical, jawaban (dengan tanda tebakan), dan asumsi ikut dikirim', async () => {
    insertProject();
    const env = setup([withOutput(taskAppOutput)]);
    await runStage2(env);
    await put(env, {
      answers: taskAppOutput.questions.map((q) => ({ questionId: q.id, value: null })),
    });

    const context = productContext(t.db, 'p1');
    expect(context.deferredTechnical).toEqual(taskAppOutput.deferred_technical);
    expect(context.deferredTechnical.length).toBeGreaterThan(0);

    const text = formatProductContext(context);
    for (const item of taskAppOutput.deferred_technical) {
      expect(text).toContain(`- ${item}`);
    }
    expect(text).toContain('Catatan teknis dari tahap sebelumnya:');
    expect(text).toContain(`"""${IDEA}"""`);
    expect(text).toContain('- masalah: ');
    expect(text).toContain('(TEBAKAN default, belum dikonfirmasi user)');
    for (const assumption of taskAppOutput.assumptions) {
      expect(text).toContain(`- ${assumption}`);
    }
  });

  it('tanpa deferred_technical ditulis "(tidak ada)"', async () => {
    insertProject();
    const env = setup([gymFixture()]);
    await runStage2(env);
    expect(formatProductContext(productContext(t.db, 'p1'))).toMatch(
      /Catatan teknis dari tahap sebelumnya:\n- \(tidak ada\)$/,
    );
  });
});
