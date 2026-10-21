// Job tahap 7 (T-027, D-11): 7a lalu 7b per fase dalam satu job, lalu TASKS.md disusun aplikasi.
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClaudeResult } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { documents, stageRuns } from '../../../src/core/db/schema.ts';
import type { JobProgress, ProgressEvent } from '../../../src/jobs/progress.ts';
import { composeTasks } from '../../../src/projects/compose-tasks.ts';
import { createStageRegistry } from '../../../src/stages/registry.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import type { Stage7aOutput } from '../../../src/stages/stage-7a/validate.ts';
import type { Stage7bOutput, TaskDetail } from '../../../src/stages/stage-7b/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';
import {
  createFlow,
  GYM_FIXTURES as F,
  type Flow,
  projectRow,
  projectThrough,
  putRequest,
  runStage,
} from '../../helpers/stage-flow.ts';
import {
  createTemplateRepo,
  EXPECTED_SECTIONS,
  TEMPLATE_SECTIONS,
  type TemplateRepo,
} from '../../helpers/template-repo.ts';

let t: TestDb;
let template: TemplateRepo;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 21, 6, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

const flowWith = (after: ClaudeResult[]) =>
  createFlow(
    t.db,
    clock,
    [F.stage2(), F.stage3(), F.stage4(), F.stage5(), F.stage6(), F.review2(), ...after],
    { templateDir: template.dir },
  );

/** Proyek gym sampai review kedua diputuskan tanpa perbaikan (proyek di tahap TASKS). */
async function projectReadyForTasks(flow: Flow) {
  await projectThrough(flow, 'stage5');
  await runStage(flow, 'stage6');
  await runStage(flow, 'review2');
  const keep = [
    { findingId: 'RV2-01', option: 'Biarkan, form edit memakai data dari daftar' },
    { findingId: 'RV2-02', option: 'Biarkan, cukup dijelaskan di task' },
  ];
  const response = await flow.decisionsApi.save(putRequest({ choices: keep }), 'p1', 'review2');
  expect((await response.json()).currentStage).toBe('stage7');
}

/** Prompt yang dikirim job tahap 7 (setelah 6 pemanggilan tahap 2 sampai review kedua). */
const stage7Prompts = (flow: Flow) => flow.runner.prompts.slice(6);

const tasksDocuments = () =>
  t.db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, 'p1'), eq(documents.kind, 'tasks')))
    .all()
    .sort((a, b) => a.version - b.version);

/** Run 7a dan 7b proyek, sesuai urutan pencatatan. */
const stage7Runs = () =>
  t.db
    .select()
    .from(stageRuns)
    .where(eq(stageRuns.projectId, 'p1'))
    .all()
    .filter((r) => r.stage === 'stage7a' || r.stage === 'stage7b')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => ({
      stage: r.stage,
      scope: r.scope,
      attempt: r.attempt,
      status: r.status,
      isCurrent: r.isCurrent,
    }));

/** Detail fase dengan satu task diubah agar ditolak validator 7b. */
function brokenDetail(phase: number): ClaudeResult {
  const output = JSON.parse(F.stage7b(phase).result) as Stage7bOutput;
  (output.tasks[0] as TaskDetail).done_when = ['lulus; `pnpm check` hijau'];
  return { ...F.stage7b(phase), result: JSON.stringify(output) };
}

