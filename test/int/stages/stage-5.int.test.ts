import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/core/clock.ts';
import { decisions, stageRuns } from '../../../src/core/db/schema.ts';
import { currentOutput } from '../../../src/stages/run-stage.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import type { Stage5Output } from '../../../src/stages/stage-5/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';
import { injectFlaws, scoreReview } from '../../helpers/review-flaws.ts';
import {
  createFlow,
  GYM_FIXTURES as F,
  type Flow,
  insertProject,
  projectRow,
  projectThrough,
  putRequest,
  runStage,
} from '../../helpers/stage-flow.ts';

let t: TestDb;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 14, 1, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  tick = 0;
});
afterEach(() => t.close());

const stage5 = () => JSON.parse(F.stage5().result) as Stage5Output;
const flowWith = (...responses: ReturnType<typeof F.stage2>[]) =>
  createFlow(t.db, clock, responses);
const putDecisions = (flow: Flow, body: unknown, origin = 'review1', projectId = 'p1') =>
  flow.decisionsApi.save(putRequest(body), projectId, origin);
const decisionRows = () =>
  t.db
    .select()
    .from(decisions)
    .where(eq(decisions.projectId, 'p1'))
    .all()
    .sort((a, b) => a.code.localeCompare(b.code));

describe('menjalankan tahap 5', () => {
  it('409 sebelum struktur fitur dijalankan dan sebelum pilihan fitur disimpan', async () => {
    const flow = flowWith(F.stage2(), F.stage3(), F.stage4());
    insertProject(flow);
    const before = await flow.jobsApi.run('p1', 'stage5');
    expect(before.status).toBe(409);
    expect((await before.json()).error.message).toBe(
      'Jalankan struktur fitur dulu sebelum review kritis.',
    );
    t.close();
    t = createTestDb();
    const again = flowWith(F.stage2(), F.stage3(), F.stage4());
    await projectThrough(again, 'stage3');
    await runStage(again, 'stage4');
    const unsaved = await again.jobsApi.run('p1', 'stage5');
    expect(unsaved.status).toBe(409);
    expect((await unsaved.json()).error.message).toBe(
      'Simpan pilihan fitur rekomendasi dulu sebelum review kritis.',
    );
  });

  it('prompt berisi konteks dan draft dengan rekomendasi yang tidak dipilih sebagai non-goals', async () => {
    const flow = flowWith(F.stage2(), F.stage3(), F.stage4(), F.stage5());
    await projectThrough(flow, 'stage4');
    await runStage(flow, 'stage5');

    const prompt = flow.runner.prompts[3] as string;
    expect(prompt).toContain('Kamu adalah tahap "Review Kritis"');
    // Fase struktur fitur gym (0–3) dari tahap 4.
    expect(prompt).toMatch(
      /Fase yang ada di struktur fitur: 0 \([^)]+\), 1 \([^)]+\), 2 \([^)]+\), 3 \([^)]+\)\./,
    );
    expect(prompt).toContain(
      'stack_deploy, dependency_order, security, consistency, scope_creep, testability',
    );
    expect(prompt).toContain('"""Aplikasi membership untuk sebuah gym."""');
    expect(prompt).toContain(
      'DRAFT RENCANA (JSON):\n{\n  "product_name": "Aplikasi Membership Gym"',
    );
    expect(prompt).toContain('"accepted_recommendations": []');
    expect(prompt).toContain(
      '"Pengingat WhatsApp atau SMS ke member (fitur rekomendasi yang tidak dipilih)"',
    );
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    const run = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage5')))
      .get();
    expect(run).toMatchObject({ status: 'succeeded', promptVersion: '2', isCurrent: 1 });
    expect(projectRow(t.db)?.currentStage).toBe('stage5');
  });

  it('draft dengan empat kesalahan injectFlaws: keempatnya tertangkap oleh output nyata (FR-06)', async () => {
    const flow = flowWith(F.stage2(), F.stage3(), F.stage4(), F.stage5());
    await projectThrough(flow, 'stage4');
    // Draft tahap 4 diganti dengan versi berkesalahan, seperti uji end-to-end sebelum tahap 5.
    const { draft, flaws } = injectFlaws(JSON.parse(F.stage4().result) as Stage4Output);
    t.db
      .update(stageRuns)
      .set({ outputJson: JSON.stringify(draft) })
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage4')))
      .run();
    await runStage(flow, 'stage5');

    const prompt = flow.runner.prompts[3] as string;
    expect(prompt).toContain('"id": "F-90"');
    expect(prompt).toContain('serverless function dengan database SQLite');
    expect(prompt).toContain('marketplace untuk banyak gym');
    const review = currentOutput<Stage5Output>(t.db, 'p1', 'stage5') as Stage5Output;
    expect(scoreReview(review, flaws)).toEqual([
      { flaw: 'scope_creep', detected: true, by: 'RV-04' },
      { flaw: 'dependency_order', detected: true, by: 'RV-02' },
      { flaw: 'stack_deploy', detected: true, by: 'RV-01' },
      { flaw: 'consistency', detected: true, by: 'RV-05' },
    ]);
  });

  it('temuan tanpa bukti ditolak lalu dicoba ulang dengan daftar error', async () => {
    const broken = structuredClone(stage5());
    (broken.findings[0] as Stage5Output['findings'][number]).evidence = '';
    const flow = flowWith(
      F.stage2(),
      F.stage3(),
      F.stage4(),
      {
        ...F.stage5(),
        result: JSON.stringify(broken),
      },
      F.stage5(),
    );
    await projectThrough(flow, 'stage4');
    await runStage(flow, 'stage5');
    expect(flow.runner.prompts[4]).toContain('- findings[0].evidence kosong');
    const runs = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage5')))
      .all();
    expect(runs.map((r) => [r.attempt, r.status, r.isCurrent])).toEqual([
      [1, 'failed', 0],
      [2, 'succeeded', 1],
    ]);
  });
});

