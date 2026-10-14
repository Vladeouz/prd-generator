import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ClaudeResult } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { featureChoices, projects, stageRuns } from '../../../src/core/db/schema.ts';
import { jobHandlers } from '../../../src/jobs/handlers.ts';
import { JobQueue } from '../../../src/jobs/job-queue.ts';
import { answerHandlers } from '../../../src/stages/answers-handlers.ts';
import { createStageRegistry } from '../../../src/stages/registry.ts';
import type { Stage2Output } from '../../../src/stages/stage-2/validate.ts';
import type { Stage3Output } from '../../../src/stages/stage-3/validate.ts';
import { featureHandlers } from '../../../src/stages/stage-4/feature-handlers.ts';
import { featureDraft, notChosenNonGoal } from '../../../src/stages/stage-4/features.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';

let t: TestDb;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 14, 0, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  tick = 0;
});
afterEach(() => t.close());

const stage2Fixture = () => loadClaudeFixture('stage2');
const stage3Fixture = () => loadClaudeFixture('derived/stage3-gym');
const umkmStage3 = () => loadClaudeFixture('derived/stage3-umkm-b');
const stage4Fixture = () => loadClaudeFixture('stage4');
const stage4 = () => JSON.parse(stage4Fixture().result) as Stage4Output;

function setup(responses: ClaudeResult[]) {
  const runner = new FakeClaudeRunner(responses);
  const queue = new JobQueue({ db: t.db, runner, clock, stages: createStageRegistry() });
  return {
    runner,
    queue,
    jobsApi: jobHandlers(queue),
    answersApi: answerHandlers({ db: t.db, clock }),
    featuresApi: featureHandlers({ db: t.db, clock }),
  };
}
type Env = ReturnType<typeof setup>;

