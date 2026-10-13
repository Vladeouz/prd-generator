// Domain proyek (FR-01): membuat, mendaftar, membaca detail, dan menghapus proyek.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Clock } from '../core/clock.ts';
import type { Db } from '../core/db/client.ts';
import {
  ACTIVE_JOB_STATUSES,
  answers,
  type DOCUMENT_KINDS,
  decisions,
  documents,
  featureChoices,
  jobs,
  projects,
  STAGES,
  stageRuns,
} from '../core/db/schema.ts';
import { AppError } from '../core/errors.ts';
import type { CreateProjectInput } from './schema.ts';

export type Project = typeof projects.$inferSelect;
export type Stage = (typeof STAGES)[number];
export type TokenTotals = { inputTokens: number; outputTokens: number };

export type ProjectSummary = Project & {
  /** Tahap terakhir (urutan alur) yang punya output berlaku; null bila belum ada. */
  lastCompletedStage: Stage | null;
  /** Jumlah token semua pemanggilan proyek ini, termasuk percobaan yang gagal. */
  totalTokens: TokenTotals;
};

export type ProjectDetail = ProjectSummary & {
  completedStages: Stage[];
  answers: (Omit<typeof answers.$inferSelect, 'valueJson'> & { value: unknown })[];
  featureChoices: (typeof featureChoices.$inferSelect)[];
  decisions: (typeof decisions.$inferSelect)[];
  documents: Record<(typeof DOCUMENT_KINDS)[number], typeof documents.$inferSelect | null>;
  activeJob: typeof jobs.$inferSelect | null;
  /** Job terbaru proyek ini (status apa pun), untuk menampilkan hasil atau error terakhir. */
  latestJob: typeof jobs.$inferSelect | null;
  /** Output yang berlaku per tahap (hasil parse `output_json`). */
  stageOutputs: Partial<Record<Stage, unknown>>;
};

export type ProjectDeps = { db: Db; clock: Clock };

const NOT_FOUND = () => new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');