describe('job tahap 7: 7a lalu 7b per fase', () => {
  it('409 sebelum review kedua diputuskan', async () => {
    const flow = flowWith([]);
    await projectThrough(flow, 'stage5');
    await runStage(flow, 'stage6');
    const response = await flow.jobsApi.run('p1', 'stage7');
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe(
      'Selesaikan PRD dan review kedua dulu sebelum menulis TASKS.',
    );
  });

  it('satu job: 7a dan 7b fase 0–3 tercatat sendiri, langkah ke-i dari n, TASKS disusun aplikasi', async () => {
    const flow = flowWith(F.stage7());
    await projectReadyForTasks(flow);
    const response = await flow.jobsApi.run('p1', 'stage7');
    const job = await response.json();
    const steps: string[] = [];
    flow.queue.progress.subscribe(job.id, (event: ProgressEvent) => {
      if (event.type !== 'progress') return;
      const p: JobProgress = event.progress;
      const label = `${p.step}/${p.totalSteps}`;
      if (steps.at(-1) !== label) steps.push(label);
    });
    expect((await flow.queue.waitFor(job.id))?.status).toBe('succeeded');

    expect(steps).toEqual(['1/5', '2/5', '3/5', '4/5', '5/5']);
    expect(stage7Runs()).toEqual([
      { stage: 'stage7a', scope: null, attempt: 1, status: 'succeeded', isCurrent: 1 },
      ...['0', '1', '2', '3'].map((scope) => ({
        stage: 'stage7b',
        scope,
        attempt: 1,
        status: 'succeeded',
        isCurrent: 1,
      })),
    ]);

    // Prompt 7b fase 2: konvensi 7b di awal, hanya task fase itu dan FR yang dirujuknya.
    const prompts = stage7Prompts(flow);
    expect(prompts).toHaveLength(5);
    const list = JSON.parse(F.stage7a().result) as Stage7aOutput;
    const phase2 = list.tasks.filter((task) => task.phase === 2);
    const other = list.tasks.filter((task) => task.phase !== 2);
    const prompt = prompts[3] as string;
    expect(prompt.startsWith('KONVENSI PROYEK')).toBe(true);
    expect(prompt).toContain(`"""\n${EXPECTED_SECTIONS.stage7b}\n"""`);
    expect(prompt).not.toContain(TEMPLATE_SECTIONS.database);
    expect(prompt).toContain(
      'Kamu adalah tahap "Detail Task" di aplikasi PRD Generator, untuk fase 2',
    );
    for (const task of phase2) expect(prompt).toContain(`"title": ${JSON.stringify(task.title)}`);
    for (const task of other) expect(prompt).not.toContain(JSON.stringify(task.title));
    const refs = new Set(phase2.flatMap((task) => task.refs));
    for (let i = 1; i <= 17; i++) {
      const fr = `FR-${String(i).padStart(2, '0')}`;
      if (refs.has(fr)) expect(prompt).toContain(`### ${fr}: `);
      else expect(prompt).not.toContain(`### ${fr}: `);
    }
    expect(prompt).not.toContain('## 5. API Contract');
    // Konvensi sama persis di awal setiap prompt 7b (awalan yang bisa dibaca dari cache).
    const prefix = (p: string) => p.slice(0, p.indexOf('Kamu adalah tahap'));
    expect(new Set(prompts.slice(1).map(prefix)).size).toBe(1);

    const [doc] = tasksDocuments();
    const stage4 = JSON.parse(F.stage4().result) as Stage4Output;
    const details = new Map(
      [0, 1, 2, 3].flatMap((phase) =>
        (JSON.parse(F.stage7b(phase).result) as Stage7bOutput).tasks.map((d) => [d.id, d] as const),
      ),
    );
    expect(doc?.version).toBe(1);
    expect(doc?.content).toBe(
      composeTasks({
        productName: stage4.product_name,
        phases: stage4.phases,
        tasks: list.tasks,
        details,
      }),
    );
    expect(doc?.content).toContain('--web-browser-flag=--incognito');
    expect(projectRow(t.db)?.currentStage).toBe('export');
  });

  it('gagal di fase 2: fase sebelumnya tetap berlaku; menjalankan ulang hanya mengulang fase 2 dan 3', async () => {
    const flow = flowWith([
      F.stage7a(),
      F.stage7b(0),
      F.stage7b(1),
      brokenDetail(2),
      brokenDetail(2),
      // Job kedua: hanya fase 2 dan 3.
      F.stage7b(2),
      F.stage7b(3),
    ]);
    await projectReadyForTasks(flow);
    const first = await flow.jobsApi.run('p1', 'stage7');
    const failed = await flow.queue.waitFor((await first.json()).id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('Output tahap tidak valid setelah 2 percobaan');
    expect(failed?.error).toContain('done_when menyebut `pnpm check`');
    expect(tasksDocuments()).toEqual([]);
    expect(stage7Runs()).toEqual([
      { stage: 'stage7a', scope: null, attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '0', attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '1', attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '2', attempt: 1, status: 'failed', isCurrent: 0 },
      { stage: 'stage7b', scope: '2', attempt: 2, status: 'failed', isCurrent: 0 },
    ]);

    const before = flow.runner.prompts.length;
    await runStage(flow, 'stage7');
    const resumed = flow.runner.prompts.slice(before);
    expect(resumed).toHaveLength(2);
    expect(resumed[0]).toContain('untuk fase 2');
    expect(resumed[1]).toContain('untuk fase 3');
    expect(stage7Runs().filter((r) => r.isCurrent === 1)).toHaveLength(5);
    expect(tasksDocuments().map((d) => d.version)).toEqual([1]);
    expect(projectRow(t.db)?.currentStage).toBe('export');
  });

  it('percobaan ulang berlaku per fase: fase 1 ditolak sekali lalu diterima, job tetap berhasil', async () => {
    const [list, ...details] = F.stage7();
    const flow = flowWith([
      list as ClaudeResult,
      details[0] as ClaudeResult,
      brokenDetail(1),
      ...details.slice(1),
    ]);
    await projectReadyForTasks(flow);
    await runStage(flow, 'stage7');
    expect(stage7Runs().filter((r) => r.scope === '1')).toEqual([
      { stage: 'stage7b', scope: '1', attempt: 1, status: 'failed', isCurrent: 0 },
      { stage: 'stage7b', scope: '1', attempt: 2, status: 'succeeded', isCurrent: 1 },
    ]);
    expect(stage7Prompts(flow)[3]).toContain('PERHATIAN: output kamu sebelumnya tidak valid');
    expect(tasksDocuments()).toHaveLength(1);
  });

  it('TEMPLATE_DIR tidak valid: job gagal tanpa memanggil claude (FR-11)', async () => {
    const flow = flowWith([]);
    await projectReadyForTasks(flow);
    flow.queue.setStages(createStageRegistry({ templateDir: () => undefined }));
    const response = await flow.jobsApi.run('p1', 'stage7');
    const job = await flow.queue.waitFor((await response.json()).id);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('Repo template belum valid, jadi daftar task belum bisa dibuat');
    expect(stage7Prompts(flow)).toHaveLength(0);
    expect(tasksDocuments()).toEqual([]);
  });
});