describe('PUT /api/projects/{id}/decisions/review1', () => {
  it('404 untuk review yang tidak dikenal dan proyek yang tidak ada; 409 sebelum review dijalankan', async () => {
    const flow = flowWith();
    insertProject(flow);
    expect((await putDecisions(flow, { choices: [] }, 'review9')).status).toBe(404);
    expect((await putDecisions(flow, { choices: [] }, 'review1', 'tidak-ada')).status).toBe(404);
    const conflict = await putDecisions(flow, { choices: [] });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.message).toBe(
      'Jalankan review kritis dulu sebelum memutuskan temuan.',
    );
  });

  it('422 bila opsi atau temuan tidak ada, dan tidak ada yang tersimpan', async () => {
    const flow = flowWith(F.stage2(), F.stage3(), F.stage4(), F.stage5());
    await projectThrough(flow, 'stage4');
    await runStage(flow, 'stage5');

    const response = await putDecisions(flow, {
      choices: [
        { findingId: 'RV-01', option: 'Opsi karangan' },
        { findingId: 'RV-99', option: 'Apa saja' },
      ],
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error.details).toEqual({
      'RV-01': 'Opsi tidak ada untuk temuan ini: Opsi karangan.',
      'RV-99': 'Temuan tidak ada di hasil review.',
    });
    const label = stage5().findings[0]?.recommended_option;
    const twice = await putDecisions(flow, {
      choices: [
        { findingId: 'RV-01', option: label },
        { findingId: 'RV-01', option: label },
      ],
    });
    expect(twice.status).toBe(422);
    expect((await putDecisions(flow, { choices: 'RV-01' })).status).toBe(422);
    expect(decisionRows()).toEqual([]);
    expect(projectRow(t.db)?.currentStage).toBe('stage5');
  });

  it('pilihan tersimpan sebagai keputusan RV-xx dengan konsekuensinya; default rekomendasi; proyek pindah ke tahap 6', async () => {
    const flow = flowWith(F.stage2(), F.stage3(), F.stage4(), F.stage5());
    await projectThrough(flow, 'stage4');
    await runStage(flow, 'stage5');
    const review = stage5();
    const [first, second] = review.findings as [
      Stage5Output['findings'][number],
      Stage5Output['findings'][number],
    ];
    const other = second.options.find((o) => o.label !== second.recommended_option);
    if (!other) throw new Error('fixture RV-02 butuh opsi selain rekomendasi');

    const response = await putDecisions(flow, {
      choices: [{ findingId: second.id, option: other.label }],
    });
    expect(response.status).toBe(200);
    expect((await response.json()).currentStage).toBe('stage6');
    expect(projectRow(t.db)?.currentStage).toBe('stage6');

    const rows = decisionRows();
    expect(rows.map((r) => r.code)).toEqual(review.findings.map((f) => f.id));
    expect(rows[0]).toMatchObject({
      code: first.id,
      origin: 'review1',
      category: first.category,
      finding: first.finding,
      chosenOption: first.recommended_option,
      consequence: first.options.find((o) => o.label === first.recommended_option)?.consequence,
    });
    expect(rows[1]).toMatchObject({
      code: second.id,
      chosenOption: other.label,
      consequence: other.consequence,
    });

    // Simpan ulang mengganti seluruh keputusan review ini.
    await putDecisions(flow, { choices: [] });
    expect(decisionRows()[1]?.chosenOption).toBe(second.recommended_option);
    expect(decisionRows()).toHaveLength(review.findings.length);
  });

  it('menjalankan ulang review menghapus keputusan RV-xx lama, tetapi keputusan D-01 tetap', async () => {
    const flow = flowWith(F.stage2(), F.stage3(), F.stage4(), F.stage5(), F.stage5());
    await projectThrough(flow, 'stage5');
    t.db
      .insert(decisions)
      .values({
        id: 'd1',
        projectId: 'p1',
        code: 'D-01',
        origin: 'profile',
        category: 'stack',
        finding: 'x',
        chosenOption: 'x',
        consequence: 'x',
        createdAt: clock(),
      })
      .run();
    expect(decisionRows()).toHaveLength(stage5().findings.length + 1);

    await runStage(flow, 'stage5');
    expect(decisionRows().map((r) => r.code)).toEqual(['D-01']);
    expect(projectRow(t.db)?.currentStage).toBe('stage5');
  });
});
