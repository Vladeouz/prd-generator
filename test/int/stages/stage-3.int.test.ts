import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ClaudeResult } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { answers, decisions, projects, stageRuns } from '../../../src/core/db/schema.ts';
import { jobHandlers } from '../../../src/jobs/handlers.ts';
import { JobQueue } from '../../../src/jobs/job-queue.ts';
import { answerHandlers } from '../../../src/stages/answers-handlers.ts';
import { createStageRegistry } from '../../../src/stages/registry.ts';
import type { Stage2Output } from '../../../src/stages/stage-2/validate.ts';
import { formatTechnicalContext, technicalContext } from '../../../src/stages/stage-3/context.ts';
import { profileHandlers } from '../../../src/stages/stage-3/profile-handlers.ts';
import type { Stage3Output } from '../../../src/stages/stage-3/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';

let t: TestDb;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 13, 0, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  tick = 0;
});
afterEach(() => t.close());

const stage2Fixture = () => loadClaudeFixture('stage2');
/** Output nyata tahap 3 tanpa kunci kebijakan: harus ditolak validator. */
const originalStage3 = () => loadClaudeFixture('stage3');
const gymStage3 = () => loadClaudeFixture('derived/stage3-gym');
const umkmStage3 = () => loadClaudeFixture('derived/stage3-umkm-b');
const outputOf = (fixture: ClaudeResult) => JSON.parse(fixture.result) as Stage3Output;

function setup(responses: ClaudeResult[]) {
  const runner = new FakeClaudeRunner(responses);
  const queue = new JobQueue({ db: t.db, runner, clock, stages: createStageRegistry() });
  return {
    runner,
    queue,
    jobsApi: jobHandlers(queue),
    answersApi: answerHandlers({ db: t.db, clock }),
    profileApi: profileHandlers({ db: t.db, clock }),
  };
}
type Env = ReturnType<typeof setup>;

const request = (body: unknown) =>
  new Request('http://127.0.0.1/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function runStage(env: Env, stage: 'stage2' | 'stage3') {
  const response = await env.jobsApi.run('p1', stage);
  expect(response.status).toBe(202);
  return env.queue.waitFor((await response.json()).id);
}

const skipAll = (questions: { id: string }[]) => ({
  answers: questions.map((q) => ({ questionId: q.id, value: null })),
});

/** Proyek gym dengan tahap 2 selesai dan dijawab (semua default). */
async function projectWithProductAnswers(env: Env) {
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
  await runStage(env, 'stage2');
  const stage2 = JSON.parse(stage2Fixture().result) as Stage2Output;
  expect(
    (await env.answersApi.save(request(skipAll(stage2.questions)), 'p1', 'stage2')).status,
  ).toBe(200);
}

const putAnswers = (env: Env, body: unknown) => env.answersApi.save(request(body), 'p1', 'stage3');
const putProfile = (env: Env, body: unknown, projectId = 'p1') =>
  env.profileApi.choose(request(body), projectId);

const projectRow = () => t.db.select().from(projects).where(eq(projects.id, 'p1')).get();
const stage3Answers = () =>
  t.db
    .select()
    .from(answers)
    .where(and(eq(answers.projectId, 'p1'), eq(answers.stage, 'stage3')))
    .all()
    .sort((a, b) => a.questionId.localeCompare(b.questionId));
const decisionRows = () => t.db.select().from(decisions).where(eq(decisions.projectId, 'p1')).all();

