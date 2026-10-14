import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ClaudeResult } from '../../../src/claude/types.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { decisions, documents, stageRuns } from '../../../src/core/db/schema.ts';
import type { Job } from '../../../src/jobs/job-queue.ts';
import type { Review2Output } from '../../../src/stages/review-2/validate.ts';
import { decisionHandlers } from '../../../src/stages/stage-5/decision-handlers.ts';
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
const clock: Clock = () => new Date(Date.UTC(2026, 9, 14, 3, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

/** Kasus uji agent daftar-belanja: PRD dengan form edit tanpa GET per item. */
const prdWithoutItemGet = () => loadClaudeFixture('synthetic/prd-daftar-belanja');
const prdFixed = () => loadClaudeFixture('synthetic/prd-daftar-belanja-fixed');
const review2 = () => loadClaudeFixture('synthetic/review2-daftar-belanja');
const review2Output = () => JSON.parse(review2().result) as Review2Output;

const flowWith = (...after: ClaudeResult[]) =>
  createFlow(t.db, clock, [F.stage2(), F.stage3(), F.stage4(), F.stage5(), ...after], {
    templateDir: template.dir,
  });

/** Proyek sampai PRD daftar-belanja tertulis (proyek di tahap review kedua). */
async function projectWithPrd(flow: Flow) {
  await projectThrough(flow, 'stage5');
  await runStage(flow, 'stage6');
  expect(projectRow(t.db)?.currentStage).toBe('review2');
}

const putReview2 = (flow: Flow, choices: { findingId: string; option: string }[]) =>
  flow.decisionsApi.save(putRequest({ choices }), 'p1', 'review2');
const prdVersions = () =>
  t.db
    .select({ version: documents.version, content: documents.content })
    .from(documents)
    .where(and(eq(documents.projectId, 'p1'), eq(documents.kind, 'prd')))
    .all()
    .sort((a, b) => a.version - b.version);
const stageRunCount = (stage: 'stage6' | 'review2') =>
  t.db
    .select()
    .from(stageRuns)
    .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, stage)))
    .all().length;

describe('menjalankan review kedua', () => {
  it('409 sebelum PRD ditulis', async () => {
    const flow = flowWith();
    await projectThrough(flow, 'stage5');
    const response = await flow.jobsApi.run('p1', 'review2');
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe('Tulis PRD dulu sebelum review kedua.');
  });

  it('prompt berisi PRD terbaru dan celah rute UI tanpa endpoint; temuan RV2-xx tersimpan', async () => {
    const flow = flowWith(prdWithoutItemGet(), review2());
    await projectWithPrd(flow);
    await runStage(flow, 'review2');

    const prompt = flow.runner.prompts[5] as string;
    expect(prompt).toContain('Kamu adalah tahap "Review Kedua"');
    expect(prompt).toContain(
      '- Rute UI /items/{id}/edit tidak punya endpoint pendukung GET /items/{id}.',
    );
    expect(prompt).toContain('data_model, business_rule, ui_endpoint');
    expect(prompt).toContain(`PRD:\n"""\n${prdVersions()[0]?.content}\n"""`);
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    const run = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'review2')))
      .get();
    expect(run).toMatchObject({ status: 'succeeded', promptVersion: '1', isCurrent: 1 });
    expect(JSON.parse(run?.outputJson as string).findings[0]).toMatchObject({
      id: 'RV2-01',
      category: 'ui_endpoint',
    });
  });

  it('review yang melewatkan celah GET per item ditolak lalu dicoba ulang dengan daftar error', async () => {
    const missed = review2Output();
    missed.findings = missed.findings.filter((f) => f.id !== 'RV2-01');
    const flow = flowWith(
      prdWithoutItemGet(),
      { ...review2(), result: JSON.stringify(missed) },
      review2(),
    );
    await projectWithPrd(flow);
    await runStage(flow, 'review2');
    expect(flow.runner.prompts[6]).toContain(
      '- celah GET /items/{id} untuk rute /items/{id}/edit tidak dijadikan temuan ui_endpoint',
    );
    expect(stageRunCount('review2')).toBe(2);
  });
});

