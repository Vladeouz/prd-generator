import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  answers,
  decisions,
  documents,
  featureChoices,
  jobs,
  projects,
  stageRuns,
} from '../../../src/core/db/schema';
import { createTestDb, type TestDb } from '../../helpers/db';

const NOW = '2026-10-12T00:00:00.000Z';
let t: TestDb;
let seq = 0;
const id = () => `id-${++seq}`;

beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.close());

function insertProject(projectId = id()) {
  t.db
    .insert(projects)
    .values({
      id: projectId,
      name: 'Gym',
      idea: 'Aplikasi membership gym',
      currentStage: 'stage2',
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  return projectId;
}

/** Baris valid per tabel anak; `override` mengganti satu kolom (nama kolom SQL). */
const validRows = {
  stage_runs: (projectId: string) => ({
    id: id(),
    project_id: projectId,
    stage: 'stage2',
    attempt: 1,
    prompt_version: '1',
    status: 'succeeded',
    is_current: 0,
    created_at: NOW,
  }),
  answers: (projectId: string) => ({
    id: id(),
    project_id: projectId,
    stage: 'stage2',
    question_id: 'q1',
    topic: 'masalah',
    value_json: '"x"',
    source: 'user',
    created_at: NOW,
  }),
  decisions: (projectId: string) => ({
    id: id(),
    project_id: projectId,
    code: `RV-${seq}`,
    origin: 'review1',
    category: 'security',
    finding: 'f',
    chosen_option: 'o',
    consequence: 'c',
    created_at: NOW,
  }),
  feature_choices: (projectId: string) => ({
    id: id(),
    project_id: projectId,
    feature_code: `F-${seq}`,
    accepted: 1,
  }),
  documents: (projectId: string) => ({
    id: id(),
    project_id: projectId,
    kind: 'prd',
    version: seq,
    content: '# PRD',
    created_at: NOW,
  }),
  jobs: (projectId: string) => ({
    id: id(),
    project_id: projectId,
    stage: 'stage2',
    status: 'succeeded',
    created_at: NOW,
  }),
};
type ChildTable = keyof typeof validRows;

function insertRaw(table: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  t.db.$client
    .prepare(
      `insert into ${table} (${columns.join(', ')}) values (${columns.map((c) => `@${c}`).join(', ')})`,
    )
    .run(row);
}

function insertChild(table: ChildTable, projectId: string, override: Record<string, unknown> = {}) {
  insertRaw(table, { ...validRows[table](projectId), ...override });
}

function count(table: string) {
  return (t.db.$client.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
}

describe('tabel', () => {
  it('semua tabel di PRD bagian 4 ada', () => {
    const names = t.db.$client
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like '\\_%' escape '\\' and name not like 'sqlite%' order by name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    expect(names).toEqual([
      'answers',
      'decisions',
      'documents',
      'feature_choices',
      'jobs',
      'projects',
      'stage_runs',
    ]);
  });

  it('foreign key aktif dan menolak project_id yang tidak ada', () => {
    expect(t.db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() => insertChild('answers', 'tidak-ada')).toThrow(/FOREIGN KEY/);
  });
});

describe('CHECK pada kolom enum', () => {
  const cases: [string, string, string, string][] = [
    ['projects', 'current_stage', 'stage1', 'export'],
    ['projects', 'profile_choice', 'B', 'A_with_seo_mitigation'],
    ['stage_runs', 'stage', 'stage8', 'review2'],
    ['stage_runs', 'status', 'running', 'failed'],
    ['answers', 'stage', 'stage1', 'stage3'],
    ['answers', 'source', 'ai', 'guess'],
    ['decisions', 'origin', 'review3', 'profile'],
    ['documents', 'kind', 'claude', 'tasks'],
    ['jobs', 'stage', 'export', 'stage7'],
    ['jobs', 'status', 'cancelled', 'interrupted'],
  ];

  it.each(cases)('%s.%s menolak %s dan menerima %s', (table, column, invalid, valid) => {
    const insert = (value: string) => {
      if (table === 'projects') {
        insertRaw('projects', {
          id: id(),
          name: 'p',
          idea: 'i',
          current_stage: 'stage2',
          created_at: NOW,
          updated_at: NOW,
          [column]: value,
        });
      } else {
        insertChild(table as ChildTable, insertProject(), { [column]: value });
      }
    };
    expect(() => insert(invalid)).toThrow(/CHECK constraint failed/);
    expect(() => insert(valid)).not.toThrow();
  });

  it('profile_choice boleh null', () => {
    insertProject();
    expect(count('projects')).toBe(1);
  });

  it.each([
    ['stage_runs', 'is_current', 2],
    ['stage_runs', 'attempt', 0],
    ['feature_choices', 'accepted', 2],
    ['documents', 'version', 0],
  ] as const)('%s.%s menolak %s', (table, column, value) => {
    expect(() => insertChild(table, insertProject(), { [column]: value })).toThrow(
      /CHECK constraint failed/,
    );
  });
});

describe('partial unique index', () => {
  it('hanya satu stage_runs is_current = 1 per (project, stage)', () => {
    const p = insertProject();
    insertChild('stage_runs', p, { is_current: 1 });
    expect(() => insertChild('stage_runs', p, { is_current: 1 })).toThrow(/UNIQUE/);
    // Yang tidak berlaku boleh banyak; tahap atau proyek lain tidak terpengaruh.
    insertChild('stage_runs', p, { is_current: 0 });
    insertChild('stage_runs', p, { is_current: 0 });
    insertChild('stage_runs', p, { is_current: 1, stage: 'stage3' });
    insertChild('stage_runs', insertProject(), { is_current: 1 });
    expect(count('stage_runs')).toBe(5);
  });

  it('hanya satu job queued atau running di seluruh aplikasi', () => {
    const first = insertProject();
    const other = insertProject();
    insertChild('jobs', first, { id: 'job-aktif', status: 'running' });
    expect(() => insertChild('jobs', other, { status: 'queued' })).toThrow(/UNIQUE/);
    expect(() => insertChild('jobs', other, { status: 'running' })).toThrow(/UNIQUE/);
    // Job selesai tidak dibatasi.
    for (const status of ['succeeded', 'failed', 'interrupted']) {
      insertChild('jobs', other, { status });
      insertChild('jobs', other, { status });
    }
    // Setelah job aktif selesai, job baru boleh dimulai.
    t.db.update(jobs).set({ status: 'succeeded' }).where(eq(jobs.id, 'job-aktif')).run();
    insertChild('jobs', other, { status: 'queued' });
    expect(() =>
      t.db.update(jobs).set({ status: 'running' }).where(eq(jobs.id, 'job-aktif')).run(),
    ).toThrow(/UNIQUE/);
  });
});

describe('unique lain', () => {
  it('decisions.code unik per proyek', () => {
    const p = insertProject();
    insertChild('decisions', p, { code: 'RV-01' });
    expect(() => insertChild('decisions', p, { code: 'RV-01' })).toThrow(/UNIQUE/);
    insertChild('decisions', insertProject(), { code: 'RV-01' });
  });

  it('documents (project, kind, version) dan feature_choices (project, feature) unik', () => {
    const p = insertProject();
    insertChild('documents', p, { kind: 'prd', version: 1 });
    expect(() => insertChild('documents', p, { kind: 'prd', version: 1 })).toThrow(/UNIQUE/);
    insertChild('documents', p, { kind: 'tasks', version: 1 });
    insertChild('feature_choices', p, { feature_code: 'F-01' });
    expect(() => insertChild('feature_choices', p, { feature_code: 'F-01' })).toThrow(/UNIQUE/);
  });
});

describe('cascade', () => {
  it('menghapus proyek menghapus semua datanya, data proyek lain tetap', () => {
    const doomed = insertProject();
    const kept = insertProject();
    for (const projectId of [doomed, kept]) {
      for (const table of Object.keys(validRows) as ChildTable[]) {
        insertChild(table, projectId);
      }
    }
    t.db.delete(projects).where(eq(projects.id, doomed)).run();

    for (const table of [stageRuns, answers, decisions, featureChoices, documents, jobs]) {
      const rows = t.db.select({ projectId: table.projectId }).from(table).all();
      expect(rows).toEqual([{ projectId: kept }]);
    }
  });
});

describe('database test', () => {
  it('berada di folder sementara OS', () => {
    expect(t.path.startsWith(tmpdir())).toBe(true);
  });
});