describe('menjalankan tahap 3', () => {
  it('409 sebelum jawaban klarifikasi produk tersimpan', async () => {
    const env = setup([stage2Fixture()]);
    t.db
      .insert(projects)
      .values({
        id: 'p1',
        name: 'Gym',
        idea: 'Ide',
        currentStage: 'stage2',
        createdAt: clock(),
        updatedAt: clock(),
      })
      .run();
    const before = await env.jobsApi.run('p1', 'stage3');
    expect(before.status).toBe(409);
    expect((await before.json()).error.message).toBe(
      'Jalankan klarifikasi produk dulu sebelum klarifikasi teknis.',
    );
    await runStage(env, 'stage2');
    const unanswered = await env.jobsApi.run('p1', 'stage3');
    expect(unanswered.status).toBe(409);
    expect((await unanswered.json()).error.message).toBe(
      'Simpan jawaban klarifikasi produk dulu sebelum klarifikasi teknis.',
    );
  });

  it('prompt berisi konteks produk dan tabel kebijakan; rekomendasi Profil A langsung memakai stack tersedia', async () => {
    const env = setup([stage2Fixture(), gymStage3()]);
    await projectWithProductAnswers(env);
    const job = await runStage(env, 'stage3');

    expect(job?.status).toBe('succeeded');
    const prompt = env.runner.prompts[1] as string;
    expect(prompt).toContain('"""Aplikasi membership untuk sebuah gym."""');
    expect(prompt).toContain('Jawaban klarifikasi produk:\n- masalah: ');
    expect(prompt).toContain('Catatan teknis dari tahap sebelumnya:');
    expect(prompt).toContain('  - mobile_masa_depan.cukup_website: SEO adalah inti produk');
    expect(prompt).toContain('  - peran_akses.ikut_jawaban_produk: ');
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    const run = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage3')))
      .get();
    expect(run).toMatchObject({ status: 'succeeded', promptVersion: '1', isCurrent: 1 });
    expect(projectRow()).toMatchObject({ currentStage: 'stage3', profileChoice: 'A' });
  });

  it('output nyata tanpa default_policy_key ditolak lalu dicoba ulang dengan daftar error', async () => {
    const env = setup([stage2Fixture(), originalStage3(), gymStage3()]);
    await projectWithProductAnswers(env);
    expect((await runStage(env, 'stage3'))?.status).toBe('succeeded');
    expect(env.runner.prompts[2]).toContain(
      '- questions[0].default_policy_key kosong/bukan string',
    );
    const runs = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage3')))
      .all();
    expect(runs.map((r) => [r.attempt, r.status, r.isCurrent])).toEqual([
      [1, 'failed', 0],
      [2, 'succeeded', 1],
    ]);
  });
});

describe('jawaban tahap 3 dan kunci kebijakan', () => {
  it('default dan opsi default menyimpan kuncinya; opsi lain dan "Lainnya" menyimpan teks dengan kunci null; tahap pindah ke 4', async () => {
    const env = setup([stage2Fixture(), gymStage3()]);
    await projectWithProductAnswers(env);
    await runStage(env, 'stage3');
    const [t1, t2, t3] = outputOf(gymStage3()).questions;

    const response = await putAnswers(env, {
      answers: [
        { questionId: 't1', value: null },
        { questionId: 't2', value: t2?.recommended_default },
        { questionId: 't3', value: t3?.options[1] },
      ],
    });
    expect(response.status).toBe(200);
    expect(stage3Answers().map((a) => [a.questionId, a.source, a.policyKey])).toEqual([
      ['t1', 'default', 'platform.hp_dan_web'],
      ['t2', 'user', 'peran_akses.dua_peran'],
      ['t3', 'user', null],
    ]);
    expect(JSON.parse(stage3Answers()[0]?.valueJson as string)).toBe(t1?.recommended_default);
    expect(projectRow()?.currentStage).toBe('stage4');

    await putAnswers(env, {
      answers: [
        { questionId: 't1', value: { lainnya: 'Web saja untuk resepsionis' } },
        { questionId: 't2', value: null },
        { questionId: 't3', value: null },
      ],
    });
    expect(stage3Answers().map((a) => [a.questionId, a.policyKey])).toEqual([
      ['t1', null],
      ['t2', 'peran_akses.dua_peran'],
      ['t3', 'notifikasi.dalam_aplikasi_dan_push'],
    ]);
  });

  it('konteks untuk tahap berikutnya memakai kunci bila ada, dan teks bila tidak', async () => {
    const env = setup([stage2Fixture(), gymStage3()]);
    await projectWithProductAnswers(env);
    await runStage(env, 'stage3');
    const output = outputOf(gymStage3());
    await putAnswers(env, {
      answers: [
        { questionId: 't1', value: null },
        { questionId: 't2', value: { lainnya: 'Hanya pemilik gym' } },
        { questionId: 't3', value: null },
      ],
    });

    const context = technicalContext(t.db, 'p1');
    expect(context.risks).toEqual(output.detected_risks);
    const text = formatTechnicalContext(context);
    expect(text).toContain(
      '- platform: kebijakan platform.hp_dan_web: Ide tidak menyebut platform: HP (Android dan iOS) dan web.',
    );
    expect(text).toContain('- peran_akses: Hanya pemilik gym\n');
    expect(text).toContain('- notifikasi: kebijakan notifikasi.dalam_aplikasi_dan_push: ');
    for (const risk of output.detected_risks) expect(text).toContain(`- ${risk}`);
    expect(text).toContain('Pilihan stack:\nPakai stack yang tersedia.');
  });
});