const request = (body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function runStage(env: Env, stage: 'stage2' | 'stage3' | 'stage4') {
  const response = await env.jobsApi.run('p1', stage);
  expect(response.status).toBe(202);
  return env.queue.waitFor((await response.json()).id);
}

const skipAll = (questions: { id: string }[]) => ({
  answers: questions.map((q) => ({ questionId: q.id, value: null })),
});

function insertProject() {
  t.db
    .insert(projects)
    .values({
      id: 'p1',
      name: 'Gym',
      idea: 'Aplikasi membership untuk sebuah gym.',
      currentStage: 'stage2',
      createdAt: clock(),
      updatedAt: clock(),
    })
    .run();
}

/** Proyek gym dengan tahap 2 dan 3 selesai dan dijawab (semua default), stack tersedia. */
async function projectReadyForStage4(env: Env, stage3 = stage3Fixture()) {
  insertProject();
  await runStage(env, 'stage2');
  const product = JSON.parse(stage2Fixture().result) as Stage2Output;
  expect(
    (await env.answersApi.save(request(skipAll(product.questions)), 'p1', 'stage2')).status,
  ).toBe(200);
  await runStage(env, 'stage3');
  const tech = JSON.parse(stage3.result) as Stage3Output;
  expect((await env.answersApi.save(request(skipAll(tech.questions)), 'p1', 'stage3')).status).toBe(
    200,
  );
}

const putFeatures = (env: Env, body: unknown, projectId = 'p1') =>
  env.featuresApi.save(request(body), projectId);
const projectRow = () => t.db.select().from(projects).where(eq(projects.id, 'p1')).get();
const choiceRows = () =>
  t.db
    .select({ code: featureChoices.featureCode, accepted: featureChoices.accepted })
    .from(featureChoices)
    .where(eq(featureChoices.projectId, 'p1'))
    .all()
    .sort((a, b) => a.code.localeCompare(b.code));

describe('menjalankan tahap 4', () => {
  it('409 sebelum klarifikasi teknis dijawab', async () => {
    const env = setup([stage2Fixture(), stage3Fixture()]);
    insertProject();
    const before = await env.jobsApi.run('p1', 'stage4');
    expect(before.status).toBe(409);
    expect((await before.json()).error.message).toBe(
      'Jalankan klarifikasi teknis dulu sebelum struktur fitur.',
    );
    await runStage(env, 'stage2');
    const product = JSON.parse(stage2Fixture().result) as Stage2Output;
    await env.answersApi.save(request(skipAll(product.questions)), 'p1', 'stage2');
    await runStage(env, 'stage3');
    const unanswered = await env.jobsApi.run('p1', 'stage4');
    expect(unanswered.status).toBe(409);
    expect((await unanswered.json()).error.message).toBe(
      'Simpan jawaban klarifikasi teknis dulu sebelum struktur fitur.',
    );
  });

  it('409 selama stack belum dipilih (rekomendasi Profil B)', async () => {
    const env = setup([stage2Fixture(), umkmStage3()]);
    await projectReadyForStage4(env, umkmStage3());
    const response = await env.jobsApi.run('p1', 'stage4');
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe(
      'Pilih kelanjutan stack dulu sebelum struktur fitur.',
    );
  });

  it('prompt berisi konteks produk dan teknis; output nyata lolos dan tahap tetap 4 sampai fitur dipilih', async () => {
    const env = setup([stage2Fixture(), stage3Fixture(), stage4Fixture()]);
    await projectReadyForStage4(env);
    expect(projectRow()?.currentStage).toBe('stage4');
    const job = await runStage(env, 'stage4');

    expect(job?.status).toBe('succeeded');
    const prompt = env.runner.prompts[2] as string;
    expect(prompt).toContain('Kamu adalah tahap "Struktur Fitur"');
    expect(prompt).toContain('"""Aplikasi membership untuk sebuah gym."""');
    expect(prompt).toContain('Jawaban klarifikasi produk:\n- masalah: ');
    expect(prompt).toContain('Jawaban teknis:\n- platform: kebijakan platform.');
    expect(prompt).toContain('Pilihan stack:\nPakai stack yang tersedia.');
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    const run = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage4')))
      .get();
    expect(run).toMatchObject({ status: 'succeeded', promptVersion: '1', isCurrent: 1 });
    expect(projectRow()?.currentStage).toBe('stage4');
  });

  it('output yang melanggar urutan fase ditolak lalu dicoba ulang dengan daftar error', async () => {
    const broken = structuredClone(stage4());
    // F-01 (login) pindah ke fase terakhir, seperti kesalahan dependency_order di injectFlaws.
    for (const phase of broken.phases) {
      phase.feature_ids = phase.feature_ids.filter((id) => id !== 'F-01');
    }
    broken.phases.at(-1)?.feature_ids.push('F-01');
    const brokenFixture = { ...stage4Fixture(), result: JSON.stringify(broken) };
    const env = setup([stage2Fixture(), stage3Fixture(), brokenFixture, stage4Fixture()]);
    await projectReadyForStage4(env);

    expect((await runStage(env, 'stage4'))?.status).toBe('succeeded');
    expect(env.runner.prompts[3]).toContain(
      '- F-02 (fase 0) bergantung pada F-01 (fase 3) yang lebih lambat',
    );
    const runs = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage4')))
      .all();
    expect(runs.map((r) => [r.attempt, r.status, r.isCurrent])).toEqual([
      [1, 'failed', 0],
      [2, 'succeeded', 1],
    ]);
  });
});

describe('PUT /api/projects/{id}/features', () => {
  it('409 sebelum tahap 4 punya output, 404 untuk proyek yang tidak ada', async () => {
    const env = setup([]);
    insertProject();
    const conflict = await putFeatures(env, { accepted: [] });
    expect(conflict.status).toBe(409);
    expect((await putFeatures(env, { accepted: [] }, 'tidak-ada')).status).toBe(404);
  });

  it('422 bila kode fitur tidak ada di rekomendasi, dan tidak ada yang tersimpan', async () => {
    const env = setup([stage2Fixture(), stage3Fixture(), stage4Fixture()]);
    await projectReadyForStage4(env);
    await runStage(env, 'stage4');

    for (const code of ['R-99', 'F-01']) {
      const response = await putFeatures(env, { accepted: ['R-01', code] });
      expect(response.status).toBe(422);
      expect((await response.json()).error.details).toEqual({
        accepted: `Fitur tidak ada di rekomendasi: ${code}.`,
      });
    }
    expect((await putFeatures(env, { accepted: 'R-01' })).status).toBe(422);
    expect(choiceRows()).toEqual([]);
    expect(projectRow()?.currentStage).toBe('stage4');
  });

  it('hanya yang dicentang diterima; semua rekomendasi tersimpan dan proyek pindah ke tahap 5', async () => {
    const env = setup([stage2Fixture(), stage3Fixture(), stage4Fixture()]);
    await projectReadyForStage4(env);
    await runStage(env, 'stage4');

    const response = await putFeatures(env, { accepted: ['R-03', 'R-02', 'R-02'] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: ['R-02', 'R-03'], currentStage: 'stage5' });
    expect(choiceRows()).toEqual(
      stage4().recommended_features.map((r) => ({
        code: r.id,
        accepted: ['R-02', 'R-03'].includes(r.id) ? 1 : 0,
      })),
    );
    expect(projectRow()?.currentStage).toBe('stage5');

    // Pilihan baru menggantikan seluruh pilihan lama.
    await putFeatures(env, { accepted: [] });
    expect(choiceRows().every((row) => row.accepted === 0)).toBe(true);
  });

  it('fitur rekomendasi yang tidak dicentang masuk non-goals pada input tahap berikutnya', async () => {
    const env = setup([stage2Fixture(), stage3Fixture(), stage4Fixture()]);
    await projectReadyForStage4(env);
    await runStage(env, 'stage4');
    await putFeatures(env, { accepted: ['R-02'] });

    const output = stage4();
    const draft = featureDraft(t.db, 'p1');
    expect(draft?.accepted_recommendations.map((r) => r.id)).toEqual(['R-02']);
    expect(draft).not.toHaveProperty('recommended_features');
    const rejected = output.recommended_features.filter((r) => r.id !== 'R-02');
    expect(draft?.non_goals).toEqual([...output.non_goals, ...rejected.map(notChosenNonGoal)]);
    expect(draft?.non_goals.join('\n')).not.toContain(
      'Check-in kehadiran member (misalnya lewat QR) (',
    );
    expect(draft?.mvp_features).toEqual(output.mvp_features);
    expect(draft?.phases).toEqual(output.phases);
  });

  it('menjalankan ulang tahap 4 menghapus pilihan fitur lama dan kembali ke tahap 4', async () => {
    const env = setup([stage2Fixture(), stage3Fixture(), stage4Fixture(), stage4Fixture()]);
    await projectReadyForStage4(env);
    await runStage(env, 'stage4');
    await putFeatures(env, { accepted: ['R-01'] });
    expect(projectRow()?.currentStage).toBe('stage5');

    await runStage(env, 'stage4');
    expect(choiceRows()).toEqual([]);
    expect(projectRow()?.currentStage).toBe('stage4');
  });
});
