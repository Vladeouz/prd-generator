// Tahap 7a (T-026) dengan proyek gym sampai review kedua diputuskan. Definisinya dijalankan langsung
// lewat `runStage`, karena job tahap 7 baru menyusun 7a + 7b di T-027.
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { Clock } from '../../../src/core/clock.ts';
import { stageRuns } from '../../../src/core/db/schema.ts';
import { currentOutput, runStage as runDefinition } from '../../../src/stages/run-stage.ts';
import { stage7aDefinition } from '../../../src/stages/stage-7a/definition.ts';
import type { Stage7aOutput } from '../../../src/stages/stage-7a/validate.ts';
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
  TEMPLATE_CONVENTIONS,
  TEMPLATE_SECTIONS,
  type TemplateRepo,
} from '../../helpers/template-repo.ts';

let t: TestDb;
let template: TemplateRepo;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 21, 4, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

const taskList = () => loadClaudeFixture('derived/stage7a-gym');

/** Proyek gym di tahap 7: PRD tertulis dan review kedua diputuskan tanpa perbaikan. */
async function projectAtStage7(): Promise<Flow> {
  const flow = createFlow(
    t.db,
    clock,
    [F.stage2(), F.stage3(), F.stage4(), F.stage5(), F.stage6(), F.review2()],
    { templateDir: template.dir },
  );
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
  expect(projectRow(t.db)?.currentStage).toBe('stage7');
  return flow;
}

const runs7a = () =>
  t.db
    .select()
    .from(stageRuns)
    .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage7a')))
    .all()
    .sort((a, b) => a.attempt - b.attempt);

describe('tahap 7a: daftar task', () => {
  it('prompt berisi ringkasan PRD (bukan PRD utuh) dan bagian konvensi 7a; output tercatat sebagai stage7a', async () => {
    await projectAtStage7();
    const runner = new FakeClaudeRunner([taskList()]);
    const definition = stage7aDefinition({ templateDir: () => template.dir });
    expect(definition.notReadyReason?.({ db: t.db, projectId: 'p1' })).toBeNull();
    await runDefinition({ db: t.db, runner, clock }, definition, 'p1');

    const prompt = runner.prompts[0] as string;
    expect(prompt).toContain('Kamu adalah tahap "Daftar Task"');
    expect(prompt).toContain(
      'Functional Requirements:\n- FR-01: Daftar, login, logout, dan reset password',
    );
    expect(prompt).toContain('- Fase 3 — Notifikasi: ');
    expect(prompt).toContain('Tabel (erDiagram): GYMS, USERS,');
    // PRD utuh tidak dikirim: heading dan isi bagian lain tidak ada.
    expect(prompt).not.toContain('## 4. Data Model');
    expect(prompt).not.toContain('## 8. Assumptions & Decisions');
    expect(prompt.length).toBeLessThan(F.stage6().result.length / 2);
    expect(prompt).toContain(`"""\n${EXPECTED_SECTIONS.stage7a}\n"""`);
    // Bagian tahap lain (misalnya Test API milik 7b) tidak ikut.
    expect(prompt).not.toContain(TEMPLATE_SECTIONS.testApi);
    expect(prompt).toContain('(salah satu dari: infra, db, api, app, test, docs)');
    expect(prompt).toContain('tabel yang sudah disediakan template (users)');
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);

    expect(runs7a()).toMatchObject([
      { attempt: 1, status: 'succeeded', scope: null, promptVersion: '3', isCurrent: 1 },
    ]);
    const output = currentOutput<Stage7aOutput>(t.db, 'p1', 'stage7a');
    expect(output?.tasks).toHaveLength(42);
  });

  it('daftar dengan task setup template ditolak, lalu percobaan ulang dengan daftar error diterima', async () => {
    await projectAtStage7();
    const invalid = JSON.parse(taskList().result) as Stage7aOutput;
    // Task pertama diganti setup template (menambah task di depan membuat task lain tanpa depends_on).
    invalid.tasks[0] = {
      ...(invalid.tasks[0] as Stage7aOutput['tasks'][number]),
      title: 'Setup monorepo dan Docker Compose',
    };
    const runner = new FakeClaudeRunner([
      { ...taskList(), result: JSON.stringify(invalid) },
      taskList(),
    ]);
    await runDefinition(
      { db: t.db, runner, clock },
      stage7aDefinition({ templateDir: () => template.dir }),
      'p1',
    );
    expect(runs7a().map((r) => r.status)).toEqual(['failed', 'succeeded']);
    expect(JSON.parse(runs7a()[0]?.errorsJson ?? '[]')).toEqual([
      'T-001 adalah setup yang sudah disediakan template (monorepo, Docker Compose)',
    ]);
    expect(runner.prompts[1]).toContain(
      '- T-001 adalah setup yang sudah disediakan template (monorepo, Docker Compose)',
    );
  });

  it('heading konvensi 7a tidak ada: gagal menyebut heading-nya tanpa memanggil claude', async () => {
    await projectAtStage7();
    template.remove();
    template = createTemplateRepo(
      TEMPLATE_CONVENTIONS.replace(TEMPLATE_SECTIONS.notes, '## Contoh notes'),
    );
    const runner = new FakeClaudeRunner([]);
    await expect(
      runDefinition(
        { db: t.db, runner, clock },
        stage7aDefinition({ templateDir: () => template.dir }),
        'p1',
      ),
    ).rejects.toThrow(
      'Daftar task belum bisa dibuat: Bagian `## Menghapus fitur contoh notes` tidak ada di `docs/conventions.md` template, padahal dibutuhkan tahap 7a (daftar task).',
    );
    expect(runner.prompts).toHaveLength(0);
    expect(runs7a()).toEqual([]);
  });
});