export function createProject({ db, clock }: ProjectDeps, input: CreateProjectInput): Project {
  const now = clock();
  return db
    .insert(projects)
    .values({
      id: randomUUID(),
      name: input.name,
      idea: input.idea,
      // Proyek baru: tahap klarifikasi produk siap dijalankan (FR-01).
      currentStage: 'stage2',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

/** Tahap dengan output berlaku per proyek, diurutkan sesuai alur. */
function completedStagesByProject(db: Db, projectIds: string[]): Map<string, Stage[]> {
  const rows = projectIds.length
    ? db
        .select({ projectId: stageRuns.projectId, stage: stageRuns.stage })
        .from(stageRuns)
        .where(
          and(
            inArray(stageRuns.projectId, projectIds),
            eq(stageRuns.isCurrent, 1),
            eq(stageRuns.status, 'succeeded'),
          ),
        )
        .all()
    : [];
  const result = new Map<string, Stage[]>();
  for (const { projectId, stage } of rows) {
    result.set(projectId, [...(result.get(projectId) ?? []), stage]);
  }
  for (const stages of result.values()) {
    stages.sort((a, b) => STAGES.indexOf(a) - STAGES.indexOf(b));
  }
  return result;
}

function tokensByProject(db: Db, projectIds: string[]): Map<string, TokenTotals> {
  const rows = projectIds.length
    ? db
        .select({
          projectId: stageRuns.projectId,
          inputTokens: sql<number>`coalesce(sum(${stageRuns.inputTokens}), 0)`,
          outputTokens: sql<number>`coalesce(sum(${stageRuns.outputTokens}), 0)`,
        })
        .from(stageRuns)
        .where(inArray(stageRuns.projectId, projectIds))
        .groupBy(stageRuns.projectId)
        .all()
    : [];
  return new Map(rows.map(({ projectId, ...totals }) => [projectId, totals]));
}

function summarize(db: Db, list: Project[]): ProjectSummary[] {
  const ids = list.map((project) => project.id);
  const completed = completedStagesByProject(db, ids);
  const tokens = tokensByProject(db, ids);
  return list.map((project) => ({
    ...project,
    lastCompletedStage: completed.get(project.id)?.at(-1) ?? null,
    totalTokens: tokens.get(project.id) ?? { inputTokens: 0, outputTokens: 0 },
  }));
}

/** Semua proyek, terbaru dulu. */
export function listProjects({ db }: Pick<ProjectDeps, 'db'>): ProjectSummary[] {
  const list = db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .all();
  return summarize(db, list);
}

export function getProjectDetail({ db }: Pick<ProjectDeps, 'db'>, id: string): ProjectDetail {
  const project = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!project) throw NOT_FOUND();
  const [summary] = summarize(db, [project]) as [ProjectSummary];

  const latestDocument = (kind: (typeof DOCUMENT_KINDS)[number]) =>
    db
      .select()
      .from(documents)
      .where(and(eq(documents.projectId, id), eq(documents.kind, kind)))
      .orderBy(desc(documents.version))
      .get() ?? null;

  return {
    ...summary,
    completedStages: completedStagesByProject(db, [id]).get(id) ?? [],
    answers: db
      .select()
      .from(answers)
      .where(eq(answers.projectId, id))
      .all()
      .map(({ valueJson, ...answer }) => ({ ...answer, value: JSON.parse(valueJson) })),
    featureChoices: db.select().from(featureChoices).where(eq(featureChoices.projectId, id)).all(),
    decisions: db.select().from(decisions).where(eq(decisions.projectId, id)).all(),
    documents: { prd: latestDocument('prd'), tasks: latestDocument('tasks') },
    activeJob:
      db
        .select()
        .from(jobs)
        .where(and(eq(jobs.projectId, id), inArray(jobs.status, [...ACTIVE_JOB_STATUSES])))
        .get() ?? null,
    latestJob:
      db
        .select()
        .from(jobs)
        .where(eq(jobs.projectId, id))
        .orderBy(desc(jobs.createdAt), desc(jobs.id))
        .get() ?? null,
    stageOutputs: Object.fromEntries(
      db
        .select({ stage: stageRuns.stage, outputJson: stageRuns.outputJson })
        .from(stageRuns)
        .where(and(eq(stageRuns.projectId, id), eq(stageRuns.isCurrent, 1)))
        .all()
        .map(({ stage, outputJson }) => [stage, JSON.parse(outputJson ?? 'null')]),
    ),
  };
}

/**
 * Menghapus proyek beserta semua datanya (cascade). `CONFLICT` bila proyek ini punya job yang
 * sedang berjalan; pemeriksaan dan penghapusan dalam satu transaksi.
 */
export function deleteProject({ db }: Pick<ProjectDeps, 'db'>, id: string): void {
  db.transaction((tx) => {
    const project = tx.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).get();
    if (!project) throw NOT_FOUND();
    const active = tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.projectId, id), inArray(jobs.status, [...ACTIVE_JOB_STATUSES])))
      .get();
    if (active) {
      throw new AppError(
        'CONFLICT',
        'Proyek ini sedang menjalankan sebuah tahap. Tunggu sampai selesai sebelum menghapusnya.',
        { activeJobId: active.id },
      );
    }
    tx.delete(projects).where(eq(projects.id, id)).run();
  });
}

export type StageUsage = TokenTotals & {
  /** Durasi run yang berlaku (null bila belum ada run yang berhasil). */
  durationMs: number | null;
};

/** Token per tahap (semua percobaan, termasuk yang gagal) dan durasi run yang berlaku. */
export function getStageUsage(
  { db }: Pick<ProjectDeps, 'db'>,
  id: string,
): Partial<Record<Stage, StageUsage>> {
  const rows = db
    .select({
      stage: stageRuns.stage,
      inputTokens: stageRuns.inputTokens,
      outputTokens: stageRuns.outputTokens,
      durationMs: stageRuns.durationMs,
      isCurrent: stageRuns.isCurrent,
    })
    .from(stageRuns)
    .where(eq(stageRuns.projectId, id))
    .all();
  const usage: Partial<Record<Stage, StageUsage>> = {};
  for (const row of rows) {
    const total = usage[row.stage] ?? { inputTokens: 0, outputTokens: 0, durationMs: null };
    total.inputTokens += row.inputTokens ?? 0;
    total.outputTokens += row.outputTokens ?? 0;
    if (row.isCurrent === 1) total.durationMs = row.durationMs;
    usage[row.stage] = total;
  }
  return usage;
}
