import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ClaudeResult } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { documents, stageRuns } from '../../../src/core/db/schema.ts';
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
  TEMPLATE_CONVENTIONS,
  type TemplateRepo,
} from '../../helpers/template-repo.ts';

let t: TestDb;
let template: TemplateRepo;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 14, 4, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

const flowWith = (after: ClaudeResult[], templateDir: string | undefined = template.dir) =>
  createFlow(
    t.db,
    clock,
    [F.stage2(), F.stage3(), F.stage4(), F.stage5(), F.stage6(), F.review2(), ...after],
    { templateDir },
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

const tasksDocuments = () =>
  t.db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, 'p1'), eq(documents.kind, 'tasks')))
    .all()
    .sort((a, b) => a.version - b.version);
const prdContent = () =>
  t.db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, 'p1'), eq(documents.kind, 'prd')))
    .get()?.content as string;

describe('menjalankan tahap 7', () => {
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

  it('prompt berisi konvensi template dan PRD terbaru; TASKS tersimpan dan proyek pindah ke export', async () => {
    const flow = flowWith([F.stage7()]);
    await projectReadyForTasks(flow);
    await runStage(flow, 'stage7');

    const prompt = flow.runner.prompts[6] as string;
    expect(prompt).toContain('Kamu adalah tahap "Generate Task Plan"');
    expect(prompt).toContain(`"""\n${TEMPLATE_CONVENTIONS}\n"""`);
    expect(prompt).toContain(`PRD:\n"""\n${prdContent()}\n"""`);
    expect(prompt).toContain('infra|db|api|contract|app|test|docs');
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);

    const [doc] = tasksDocuments();
    expect(doc).toMatchObject({ version: 1, content: F.stage7().result.trim() });
    expect(projectRow(t.db)).toMatchObject({
      currentStage: 'export',
      templateCommit: template.commit,
    });
    const run = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage7')))
      .get();
    expect(run).toMatchObject({ status: 'succeeded', promptVersion: '1', isCurrent: 1 });
  });

  it('TASKS nyata dengan task setup template ditolak lalu dicoba ulang dengan daftar error', async () => {
    // Fixture asli tahap 7 (TASKS.md uji end-to-end), yang harus ditolak.
    const flow = flowWith([loadClaudeFixture('stage7'), F.stage7()]);
    await projectReadyForTasks(flow);
    await runStage(flow, 'stage7');
    expect(flow.runner.prompts[7]).toContain(
      '- T-001 adalah setup yang sudah disediakan template (monorepo, Docker Compose, emulator)',
    );
    expect(tasksDocuments()).toHaveLength(1);
  });

  it('menjalankan ulang tahap 7 menyimpan TASKS versi berikutnya', async () => {
    const flow = flowWith([F.stage7(), F.stage7()]);
    await projectReadyForTasks(flow);
    await runStage(flow, 'stage7');
    await runStage(flow, 'stage7');
    expect(tasksDocuments().map((d) => d.version)).toEqual([1, 2]);
  });

  it('TEMPLATE_DIR tidak valid: job gagal tanpa memanggil claude (FR-11)', async () => {
    const flow = flowWith([]);
    await projectReadyForTasks(flow);
    // Template dihapus setelah PRD selesai: tahap 7 tidak boleh berjalan.
    template.remove();
    const response = await flow.jobsApi.run('p1', 'stage7');
    const job = await flow.queue.waitFor((await response.json()).id);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('Repo template belum valid, jadi TASKS belum bisa ditulis');
    expect(flow.runner.prompts).toHaveLength(6);
    expect(tasksDocuments()).toEqual([]);
  });
});
