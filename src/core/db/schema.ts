// Skema SQLite sesuai PRD bagian 4. Setiap kolom enum dibatasi CHECK; daftar nilainya diekspor agar
// dipakai ulang oleh skema Zod. Id dan timestamp diisi aplikasi (timestamp ISO 8601 UTC dari satu
// sumber jam di server), jadi tidak ada default di database.
import { type SQL, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  type SQLiteColumn,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const STAGES = [
  'stage2',
  'stage3',
  'stage4',
  'stage5',
  'stage6',
  'review2',
  'stage7',
] as const;
/** Tahap proyek: tahap yang bisa dijalankan, ditambah `export` setelah TASKS selesai. */
export const PROJECT_STAGES = [...STAGES, 'export'] as const;
export const PROFILE_CHOICES = ['A', 'A_with_seo_mitigation', 'postpone'] as const;
export const STAGE_RUN_STATUSES = ['succeeded', 'failed'] as const;
export const ANSWER_SOURCES = ['user', 'default', 'guess'] as const;
export const DECISION_ORIGINS = ['review1', 'review2', 'profile'] as const;
export const DOCUMENT_KINDS = ['prd', 'tasks'] as const;
export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'interrupted'] as const;
export const ACTIVE_JOB_STATUSES = ['queued', 'running'] as const;

/** `kolom IN ('a', 'b')` untuk CHECK; nilai berasal dari konstanta di atas, bukan input. */
function oneOf(column: SQLiteColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`;
}

const projectId = () =>
  text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' });

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    idea: text('idea').notNull(),
    currentStage: text('current_stage', { enum: PROJECT_STAGES }).notNull(),
    profileChoice: text('profile_choice', { enum: PROFILE_CHOICES }),
    templateCommit: text('template_commit'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    check('projects_current_stage_check', oneOf(t.currentStage, PROJECT_STAGES)),
    check('projects_profile_choice_check', oneOf(t.profileChoice, PROFILE_CHOICES)),
  ],
);

export const stageRuns = sqliteTable(
  'stage_runs',
  {
    id: text('id').primaryKey(),
    projectId: projectId(),
    stage: text('stage', { enum: STAGES }).notNull(),
    attempt: integer('attempt').notNull(),
    promptVersion: text('prompt_version').notNull(),
    status: text('status', { enum: STAGE_RUN_STATUSES }).notNull(),
    outputRaw: text('output_raw'),
    outputJson: text('output_json'),
    errorsJson: text('errors_json'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costEstimateUsd: real('cost_estimate_usd'),
    durationMs: integer('duration_ms'),
    isCurrent: integer('is_current').notNull(),
    createdAt: text('created_at').notNull(),
    finishedAt: text('finished_at'),
  },
  (t) => [
    check('stage_runs_stage_check', oneOf(t.stage, STAGES)),
    check('stage_runs_status_check', oneOf(t.status, STAGE_RUN_STATUSES)),
    check('stage_runs_attempt_check', sql`${t.attempt} >= 1`),
    check('stage_runs_is_current_check', sql`${t.isCurrent} in (0, 1)`),
    index('stage_runs_project_stage_idx').on(t.projectId, t.stage),
    uniqueIndex('stage_runs_one_current_idx')
      .on(t.projectId, t.stage)
      .where(sql`${t.isCurrent} = 1`),
  ],
);

export const answers = sqliteTable(
  'answers',
  {
    id: text('id').primaryKey(),
    projectId: projectId(),
    stage: text('stage', { enum: STAGES }).notNull(),
    questionId: text('question_id').notNull(),
    topic: text('topic').notNull(),
    valueJson: text('value_json').notNull(),
    source: text('source', { enum: ANSWER_SOURCES }).notNull(),
    /** Kunci kebijakan default tahap 3 bila jawaban memakai default; null untuk jawaban lain. */
    policyKey: text('policy_key'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('answers_stage_check', oneOf(t.stage, STAGES)),
    check('answers_source_check', oneOf(t.source, ANSWER_SOURCES)),
    index('answers_project_stage_idx').on(t.projectId, t.stage),
  ],
);

export const decisions = sqliteTable(
  'decisions',
  {
    id: text('id').primaryKey(),
    projectId: projectId(),
    code: text('code').notNull(),
    origin: text('origin', { enum: DECISION_ORIGINS }).notNull(),
    category: text('category').notNull(),
    finding: text('finding').notNull(),
    chosenOption: text('chosen_option').notNull(),
    consequence: text('consequence').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('decisions_origin_check', oneOf(t.origin, DECISION_ORIGINS)),
    uniqueIndex('decisions_project_code_idx').on(t.projectId, t.code),
  ],
);

export const featureChoices = sqliteTable(
  'feature_choices',
  {
    id: text('id').primaryKey(),
    projectId: projectId(),
    featureCode: text('feature_code').notNull(),
    accepted: integer('accepted').notNull(),
  },
  (t) => [
    check('feature_choices_accepted_check', sql`${t.accepted} in (0, 1)`),
    uniqueIndex('feature_choices_project_feature_idx').on(t.projectId, t.featureCode),
  ],
);

export const documents = sqliteTable(
  'documents',
  {
    id: text('id').primaryKey(),
    projectId: projectId(),
    kind: text('kind', { enum: DOCUMENT_KINDS }).notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('documents_kind_check', oneOf(t.kind, DOCUMENT_KINDS)),
    check('documents_version_check', sql`${t.version} >= 1`),
    uniqueIndex('documents_project_kind_version_idx').on(t.projectId, t.kind, t.version),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    projectId: projectId(),
    stage: text('stage', { enum: STAGES }).notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull(),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
  },
  (t) => [
    check('jobs_stage_check', oneOf(t.stage, STAGES)),
    check('jobs_status_check', oneOf(t.status, JOB_STATUSES)),
    index('jobs_project_idx').on(t.projectId),
    // Satu job `queued` atau `running` di seluruh aplikasi: indeks unik pada ekspresi konstan,
    // dibatasi ke job aktif.
    uniqueIndex('jobs_one_active_idx').on(sql`(1)`).where(oneOf(t.status, ACTIVE_JOB_STATUSES)),
  ],
);
