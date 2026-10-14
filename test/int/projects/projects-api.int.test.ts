import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/core/clock.ts';
import {
  answers,
  decisions,
  documents,
  featureChoices,
  jobs,
  projects,
  stageRuns,
} from '../../../src/core/db/schema.ts';
import { projectHandlers } from '../../../src/projects/handlers.ts';
import { getStageUsage } from '../../../src/projects/projects.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';

let t: TestDb;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 12, 0, 0, tick++)).toISOString();
let api: ReturnType<typeof projectHandlers>;

beforeEach(() => {
  t = createTestDb();
  tick = 0;
  api = projectHandlers({ db: t.db, clock });
});
afterEach(() => t.close());

const post = (body: unknown) =>
  api.create(
    new Request('http://127.0.0.1/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

async function createProject(name = 'Gym', idea = 'Aplikasi membership untuk sebuah gym.') {
  const response = await post({ name, idea });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string };
}

let runSeq = 0;
function insertRun(
  projectId: string,
  stage: 'stage2' | 'stage3' | 'stage4',
  values: {
    status?: 'succeeded' | 'failed';
    isCurrent?: 0 | 1;
    input?: number;
    output?: number;
  } = {},
) {
  t.db
    .insert(stageRuns)
    .values({
      id: `run-${++runSeq}`,
      projectId,
      stage,
      attempt: 1,
      promptVersion: '1',
      status: values.status ?? 'succeeded',
      isCurrent: values.isCurrent ?? 1,
      inputTokens: values.input ?? 100,
      outputTokens: values.output ?? 10,
      createdAt: clock(),
    })
    .run();
}

function insertJob(projectId: string, status: 'running' | 'queued' | 'succeeded') {
  t.db
    .insert(jobs)
    .values({
      id: `job-${projectId}-${status}`,
      projectId,
      stage: 'stage2',
      status,
      createdAt: clock(),
    })
    .run();
}

describe('POST /api/projects', () => {
  it('menyimpan proyek dengan tahap klarifikasi produk siap dijalankan', async () => {
    const response = await post({ name: '  Gym  ', idea: '  Aplikasi membership gym.  ' });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      id: expect.any(String),
      name: 'Gym',
      idea: 'Aplikasi membership gym.',
      currentStage: 'stage2',
      profileChoice: null,
      templateCommit: null,
      createdAt: '2026-10-12T00:00:00.000Z',
      updatedAt: '2026-10-12T00:00:00.000Z',
    });
    expect(t.db.select().from(projects).where(eq(projects.id, body.id)).get()).toMatchObject({
      currentStage: 'stage2',
    });
  });

  it.each([
    ['kosong', ''],
    ['hanya spasi', '   \n  '],
    ['lebih dari 4000 karakter', 'a'.repeat(4001)],
  ])('ide %s → 422 dengan details.idea, tidak tersimpan', async (_label, idea) => {
    const response = await post({ name: 'Gym', idea });
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.idea).toMatch(/Ide (wajib diisi|maksimal 4000 karakter)\./);
    expect(t.db.select().from(projects).all()).toEqual([]);
  });

  it('ide tepat 4000 karakter diterima', async () => {
    expect((await post({ name: 'Gym', idea: 'a'.repeat(4000) })).status).toBe(201);
  });

  it('ide tidak dikirim → 422 dengan details.idea', async () => {
    const body = await (await post({ name: 'Gym' })).json();
    expect(body.error.details).toEqual({ idea: 'Ide wajib diisi.' });
  });

  it('nama kosong → 422 dengan details.name', async () => {
    const body = await (await post({ name: '', idea: 'Ide' })).json();
    expect(body.error.details).toEqual({ name: 'Nama proyek wajib diisi.' });
  });

  it('body bukan JSON → 400', async () => {
    const response = await post('bukan json');
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('BAD_REQUEST');
  });
});

describe('GET /api/projects', () => {
  it('terbaru dulu, dengan tahap terakhir yang selesai dan total token', async () => {
    const older = await createProject('Lama');
    const newer = await createProject('Baru');
    insertRun(older.id, 'stage2', { input: 1000, output: 50 });
    insertRun(older.id, 'stage3', { status: 'failed', isCurrent: 0, input: 200, output: 5 });
    insertRun(older.id, 'stage3', { input: 300, output: 20 });
    // Output lama yang sudah tidak berlaku tidak dihitung sebagai tahap selesai.
    insertRun(older.id, 'stage4', { isCurrent: 0, input: 1, output: 1 });

    const response = await api.list();
    expect(response.status).toBe(200);
    const list = await response.json();
    expect(list.map((project: { name: string }) => project.name)).toEqual(['Baru', 'Lama']);
    expect(list[0]).toMatchObject({
      id: newer.id,
      lastCompletedStage: null,
      totalTokens: { inputTokens: 0, outputTokens: 0 },
    });
    expect(list[1]).toMatchObject({
      id: older.id,
      lastCompletedStage: 'stage3',
      totalTokens: { inputTokens: 1501, outputTokens: 76 },
    });
  });
});

