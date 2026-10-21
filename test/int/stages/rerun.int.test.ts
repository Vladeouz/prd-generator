import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClaudeResult } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { decisions, documents, stageRuns } from '../../../src/core/db/schema.ts';
import {
  getStageUsage,
  stageEstimate,
  TEST_ESTIMATES,
  usageTotals,
} from '../../../src/projects/usage.ts';
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
import { createTemplateRepo, type TemplateRepo } from '../../helpers/template-repo.ts';

let t: TestDb;
let template: TemplateRepo;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 14, 5, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

const FULL = () => [
  F.stage2(),
  F.stage3(),
  F.stage4(),
  F.stage5(),
  F.stage6(),
  F.review2(),
  F.stage7(),
];
const flowWith = (...after: ClaudeResult[]) =>
  createFlow(t.db, clock, [...FULL(), ...after], { templateDir: template.dir });

/** Proyek gym sampai TASKS selesai: review kedua diputuskan tanpa perbaikan. */
async function projectWithTasks(flow: Flow) {
  await projectThrough(flow, 'stage5');
  await runStage(flow, 'stage6');
  await runStage(flow, 'review2');
  const keep = [
    { findingId: 'RV2-01', option: 'Biarkan, form edit memakai data dari daftar' },
    { findingId: 'RV2-02', option: 'Biarkan, cukup dijelaskan di task' },
  ];
  expect(
    (await flow.decisionsApi.save(putRequest({ choices: keep }), 'p1', 'review2')).status,
  ).toBe(200);
  await runStage(flow, 'stage7');
  expect(projectRow(t.db)?.currentStage).toBe('export');
}

const currentStages = () =>
  t.db
    .select({ stage: stageRuns.stage })
    .from(stageRuns)
    .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.isCurrent, 1)))
    .all()
    .map((r) => r.stage)
    .sort();
const documentKinds = () =>
  t.db
    .select({ kind: documents.kind, version: documents.version })
    .from(documents)
    .where(eq(documents.projectId, 'p1'))
    .all()
    .map((d) => `${d.kind}${d.version}`)
    .sort();
const decisionOrigins = () =>
  [
    ...new Set(
      t.db
        .select({ origin: decisions.origin })
        .from(decisions)
        .where(eq(decisions.projectId, 'p1'))
        .all()
        .map((d) => d.origin),
    ),
  ].sort();

describe('menjalankan ulang sebuah tahap', () => {
  it('tahap 4 dijalankan ulang: output tahap 5–7 tidak berlaku, PRD, TASKS, dan keputusan review kedua dihapus', async () => {
    const flow = flowWith(F.stage4());
    await projectWithTasks(flow);
    expect(currentStages()).toEqual([
      'review2',
      'stage2',
      'stage3',
      'stage4',
      'stage5',
      'stage6',
      // Tahap 7 lama dicatat sebagai stage7b sampai T-027 memecahnya menjadi 7a + 7b per fase.
      'stage7b',
    ]);
    expect(documentKinds()).toEqual(['prd1', 'tasks1']);
    expect(decisionOrigins()).toEqual(['review1', 'review2']);

    await runStage(flow, 'stage4');
    expect(currentStages()).toEqual(['stage2', 'stage3', 'stage4']);
    expect(documentKinds()).toEqual([]);
    expect(decisionOrigins()).toEqual(['review1']);
    expect(projectRow(t.db)?.currentStage).toBe('stage4');

    // Tahap sesudahnya harus dijalankan ulang berurutan: review kritis yang tidak berlaku tidak
    // bisa diputuskan, dan PRD belum bisa ditulis.
    expect((await flow.featuresApi.save(putRequest({ accepted: [] }), 'p1')).status).toBe(200);
    const stale = await flow.decisionsApi.save(putRequest({ choices: [] }), 'p1', 'review1');
    expect(stale.status).toBe(409);
    expect((await flow.jobsApi.run('p1', 'stage6')).status).toBe(409);
  });

  it('tahap 6 dijalankan ulang: TASKS dihapus dan review kedua tidak berlaku, PRD versi berikutnya tersimpan', async () => {
    const flow = flowWith(F.stage6());
    await projectWithTasks(flow);
    await runStage(flow, 'stage6');
    expect(currentStages()).toEqual(['stage2', 'stage3', 'stage4', 'stage5', 'stage6']);
    expect(documentKinds()).toEqual(['prd1', 'prd2']);
    // Keputusan review kedua tetap: PRD baru ditulis dengan keputusan itu.
    expect(decisionOrigins()).toEqual(['review1', 'review2']);
    expect(projectRow(t.db)?.currentStage).toBe('stage7');
  });

  it('tahap 7 dijalankan ulang: tidak ada tahap sesudahnya, TASKS versi berikutnya', async () => {
    const flow = flowWith(F.stage7());
    await projectWithTasks(flow);
    await runStage(flow, 'stage7');
    expect(currentStages()).toHaveLength(7);
    expect(documentKinds()).toEqual(['prd1', 'tasks1', 'tasks2']);
  });

  it('percobaan ulang yang gagal tidak mengubah apa pun: output dan dokumen lama tetap berlaku', async () => {
    const broken = { ...F.stage4(), result: '{"mvp_features": []}' };
    const flow = flowWith(broken, broken);
    await projectWithTasks(flow);
    const response = await flow.jobsApi.run('p1', 'stage4');
    const job = await flow.queue.waitFor((await response.json()).id);
    expect(job?.status).toBe('failed');
    expect(currentStages()).toHaveLength(7);
    expect(documentKinds()).toEqual(['prd1', 'tasks1']);
    expect(projectRow(t.db)?.currentStage).toBe('export');
  });
});

describe('pemakaian token dan perkiraan (FR-10)', () => {
  it('token input, output, biaya, dan durasi tersimpan per tahap, dengan total per proyek', async () => {
    const flow = flowWith();
    await projectWithTasks(flow);
    const usage = getStageUsage({ db: t.db }, 'p1');
    for (const [stage, fixture] of [
      ['stage2', F.stage2()],
      ['stage6', F.stage6()],
      ['stage7', F.stage7()],
    ] as const) {
      expect(usage[stage]).toEqual({
        inputTokens: fixture.inputTokens,
        outputTokens: fixture.outputTokens,
        costUsd: fixture.costUsd,
        durationMs: fixture.durationMs,
      });
    }
    const totals = usageTotals(usage);
    const all = FULL();
    expect(totals.inputTokens).toBe(all.reduce((s, f) => s + f.inputTokens, 0));
    expect(totals.outputTokens).toBe(all.reduce((s, f) => s + f.outputTokens, 0));
    expect(totals.costUsd).toBeCloseTo(
      all.reduce((s, f) => s + (f.costUsd ?? 0), 0),
      6,
    );
  });

  it('perkiraan tahap 6–7: angka uji bila belum ada pemanggilan, rata-rata bila sudah ada', async () => {
    expect(stageEstimate({ db: t.db }, 'stage6')).toEqual({
      ...TEST_ESTIMATES.stage6,
      basis: 'test',
      samples: 0,
    });
    const flow = flowWith(F.stage7());
    await projectWithTasks(flow);
    await runStage(flow, 'stage7');
    const stage7 = F.stage7();
    expect(stageEstimate({ db: t.db }, 'stage7')).toEqual({
      durationMs: stage7.durationMs,
      inputTokens: stage7.inputTokens,
      outputTokens: stage7.outputTokens,
      basis: 'average',
      samples: 2,
    });
  });
});