describe('keputusan review kedua', () => {
  it('memilih perbaikan membuat PRD ulang tepat satu kali, lalu proyek pindah ke TASKS', async () => {
    const flow = flowWith(prdWithoutItemGet(), review2(), prdFixed());
    await projectWithPrd(flow);
    await runStage(flow, 'review2');

    const response = await putReview2(flow, [
      { findingId: 'RV2-01', option: 'Tambahkan GET /items/{id}' },
    ]);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ currentStage: 'review2', regenerate: true });
    expect(body.job).toMatchObject({ stage: 'stage6', status: 'running' });
    expect((await flow.queue.waitFor(body.job.id))?.status).toBe('succeeded');

    expect(stageRunCount('stage6')).toBe(2);
    expect(stageRunCount('review2')).toBe(1);
    expect(flow.runner.prompts).toHaveLength(7);
    expect(projectRow(t.db)?.currentStage).toBe('stage7');

    const regenPrompt = flow.runner.prompts[6] as string;
    expect(regenPrompt).toContain(
      '- RV2-01 (ui_endpoint): Form edit di /items/{id}/edit harus terisi data lama',
    );
    expect(regenPrompt).toContain('  DIPUTUSKAN: Tambahkan GET /items/{id}');
    const [first, second] = prdVersions();
    expect(second?.version).toBe(2);
    expect(second?.content).toContain('- GET /items/{id} — satu item milik user, untuk form edit.');
    expect(second?.content).toContain('- **RV2-01** (ui_endpoint): ');
    expect(second?.content).toContain('  - Diputuskan: Tambahkan GET /items/{id}');
    expect(first?.content).not.toContain('RV2-01');

    // Keputusan review kedua tidak bisa disimpan lagi tanpa menjalankan ulang review kedua,
    // sehingga PRD tidak ditulis ulang untuk kedua kalinya.
    const again = await putReview2(flow, [
      { findingId: 'RV2-01', option: 'Tambahkan GET /items/{id}' },
    ]);
    expect(again.status).toBe(409);
    expect((await again.json()).error.message).toBe(
      'PRD sudah ditulis ulang setelah review kedua. Jalankan ulang review kedua untuk meninjau PRD terbaru.',
    );
    expect(stageRunCount('stage6')).toBe(2);
  });

  it('tanpa perbaikan: keputusan RV2-xx tersimpan, PRD tidak ditulis ulang, proyek pindah ke TASKS', async () => {
    const flow = flowWith(prdWithoutItemGet(), review2());
    await projectWithPrd(flow);
    await runStage(flow, 'review2');

    const response = await putReview2(flow, [
      { findingId: 'RV2-01', option: 'Biarkan, form edit memakai data dari daftar' },
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      currentStage: 'stage7',
      regenerate: false,
      job: null,
    });
    const rows = t.db
      .select()
      .from(decisions)
      .where(and(eq(decisions.projectId, 'p1'), eq(decisions.origin, 'review2')))
      .all()
      .sort((a, b) => a.code.localeCompare(b.code));
    const [rv1, rv2] = review2Output().findings;
    expect(rows.map((r) => [r.code, r.chosenOption])).toEqual([
      ['RV2-01', 'Biarkan, form edit memakai data dari daftar'],
      ['RV2-02', rv2?.recommended_option],
    ]);
    expect(rows[0]?.consequence).toBe(rv1?.options[1]?.consequence);
    expect(prdVersions()).toHaveLength(1);
    expect(stageRunCount('stage6')).toBe(1);
  });

  it('409 tanpa menyimpan apa pun bila job lain sedang berjalan', async () => {
    const flow = flowWith(prdWithoutItemGet(), review2());
    await projectWithPrd(flow);
    await runStage(flow, 'review2');
    const busyQueue = {
      activeJob: () => ({ id: 'job-lain' }) as Job,
      start: () => {
        throw new Error('tidak boleh dipanggil');
      },
    };
    const response = await decisionHandlers({ db: t.db, clock, queue: busyQueue }).save(
      putRequest({ choices: [] }),
      'p1',
      'review2',
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.details).toEqual({ activeJobId: 'job-lain' });
    expect(t.db.select().from(decisions).where(eq(decisions.origin, 'review2')).all()).toEqual([]);
    expect(projectRow(t.db)?.currentStage).toBe('review2');
  });
});
