// Profil model dan effort per tahap (D-14, T-035): review kedua memakai `reasoning`, tahap lain
// `standard`; pengaturan env yang tidak valid menggagalkan tahap sebelum `claude` dipanggil.
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { claudeProfile, STAGE_PROFILES } from '../../../src/core/config/claude.ts';
import { stageRuns } from '../../../src/core/db/schema.ts';
import { createStageRegistry } from '../../../src/stages/registry.ts';
import type { StageDefinition } from '../../../src/stages/run-stage.ts';
import { stage7aDefinition } from '../../../src/stages/stage-7a/definition.ts';
import { stage7bDefinition } from '../../../src/stages/stage-7b/definition.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';
import {
  createFlow,
  GYM_FIXTURES as F,
  type Flow,
  projectRow,
  projectThrough,
  runStage,
} from '../../helpers/stage-flow.ts';
import { createTemplateRepo, type TemplateRepo } from '../../helpers/template-repo.ts';

let t: TestDb;
let template: TemplateRepo;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 22, 9, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

const review2 = () => loadClaudeFixture('synthetic/review2-daftar-belanja');
const prd = () => loadClaudeFixture('synthetic/prd-daftar-belanja');

const flowWith = (env: Record<string, string>) =>
  createFlow(t.db, clock, [F.stage2(), F.stage3(), F.stage4(), F.stage5(), prd(), review2()], {
    templateDir: template.dir,
    profiles: (profile) => claudeProfile(profile, env),
  });

const runsOf = (stage: 'stage5' | 'stage6' | 'review2') =>
  t.db
    .select({ model: stageRuns.model, effort: stageRuns.effort, status: stageRuns.status })
    .from(stageRuns)
    .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, stage)))
    .all();

async function projectWithPrd(flow: Flow) {
  await projectThrough(flow, 'stage5');
  await runStage(flow, 'stage6');
  expect(projectRow(t.db)?.currentStage).toBe('review2');
}

describe('profil per definisi tahap', () => {
  it('setiap definisi menyatakan profil dari STAGE_PROFILES: review 2 reasoning, lainnya standard', () => {
    const registry = createStageRegistry({ templateDir: () => template.dir });
    const single = ['stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2'] as const;
    const profiles = Object.fromEntries(
      single.map((stage) => [stage, (registry[stage] as StageDefinition).profile]),
    );
    expect(profiles).toEqual({
      stage2: 'standard',
      stage3: 'standard',
      stage4: 'standard',
      stage5: 'standard',
      stage6: 'standard',
      review2: 'reasoning',
    });
    expect(stage7aDefinition().profile).toBe('standard');
    expect(stage7bDefinition({ phase: 0, name: 'Fondasi' }).profile).toBe('standard');
    for (const stage of single) expect(profiles[stage]).toBe(STAGE_PROFILES[stage]);
  });
});

describe('model dan effort per pemanggilan', () => {
  it('tahap 5 dan 6 dipanggil dengan profil standard, review 2 dengan reasoning; stage_runs mencatatnya', async () => {
    const flow = flowWith({});
    await projectWithPrd(flow);
    await runStage(flow, 'review2');

    // Urutan pemanggilan: tahap 2, 3, 4, 5, 6, lalu review 2.
    const standard = { model: 'sonnet', effort: 'low' };
    expect(flow.runner.calls).toEqual([
      standard,
      standard,
      standard,
      standard,
      standard,
      { model: 'opus', effort: 'medium' },
    ]);
    expect(runsOf('stage5')).toEqual([{ ...standard, status: 'succeeded' }]);
    expect(runsOf('stage6')).toEqual([{ ...standard, status: 'succeeded' }]);
    expect(runsOf('review2')).toEqual([{ model: 'opus', effort: 'medium', status: 'succeeded' }]);
  });

  it('env mengganti model dan effort setiap profil', async () => {
    const flow = flowWith({
      CLAUDE_MODEL: 'claude-sonnet-5-5',
      CLAUDE_EFFORT: 'medium',
      CLAUDE_MODEL_REASONING: 'sonnet',
      CLAUDE_EFFORT_REASONING: 'high',
    });
    await projectWithPrd(flow);
    await runStage(flow, 'review2');
    expect(flow.runner.calls.at(3)).toEqual({ model: 'claude-sonnet-5-5', effort: 'medium' });
    expect(flow.runner.calls.at(-1)).toEqual({ model: 'sonnet', effort: 'high' });
    expect(runsOf('review2')).toEqual([{ model: 'sonnet', effort: 'high', status: 'succeeded' }]);
  });
});

describe('pengaturan profil tidak valid', () => {
  it('effort reasoning tidak valid: review 2 gagal sebelum claude dipanggil, tahap standard tetap jalan', async () => {
    const flow = flowWith({ CLAUDE_EFFORT_REASONING: 'sedang' });
    // Tahap 2–6 (profil standard) tidak terpengaruh.
    await projectWithPrd(flow);
    const calls = flow.runner.calls.length;

    const response = await flow.jobsApi.run('p1', 'review2');
    expect(response.status).toBe(202);
    const job = await flow.queue.waitFor((await response.json()).id);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('CLAUDE_EFFORT_REASONING tidak valid: "sedang"');
    expect(job?.error).toContain('profil reasoning');
    expect(flow.runner.calls).toHaveLength(calls);
    expect(runsOf('review2')).toEqual([]);
  });

  it('model standard tidak valid: tahap 2 gagal dengan pesan yang menyebut CLAUDE_MODEL', async () => {
    const flow = flowWith({ CLAUDE_MODEL: 'son net' });
    await expect(projectThrough(flow, 'stage2')).rejects.toThrow();
    const job = t.db.query.jobs.findFirst().sync();
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('CLAUDE_MODEL tidak valid: "son net"');
    expect(flow.runner.calls).toEqual([]);
  });
});
