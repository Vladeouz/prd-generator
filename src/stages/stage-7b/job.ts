// Job tahap 7 (FR-08, D-11): satu job yang menjalankan 7a (daftar task) bila belum ada yang valid,
// lalu 7b per fase secara berurutan untuk fase yang belum punya detail valid, lalu menyusun
// `docs/TASKS.md` (`composeTasks`). Setiap pemanggilan dicatat sebagai `stage_runs` sendiri dan
// dicoba ulang sendiri (D-08); progres menyebut langkah ke-i dari n.
// - Menjalankan ulang setelah gagal di tengah hanya mengulang fase yang belum valid.
// - Menjalankan ulang setelah semua lengkap membuat ulang semuanya: 7a baru membatalkan detail 7b
//   lama, lalu setiap fase dibuat ulang.
// - Menjalankan ulang tahap 6 membatalkan 7a dan 7b lewat `invalidateLaterStages`.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { documents, projects, stageRuns } from '../../core/db/schema.ts';
import { composeTasks } from '../../projects/compose-tasks.ts';
import { latestDocument } from '../../projects/documents.ts';
import {
  currentOutput,
  type RunStageDeps,
  runStage,
  type StageContext,
  StageFailedError,
  type StageJob,
  summarizeErrors,
} from '../run-stage.ts';
import { featureDraft } from '../stage-4/features.ts';
import { reachedStage } from '../stage-5/definition.ts';
import type { Stage6Options } from '../stage-6/definition.ts';
import { prdInfo } from '../stage-6/validate.ts';
import { stage7aDefinition } from '../stage-7a/definition.ts';
import type { Stage7aOutput } from '../stage-7a/validate.ts';
import { phaseTasks, stage7bDefinition } from './definition.ts';
import { nfrIds, validateTasks } from './tasks-markdown.ts';
import type { Stage7bOutput, TaskDetail } from './validate.ts';

/** Fase tahap 4 yang punya task di daftar 7a, berurutan. */
function phasesWithTasks(context: StageContext, list: Stage7aOutput | null) {
  const draft = featureDraft(context.db, context.projectId);
  return [...(draft?.phases ?? [])]
    .sort((a, b) => a.phase - b.phase)
    .filter((p) => phaseTasks(list, p.phase).length > 0);
}

const detailOf = (context: StageContext, phase: number) =>
  currentOutput<Stage7bOutput>(context.db, context.projectId, 'stage7b', String(phase));

/** Keadaan tahap 7 proyek: daftar 7a yang berlaku dan fase yang belum punya detail valid. */
export function stage7Progress(context: StageContext) {
  const list = currentOutput<Stage7aOutput>(context.db, context.projectId, 'stage7a');
  const phases = phasesWithTasks(context, list);
  return {
    list,
    phases,
    missing: list ? phases.filter((p) => detailOf(context, p.phase) === null) : phases,
  };
}

export function stage7Job(options: Stage6Options = {}): StageJob {
  return {
    stage: 'stage7',
    notReadyReason: ({ db, projectId }) =>
      latestDocument(db, projectId, 'prd') && reachedStage(db, projectId, 'stage7')
        ? null
        : 'Selesaikan PRD dan review kedua dulu sebelum menulis TASKS.',
    execute: async (deps: RunStageDeps, projectId: string) => {
      const context = { db: deps.db, projectId };
      const before = stage7Progress(context);
      const complete = before.list !== null && before.missing.length === 0;
      const needsList = before.list === null || complete;

      // Sebelum daftar task ada, jumlah fase diperkirakan dari struktur fitur tahap 4; setelah 7a
      // selesai, jumlah langkah dihitung ulang dari fase yang punya task.
      const draftPhases = featureDraft(deps.db, projectId)?.phases.length ?? 1;
      let step = 0;
      let total = needsList ? 1 + draftPhases : before.missing.length;
      if (needsList) {
        deps.onStep?.(++step, total);
        const list = stage7aDefinition(options);
        await runStage(
          deps,
          {
            ...list,
            // Daftar baru: detail 7b dari daftar lama tidak berlaku lagi.
            onSuccess: ({ tx, projectId: id }) => {
              tx.update(stageRuns)
                .set({ isCurrent: 0 })
                .where(
                  and(
                    eq(stageRuns.projectId, id),
                    eq(stageRuns.stage, 'stage7b'),
                    eq(stageRuns.isCurrent, 1),
                  ),
                )
                .run();
            },
          },
          projectId,
        );
      }

      const { missing } = stage7Progress(context);
      total = step + missing.length;
      for (const phase of missing) {
        deps.onStep?.(++step, total);
        await runStage(deps, stage7bDefinition(phase, options), projectId);
      }

      composeAndSave(deps, projectId);
    },
  };
}

/** Menyusun `docs/TASKS.md` dari 7a dan 7b yang berlaku, memvalidasinya, lalu menyimpannya. */
function composeAndSave({ db, clock }: RunStageDeps, projectId: string) {
  const context = { db, projectId };
  const { list, phases, missing } = stage7Progress(context);
  if (!list || missing.length > 0) {
    throw new StageFailedError('Detail task belum lengkap untuk semua fase.');
  }
  const details = new Map<string, TaskDetail>();
  for (const phase of phases) {
    for (const detail of detailOf(context, phase.phase)?.tasks ?? [])
      details.set(detail.id, detail);
  }
  const draft = featureDraft(db, projectId);
  const content = composeTasks({
    productName: draft?.product_name ?? 'Proyek',
    phases: draft?.phases ?? [],
    tasks: list.tasks,
    details,
  });
  const prd = latestDocument(db, projectId, 'prd')?.content ?? '';
  const { errors } = validateTasks(content, { ...prdInfo(prd), nfrIds: nfrIds(prd) });
  if (errors.length > 0) {
    throw new StageFailedError(
      `TASKS hasil susunan tidak lolos aturan FR-08: ${summarizeErrors(errors)}`,
    );
  }
  db.transaction((tx) => {
    const now = clock();
    const latest = latestDocument(tx, projectId, 'tasks');
    tx.insert(documents)
      .values({
        id: randomUUID(),
        projectId,
        kind: 'tasks',
        version: (latest?.version ?? 0) + 1,
        content,
        createdAt: now,
      })
      .run();
    tx.update(projects)
      .set({ currentStage: 'export', updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();
  });
}