describe('PUT /api/projects/{id}/profile (rekomendasi Profil B)', () => {
  async function umkmProject(env: Env) {
    await projectWithProductAnswers(env);
    await runStage(env, 'stage3');
    expect(projectRow()).toMatchObject({ currentStage: 'stage3', profileChoice: null });
  }

  it('jawaban tersimpan tanpa pilihan stack: tetap di tahap 3', async () => {
    const env = setup([stage2Fixture(), umkmStage3()]);
    await umkmProject(env);
    expect((await putAnswers(env, skipAll(outputOf(umkmStage3()).questions))).status).toBe(200);
    expect(stage3Answers()[0]?.policyKey).toBe('mobile_masa_depan.cukup_website');
    expect(projectRow()?.currentStage).toBe('stage3');
  });

  it('pilihan eksplisit tersimpan sebagai keputusan D-01; tunda tetap di tahap 3, lanjut pindah ke tahap 4', async () => {
    const env = setup([stage2Fixture(), umkmStage3()]);
    await umkmProject(env);
    await putAnswers(env, skipAll(outputOf(umkmStage3()).questions));

    const postpone = await putProfile(env, { choice: 'postpone' });
    expect(postpone.status).toBe(200);
    expect(await postpone.json()).toMatchObject({
      profileChoice: 'postpone',
      currentStage: 'stage3',
      decision: { code: 'D-01', origin: 'profile' },
    });
    expect(projectRow()).toMatchObject({ profileChoice: 'postpone', currentStage: 'stage3' });

    const proceed = await putProfile(env, { choice: 'A_with_seo_mitigation' });
    expect(proceed.status).toBe(200);
    expect(projectRow()).toMatchObject({
      profileChoice: 'A_with_seo_mitigation',
      currentStage: 'stage4',
    });
    const rows = decisionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: 'D-01',
      origin: 'profile',
      category: 'stack',
      chosenOption: 'Lanjut dengan stack yang tersedia, ditambah mitigasi SEO',
    });
    expect(rows[0]?.finding).toContain(outputOf(umkmStage3()).profile_recommendation.reason);
    expect(rows[0]?.consequence).toContain('mitigasi');
  });

  it('memilih stack sebelum menjawab: tetap di tahap 3 sampai jawaban tersimpan', async () => {
    const env = setup([stage2Fixture(), umkmStage3()]);
    await umkmProject(env);
    await putProfile(env, { choice: 'A_with_seo_mitigation' });
    expect(projectRow()?.currentStage).toBe('stage3');
    await putAnswers(env, skipAll(outputOf(umkmStage3()).questions));
    expect(projectRow()?.currentStage).toBe('stage4');
  });

  it('"A" saja tidak tersedia untuk rekomendasi Profil B; pilihan tidak dikenal → 422', async () => {
    const env = setup([stage2Fixture(), umkmStage3()]);
    await umkmProject(env);
    const onlyA = await putProfile(env, { choice: 'A' });
    expect(onlyA.status).toBe(422);
    expect((await onlyA.json()).error.details).toEqual({
      choice: 'Pilih lanjut dengan mitigasi SEO, atau tunda.',
    });
    const unknown = await putProfile(env, { choice: 'B' });
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.details.choice).toBe('Pilih salah satu kelanjutan stack.');
    expect(decisionRows()).toEqual([]);
  });

  it('409 sebelum tahap 3 dijalankan; 404 proyek tidak ada', async () => {
    const env = setup([stage2Fixture()]);
    await projectWithProductAnswers(env);
    expect((await putProfile(env, { choice: 'postpone' })).status).toBe(409);
    expect((await putProfile(env, { choice: 'postpone' }, 'tidak-ada')).status).toBe(404);
  });

  it('rekomendasi Profil A: hanya "A" yang diterima, tanpa keputusan D-01', async () => {
    const env = setup([stage2Fixture(), gymStage3()]);
    await projectWithProductAnswers(env);
    await runStage(env, 'stage3');
    expect((await putProfile(env, { choice: 'postpone' })).status).toBe(422);
    expect((await putProfile(env, { choice: 'A' })).status).toBe(200);
    expect(decisionRows()).toEqual([]);
  });

  it('menjalankan ulang tahap 3 menghapus jawaban, pilihan stack, dan D-01', async () => {
    const env = setup([stage2Fixture(), umkmStage3(), gymStage3()]);
    await umkmProject(env);
    await putAnswers(env, skipAll(outputOf(umkmStage3()).questions));
    await putProfile(env, { choice: 'A_with_seo_mitigation' });
    expect(projectRow()?.currentStage).toBe('stage4');

    await runStage(env, 'stage3');
    expect(stage3Answers()).toEqual([]);
    expect(decisionRows()).toEqual([]);
    expect(projectRow()).toMatchObject({ currentStage: 'stage3', profileChoice: 'A' });
  });
});
