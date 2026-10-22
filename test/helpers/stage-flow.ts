// Alur tahap untuk integration test: proyek gym yang dijalankan dengan runner palsu dan fixture
// nyata sampai tahap tertentu, dengan semua pertanyaan dilewati (jawaban default).
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import {
  FakeClaudeRunner,
  type FakeResponse,
  loadClaudeFixture,
} from '../../src/claude/fake-runner.ts';
import type { ClaudeResult, ClaudeRunError, ClaudeRunner } from '../../src/claude/types.ts';
import type { Clock } from '../../src/core/clock.ts';
import { claudeProfile } from '../../src/core/config/claude.ts';
import type { Db } from '../../src/core/db/client.ts';
import { projects } from '../../src/core/db/schema.ts';
import { jobHandlers } from '../../src/jobs/handlers.ts';
import { JobQueue, type JobQueueDeps } from '../../src/jobs/job-queue.ts';
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
  /** Daftar task 7a (turunan TASKS nyata). */
  stage7a: () => loadClaudeFixture('derived/stage7a-gym'),
  /** Detail task 7b satu fase (turunan TASKS nyata). */
  stage7b: (phase: number) => loadClaudeFixture(`derived/stage7b-gym-fase-${phase}`),
  /** Fixture satu job tahap 7 lengkap: 7a lalu 7b fase 0–3 (untuk menjumlahkan token dan biaya). */
  stage7: () => [
    loadClaudeFixture('derived/stage7a-gym'),
    ...[0, 1, 2, 3].map((phase) => loadClaudeFixture(`derived/stage7b-gym-fase-${phase}`)),
  ],
  /**
   * Respons runner untuk satu job tahap 7 lengkap: 7a, lalu detail fase 0–3 yang dipilih dari fase
   * di prompt, karena detail fase berjalan bersamaan (T-033).
   */
  stage7Job: (): FakeResponse[] => [
    loadClaudeFixture('derived/stage7a-gym'),
    ...phaseResponses({
      0: [loadClaudeFixture('derived/stage7b-gym-fase-0')],
      1: [loadClaudeFixture('derived/stage7b-gym-fase-1')],
      2: [loadClaudeFixture('derived/stage7b-gym-fase-2')],
      3: [loadClaudeFixture('derived/stage7b-gym-fase-3')],
    }),
  ],
};

/** Nomor fase dari prompt 7b ("… untuk fase 2 (…)"), atau null untuk prompt lain. */
export function promptPhase(prompt: string): number | null {
  const match = /Kamu adalah tahap "Detail Task"[^\n]*?untuk fase (\d+)/.exec(prompt);
  return match ? Number(match[1]) : null;
}

/**
 * Respons 7b yang dipilih dari fase di prompt, bukan dari urutan pemanggilan: detail fase berjalan
 * bersamaan (T-033), dan urutan mulainya bergantung pada pembacaan template yang async.
 * `responses[fase]` dipakai berurutan per fase (percobaan 1, lalu 2).
 */
export function phaseResponses(
  responses: Record<number, (ClaudeResult | ClaudeRunError)[]>,
): FakeResponse[] {
  const queues = new Map(
    Object.entries(responses).map(([phase, list]) => [Number(phase), [...list]]),
  );
  const count = [...queues.values()].reduce((sum, list) => sum + list.length, 0);
  return Array.from({ length: count }, () => (prompt: string) => {
    const phase = promptPhase(prompt);
    const next = phase === null ? undefined : queues.get(phase)?.shift();
    if (!next) throw new Error(`phaseResponses: tidak ada respons untuk fase ${phase}.`);
    return next;
  });
}

export function createFlow(
  db: Db,
  clock: Clock,
  responses: FakeResponse[],
  options: {
    templateDir?: string;
    profiles?: JobQueueDeps['profiles'];
    /** Membungkus runner palsu, misalnya untuk menahan pemanggilan tertentu. */
    wrapRunner?: (runner: FakeClaudeRunner) => ClaudeRunner;
  } = {},
) {
  const runner = new FakeClaudeRunner(responses);
  const stages = createStageRegistry({ templateDir: () => options.templateDir });
  // Bawaan: env kosong, agar `.env` pengembang tidak memengaruhi test (bawaan profil D-14).
  const profiles = options.profiles ?? ((profile) => claudeProfile(profile, {}));
  const queue = new JobQueue({
    db,
    runner: options.wrapRunner?.(runner) ?? runner,
    clock,
    stages,
    profiles,
  });
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