describe('GET /api/projects/{id}', () => {
  it('detail berisi tahap saat ini, jawaban, pilihan, keputusan, dokumen terakhir, job aktif, total token', async () => {
    const { id } = await createProject();
    insertRun(id, 'stage2', { input: 500, output: 40 });
    const now = clock();
    t.db
      .insert(answers)
      .values({
        id: 'a1',
        projectId: id,
        stage: 'stage2',
        questionId: 'q1',
        topic: 'masalah',
        valueJson: JSON.stringify('Susah memantau member'),
        source: 'guess',
        createdAt: now,
      })
      .run();
    t.db
      .insert(featureChoices)
      .values({ id: 'f1', projectId: id, featureCode: 'F-90', accepted: 0 })
      .run();
    t.db
      .insert(decisions)
      .values({
        id: 'd1',
        projectId: id,
        code: 'RV-01',
        origin: 'review1',
        category: 'security',
        finding: 'f',
        chosenOption: 'o',
        consequence: 'c',
        createdAt: now,
      })
      .run();
    for (const version of [1, 2]) {
      t.db
        .insert(documents)
        .values({
          id: `doc-${version}`,
          projectId: id,
          kind: 'prd',
          version,
          content: `# PRD v${version}`,
          createdAt: now,
        })
        .run();
    }
    insertJob(id, 'running');

    const response = await api.get(id);
    expect(response.status).toBe(200);
    const detail = await response.json();
    expect(detail).toMatchObject({
      id,
      currentStage: 'stage2',
      lastCompletedStage: 'stage2',
      completedStages: ['stage2'],
      totalTokens: { inputTokens: 500, outputTokens: 40 },
      answers: [{ questionId: 'q1', value: 'Susah memantau member', source: 'guess' }],
      featureChoices: [{ featureCode: 'F-90', accepted: 0 }],
      decisions: [{ code: 'RV-01' }],
      documents: { prd: { version: 2, content: '# PRD v2' }, tasks: null },
      activeJob: { status: 'running' },
    });
  });

  it('proyek tidak ada → 404', async () => {
    const response = await api.get('tidak-ada');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Proyek tidak ditemukan.' },
    });
  });
});

describe('DELETE /api/projects/{id}', () => {
  function seedEverything(projectId: string) {
    insertRun(projectId, 'stage2');
    const now = clock();
    t.db
      .insert(answers)
      .values({
        id: `a-${projectId}`,
        projectId,
        stage: 'stage2',
        questionId: 'q1',
        topic: 't',
        valueJson: '"x"',
        source: 'user',
        createdAt: now,
      })
      .run();
    t.db
      .insert(featureChoices)
      .values({ id: `f-${projectId}`, projectId, featureCode: 'F-01', accepted: 1 })
      .run();
    t.db
      .insert(decisions)
      .values({
        id: `d-${projectId}`,
        projectId,
        code: 'D-01',
        origin: 'profile',
        category: 'stack',
        finding: 'f',
        chosenOption: 'A',
        consequence: 'c',
        createdAt: now,
      })
      .run();
    t.db
      .insert(documents)
      .values({
        id: `doc-${projectId}`,
        projectId,
        kind: 'tasks',
        version: 1,
        content: '#',
        createdAt: now,
      })
      .run();
    insertJob(projectId, 'succeeded');
  }

  const countFor = (projectId: string) =>
    [stageRuns, answers, featureChoices, decisions, documents, jobs].map(
      (table) => t.db.select().from(table).where(eq(table.projectId, projectId)).all().length,
    );

  it('menghapus proyek dan semua datanya; proyek lain tidak tersentuh', async () => {
    const doomed = await createProject('Dihapus');
    const kept = await createProject('Tetap');
    seedEverything(doomed.id);
    seedEverything(kept.id);

    const response = await api.remove(doomed.id);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(
      t.db
        .select()
        .from(projects)
        .all()
        .map((project) => project.name),
    ).toEqual(['Tetap']);
    expect(countFor(doomed.id)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(countFor(kept.id)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it.each(['running', 'queued'] as const)(
    'job %s untuk proyek itu → 409, data tetap utuh',
    async (status) => {
      const { id } = await createProject();
      seedEverything(id);
      insertJob(id, status);

      const response = await api.remove(id);
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toContain('sedang menjalankan sebuah tahap');
      expect(t.db.select().from(projects).all()).toHaveLength(1);
      expect(countFor(id)).toEqual([1, 1, 1, 1, 1, 2]);
    },
  );

  it('job berjalan di proyek LAIN tidak menghalangi penghapusan', async () => {
    const doomed = await createProject('Dihapus');
    const busy = await createProject('Sibuk');
    insertJob(busy.id, 'running');
    expect((await api.remove(doomed.id)).status).toBe(204);
  });

  it('proyek tidak ada → 404', async () => {
    expect((await api.remove('tidak-ada')).status).toBe(404);
  });
});

describe('getStageUsage (stepper dan panel pemakaian, T-020)', () => {
  it('token per tahap dari semua percobaan; durasi dari run yang berlaku', async () => {
    const { id } = await createProject();
    const other = await createProject('Lain', 'Ide lain.');
    insertRun(id, 'stage2', { status: 'failed', isCurrent: 0, input: 900, output: 90 });
    insertRun(id, 'stage2', { input: 24_100, output: 1_500 });
    t.db
      .update(stageRuns)
      .set({ durationMs: 19_000 })
      .where(eq(stageRuns.id, `run-${runSeq}`))
      .run();
    insertRun(id, 'stage3', { status: 'failed', isCurrent: 0, input: 50, output: 5 });
    insertRun(other.id, 'stage2', { input: 7, output: 7 });

    expect(getStageUsage({ db: t.db }, id)).toEqual({
      stage2: { inputTokens: 25_000, outputTokens: 1_590, costUsd: 0, durationMs: 19_000 },
      stage3: { inputTokens: 50, outputTokens: 5, costUsd: 0, durationMs: null },
    });
    expect(getStageUsage({ db: t.db }, 'tidak-ada')).toEqual({});
  });
});
