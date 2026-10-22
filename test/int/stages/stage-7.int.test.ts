// Job tahap 7 (T-027, D-11, T-033): 7a lalu detail 7b semua fase bersamaan dalam satu job, lalu
// TASKS.md disusun aplikasi.
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeClaudeRunner, FakeResponse } from '../../../src/claude/fake-runner.ts';
import {
  type ClaudeResult,
  ClaudeRunError,
  type ClaudeRunner,
  type ClaudeRunOptions,
} from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { documents, stageRuns } from '../../../src/core/db/schema.ts';
import type { JobProgress, ProgressEvent } from '../../../src/jobs/progress.ts';
import { composeTasks } from '../../../src/projects/compose-tasks.ts';
import { STAGE7B_CONCURRENCY } from '../../../src/stages/attempts.ts';
import { createStageRegistry } from '../../../src/stages/registry.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import type { Stage7aOutput } from '../../../src/stages/stage-7a/validate.ts';
import { stage7Job } from '../../../src/stages/stage-7b/job.ts';
import type { Stage7bOutput, TaskDetail } from '../../../src/stages/stage-7b/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';
import {
  createFlow,
  GYM_FIXTURES as F,
  type Flow,
  phaseResponses,
  projectRow,
  projectThrough,
  promptPhase,
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

const flowWith = (after: FakeResponse[], options: Parameters<typeof createFlow>[3] = {}) =>
  createFlow(
    t.db,
    clock,
    [F.stage2(), F.stage3(), F.stage4(), F.stage5(), F.stage6(), F.review2(), ...after],
    { templateDir: template.dir, ...options },
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

/** Run 7a dan 7b proyek, urut tahap, fase, dan percobaan (fase berjalan bersamaan, T-033). */
const stage7Runs = () =>
  t.db
    .select()
    .from(stageRuns)
    .where(eq(stageRuns.projectId, 'p1'))
    .all()
    .filter((r) => r.stage === 'stage7a' || r.stage === 'stage7b')
    .sort(
      (a, b) =>
        a.stage.localeCompare(b.stage) ||
        (a.scope ?? '').localeCompare(b.scope ?? '') ||
        a.attempt - b.attempt,
    )
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

describe('job tahap 7: 7a lalu detail semua fase bersamaan', () => {
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

  it('satu job: 7a lalu 7b fase 0–3 tercatat sendiri, fase selesai dari n, TASKS disusun aplikasi', async () => {
    const flow = flowWith(F.stage7Job());
    await projectReadyForTasks(flow);
    const response = await flow.jobsApi.run('p1', 'stage7');
    const job = await response.json();
    const steps: string[] = [];
    const phases: string[] = [];
    flow.queue.progress.subscribe(job.id, (event: ProgressEvent) => {
      if (event.type !== 'progress') return;
      const p: JobProgress = event.progress;
      const label = `${p.step}/${p.totalSteps}`;
      if (steps.at(-1) !== label) steps.push(label);
      if (p.phasesTotal !== undefined) {
        const done = `${p.phasesDone}/${p.phasesTotal}`;
        if (phases.at(-1) !== done) phases.push(done);
      }
    });
    expect((await flow.queue.waitFor(job.id))?.status).toBe('succeeded');

    // Langkah 1: daftar task; langkah 2: detail semua fase, dengan jumlah fase selesai dari 4.
    expect(steps).toEqual(['1/2', '2/2']);
    expect(phases).toEqual(['0/4', '1/4', '2/4', '3/4', '4/4']);
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
    const prompt = prompts.find((p) => promptPhase(p) === 2) as string;
    expect(prompt.startsWith('KONVENSI PROYEK')).toBe(true);
    expect(prompt).toContain(`"""\n${EXPECTED_SECTIONS.stage7b}\n"""`);
    // Bagian tahap lain (misalnya Format error milik tahap 6) tidak ikut.
    expect(prompt).not.toContain(TEMPLATE_SECTIONS.errors);
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

  it('gagal di fase 2: fase lain tetap tersimpan; menjalankan ulang hanya mengulang fase 2', async () => {
    const flow = flowWith([
      F.stage7a(),
      ...phaseResponses({
        0: [F.stage7b(0)],
        1: [F.stage7b(1)],
        2: [brokenDetail(2), brokenDetail(2)],
        3: [F.stage7b(3)],
      }),
      // Job kedua: hanya fase 2.
      ...phaseResponses({ 2: [F.stage7b(2)] }),
    ]);
    await projectReadyForTasks(flow);
    const first = await flow.jobsApi.run('p1', 'stage7');
    const failed = await flow.queue.waitFor((await first.json()).id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('Detail task gagal untuk 1 dari 4 fase: fase 2 (');
    expect(failed?.error).toContain('Output tahap tidak valid setelah 2 percobaan');
    expect(failed?.error).toContain('Detail fase lain sudah tersimpan');
    expect(failed?.error).toContain('done_when menyebut `pnpm check`');
    expect(tasksDocuments()).toEqual([]);
    expect(stage7Runs()).toEqual([
      { stage: 'stage7a', scope: null, attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '0', attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '1', attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '2', attempt: 1, status: 'failed', isCurrent: 0 },
      { stage: 'stage7b', scope: '2', attempt: 2, status: 'failed', isCurrent: 0 },
      { stage: 'stage7b', scope: '3', attempt: 1, status: 'succeeded', isCurrent: 1 },
    ]);

    const before = flow.runner.prompts.length;
    await runStage(flow, 'stage7');
    const resumed = flow.runner.prompts.slice(before);
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toContain('untuk fase 2');
    expect(stage7Runs().filter((r) => r.isCurrent === 1)).toHaveLength(5);
    expect(tasksDocuments().map((d) => d.version)).toEqual([1]);
    expect(projectRow(t.db)?.currentStage).toBe('export');
  });

  it('percobaan ulang berlaku per fase: fase 1 ditolak sekali lalu diterima, job tetap berhasil', async () => {
    const flow = flowWith([
      F.stage7a(),
      ...phaseResponses({
        0: [F.stage7b(0)],
        1: [brokenDetail(1), F.stage7b(1)],
        2: [F.stage7b(2)],
        3: [F.stage7b(3)],
      }),
    ]);
    await projectReadyForTasks(flow);
    await runStage(flow, 'stage7');
    expect(stage7Runs().filter((r) => r.scope === '1')).toEqual([
      { stage: 'stage7b', scope: '1', attempt: 1, status: 'failed', isCurrent: 0 },
      { stage: 'stage7b', scope: '1', attempt: 2, status: 'succeeded', isCurrent: 1 },
    ]);
    const phase1 = stage7Prompts(flow).filter((p) => promptPhase(p) === 1);
    expect(phase1).toHaveLength(2);
    expect(phase1[1]).toContain('PERHATIAN: output kamu sebelumnya tidak valid');
    // Fase lain tidak ikut dicoba ulang.
    expect(stage7Prompts(flow).filter((p) => p.includes('PERHATIAN'))).toHaveLength(1);
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

/**
 * Runner yang menahan setiap pemanggilan 7b sampai fasenya dilepas (`release`), lalu menjawab
 * fixture fase itu atau melempar error yang ditentukan. Pemanggilan lain diteruskan ke runner palsu.
 */
class PhaseGate implements ClaudeRunner {
  readonly started: number[] = [];
  maxInFlight = 0;
  private readonly waiting = new Map<number, () => void>();
  private readonly fake: FakeClaudeRunner;
  private readonly failures: Record<number, ClaudeRunError>;

  constructor(fake: FakeClaudeRunner, failures: Record<number, ClaudeRunError> = {}) {
    this.fake = fake;
    this.failures = failures;
  }

  async run(prompt: string, options?: ClaudeRunOptions): Promise<ClaudeResult> {
    const phase = promptPhase(prompt);
    if (phase === null) return this.fake.run(prompt, options);
    this.started.push(phase);
    await new Promise<void>((resolve) => {
      this.waiting.set(phase, resolve);
      this.maxInFlight = Math.max(this.maxInFlight, this.waiting.size);
    });
    const failure = this.failures[phase];
    if (failure) throw failure;
    return F.stage7b(phase);
  }

  /** Fase yang sedang ditahan, berurutan. */
  held() {
    return [...this.waiting.keys()].sort();
  }

  release(phase: number) {
    const resolve = this.waiting.get(phase);
    this.waiting.delete(phase);
    resolve?.();
  }
}

describe('detail fase bersamaan (T-033)', () => {
  /** Proyek siap TASKS dengan runner yang menahan 7b; `failures` per fase. */
  async function gatedFlow(failures: Record<number, ClaudeRunError> = {}) {
    let gate: PhaseGate | undefined;
    const flow = flowWith([F.stage7a()], {
      wrapRunner: (fake) => {
        gate = new PhaseGate(fake, failures);
        return gate;
      },
    });
    await projectReadyForTasks(flow);
    return { flow, gate: gate as PhaseGate };
  }

  it('semua fase berjalan bersamaan; fase yang gagal tidak membatalkan fase lain; tetap satu job aktif', async () => {
    const timeout = new ClaudeRunError(
      'TIMEOUT',
      'Claude Code tidak selesai dalam batas waktu 15 menit.',
    );
    const { flow, gate } = await gatedFlow({ 2: timeout });
    const response = await flow.jobsApi.run('p1', 'stage7');
    const job = await response.json();
    let last: JobProgress | undefined;
    flow.queue.progress.subscribe(job.id, (event: ProgressEvent) => {
      if (event.type === 'progress') last = event.progress;
    });

    // Keempat fase ditahan bersamaan: pemanggilan berikutnya tidak menunggu yang sebelumnya.
    await vi.waitFor(() => expect(gate.held()).toEqual([0, 1, 2, 3]));
    expect(gate.maxInFlight).toBe(4);
    // D-03: selama job tahap 7 berjalan, tahap lain tidak bisa dijalankan.
    expect((await flow.jobsApi.run('p1', 'stage6')).status).toBe(409);

    // Fase 2 gagal lebih dulu; fase lain tetap berjalan dan tersimpan.
    gate.release(2);
    await vi.waitFor(() => expect(last).toMatchObject({ phasesDone: 0, phasesFailed: 1 }));
    expect(gate.held()).toEqual([0, 1, 3]);
    gate.release(0);
    await vi.waitFor(() => expect(last).toMatchObject({ phasesDone: 1, phasesFailed: 1 }));
    expect(last).toMatchObject({ step: 2, totalSteps: 2, phasesTotal: 4 });
    gate.release(3);
    gate.release(1);

    const failed = await flow.queue.waitFor(job.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('Detail task gagal untuk 1 dari 4 fase: fase 2 (');
    expect(failed?.error).toContain('batas waktu 15 menit');
    expect(stage7Runs()).toEqual([
      { stage: 'stage7a', scope: null, attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '0', attempt: 1, status: 'succeeded', isCurrent: 1 },
      { stage: 'stage7b', scope: '1', attempt: 1, status: 'succeeded', isCurrent: 1 },
      // Kegagalan runner tidak dicoba ulang (D-08 hanya untuk output yang tidak valid).
      { stage: 'stage7b', scope: '2', attempt: 1, status: 'failed', isCurrent: 0 },
      { stage: 'stage7b', scope: '3', attempt: 1, status: 'succeeded', isCurrent: 1 },
    ]);
    expect(tasksDocuments()).toEqual([]);
  });

  it('jumlah pemanggilan serentak dibatasi konstanta job', async () => {
    const { flow, gate } = await gatedFlow();
    flow.queue.setStages({
      ...createStageRegistry({ templateDir: () => template.dir }),
      stage7: stage7Job({ templateDir: () => template.dir }, { concurrency: 2 }),
    });
    const response = await flow.jobsApi.run('p1', 'stage7');
    const job = await response.json();

    await vi.waitFor(() => expect(gate.held()).toEqual([0, 1]));
    gate.release(1);
    await vi.waitFor(() => expect(gate.held()).toEqual([0, 2]));
    gate.release(0);
    gate.release(2);
    await vi.waitFor(() => expect(gate.held()).toEqual([3]));
    gate.release(3);

    expect((await flow.queue.waitFor(job.id))?.status).toBe('succeeded');
    expect(gate.maxInFlight).toBe(2);
    // Urutan tiba di runner tidak pasti (prompt dibangun async); setiap fase dipanggil sekali.
    expect([...gate.started].sort()).toEqual([0, 1, 2, 3]);
    expect(tasksDocuments()).toHaveLength(1);
  });

  it('bawaan STAGE7B_CONCURRENCY: semua fase', () => {
    expect(STAGE7B_CONCURRENCY).toBe(Number.POSITIVE_INFINITY);
  });
});
