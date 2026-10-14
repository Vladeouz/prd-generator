// Alur tahap untuk integration test: proyek gym yang dijalankan dengan runner palsu dan fixture
// nyata sampai tahap tertentu, dengan semua pertanyaan dilewati (jawaban default).
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../src/claude/fake-runner.ts';
import type { ClaudeResult } from '../../src/claude/types.ts';
import type { Clock } from '../../src/core/clock.ts';
import type { Db } from '../../src/core/db/client.ts';
import { projects } from '../../src/core/db/schema.ts';
import { jobHandlers } from '../../src/jobs/handlers.ts';
import { JobQueue } from '../../src/jobs/job-queue.ts';
import { answerHandlers } from '../../src/stages/answers-handlers.ts';
import { createStageRegistry } from '../../src/stages/registry.ts';
import type { Stage } from '../../src/stages/run-stage.ts';
import { featureHandlers } from '../../src/stages/stage-4/feature-handlers.ts';
import { decisionHandlers } from '../../src/stages/stage-5/decision-handlers.ts';

/** Fixture yang dipakai alur gym: output nyata, dengan tahap 3 versi turunan (kunci kebijakan). */
export const GYM_FIXTURES = {
  stage2: () => loadClaudeFixture('stage2'),
  stage3: () => loadClaudeFixture('derived/stage3-gym'),
  stage4: () => loadClaudeFixture('stage4'),
  stage5: () => loadClaudeFixture('stage5'),
  /** PRD nyata tanpa bagian 8 (bagian 8 disusun aplikasi). */
  stage6: () => loadClaudeFixture('derived/stage6-gym'),
  /** Review kedua sintetis (daftar-belanja); strukturnya valid untuk PRD gym yang tanpa celah. */
  review2: () => loadClaudeFixture('synthetic/review2-daftar-belanja'),
  /** TASKS nyata yang disesuaikan dengan FR-08. */
  stage7: () => loadClaudeFixture('derived/stage7-gym'),
};

export function createFlow(
  db: Db,
  clock: Clock,
  responses: ClaudeResult[],
  options: { templateDir?: string } = {},
) {
  const runner = new FakeClaudeRunner(responses);
  const stages = createStageRegistry({ templateDir: () => options.templateDir });
  const queue = new JobQueue({ db, runner, clock, stages });
  return {
    db,
    clock,
    runner,
    queue,
    jobsApi: jobHandlers(queue),
    answersApi: answerHandlers({ db, clock }),
    featuresApi: featureHandlers({ db, clock }),
    decisionsApi: decisionHandlers({ db, clock, queue }),
  };
}
export type Flow = ReturnType<typeof createFlow>;

export const putRequest = (body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export function insertProject(flow: Flow, id = 'p1') {
  flow.db
    .insert(projects)
    .values({
      id,
      name: 'Gym',
      idea: 'Aplikasi membership untuk sebuah gym.',
      currentStage: 'stage2',
      createdAt: flow.clock(),
      updatedAt: flow.clock(),
    })
    .run();
}

export async function runStage(flow: Flow, stage: Stage, projectId = 'p1') {
  const response = await flow.jobsApi.run(projectId, stage);
  expect(response.status).toBe(202);
  const job = await flow.queue.waitFor((await response.json()).id);
  expect(job?.status, job?.error ?? '').toBe('succeeded');
  return job;
}

async function skipQuestions(flow: Flow, stage: 'stage2' | 'stage3', fixture: ClaudeResult) {
  const { questions } = JSON.parse(fixture.result) as { questions: { id: string }[] };
  const body = { answers: questions.map((q) => ({ questionId: q.id, value: null })) };
  expect((await flow.answersApi.save(putRequest(body), 'p1', stage)).status).toBe(200);
}

/**
 * Proyek `p1` dijalankan sampai `until` selesai dan dikonfirmasi user: tahap 2 dan 3 dijawab dengan
 * default, tahap 4 tanpa fitur rekomendasi, tahap 5 dengan rekomendasi setiap temuan. Runner harus
 * berisi fixture untuk setiap tahap yang dijalankan, berurutan.
 */
export async function projectThrough(flow: Flow, until: 'stage2' | 'stage3' | 'stage4' | 'stage5') {
  insertProject(flow);
  await runStage(flow, 'stage2');
  await skipQuestions(flow, 'stage2', GYM_FIXTURES.stage2());
  if (until === 'stage2') return;
  await runStage(flow, 'stage3');
  await skipQuestions(flow, 'stage3', GYM_FIXTURES.stage3());
  if (until === 'stage3') return;
  await runStage(flow, 'stage4');
  expect((await flow.featuresApi.save(putRequest({ accepted: [] }), 'p1')).status).toBe(200);
  if (until === 'stage4') return;
  await runStage(flow, 'stage5');
  expect((await flow.decisionsApi.save(putRequest({ choices: [] }), 'p1', 'review1')).status).toBe(
    200,
  );
}

export const projectRow = (db: Db, id = 'p1') =>
  db.select().from(projects).where(eq(projects.id, id)).get();
