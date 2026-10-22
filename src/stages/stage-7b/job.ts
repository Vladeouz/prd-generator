// Job tahap 7 (FR-08, D-11): satu job yang menjalankan 7a (daftar task) bila belum ada yang valid,
// lalu 7b untuk semua fase yang belum punya detail valid secara bersamaan (T-033, NFR-06), lalu
// menyusun `docs/TASKS.md` (`composeTasks`). Setiap pemanggilan dicatat sebagai `stage_runs`
// sendiri dan dicoba ulang sendiri (D-08); progres menyebut langkah (7a, lalu detail fase) dan
// jumlah fase yang selesai dari n.
// - Jumlah pemanggilan 7b serentak dibatasi `STAGE7B_CONCURRENCY` (bawaan semua fase). Tetap satu job
//   aktif di aplikasi (D-03); paralelnya hanya di dalam job ini.
// - Fase yang gagal tidak membatalkan fase lain: semua fase ditunggu sampai selesai, detail yang
//   valid tersimpan, lalu job gagal dengan pesan yang menyebut fase yang gagal.
// - Menjalankan ulang setelah gagal di tengah hanya mengulang fase yang belum valid.
// - Menjalankan ulang setelah semua lengkap membuat ulang semuanya: 7a baru membatalkan detail 7b
//   lama, lalu setiap fase dibuat ulang.
// - Menjalankan ulang tahap 6 membatalkan 7a dan 7b lewat `invalidateLaterStages`.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { ClaudeProgress } from '../../claude/types.ts';
import { documents, projects, stageRuns } from '../../core/db/schema.ts';
import { composeTasks } from '../../projects/compose-tasks.ts';
import { latestDocument } from '../../projects/documents.ts';
import { readTemplate } from '../../template/template.ts';
import { STAGE7B_CONCURRENCY } from '../attempts.ts';
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
import { phaseTasks, readTemplateFiles, stage7bDefinition } from './definition.ts';
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

type Phase = ReturnType<typeof stage7Progress>['phases'][number];

/**
 * Deps satu fase di antara fase yang berjalan bersamaan: potongan stream semua fase digabung
 * (karakter dan token thinking dijumlahkan), dan awal percobaan atau langkah tidak diteruskan karena
 * akan mereset progres fase lain. Percobaan ulang tetap tampil lewat `JobQueue.attempts`.
 */
function phaseDeps(deps: RunStageDeps, streams: Map<number, { chars: number; thinking: number }>) {
  return (phase: number): RunStageDeps => ({
    ...deps,
    onAttempt: undefined,
    onStep: undefined,
    onPhases: undefined,
    onProgress: (item: ClaudeProgress) => {
      const stream = streams.get(phase) ?? { chars: 0, thinking: 0 };
      if (item.kind === 'thinking') stream.thinking = item.estimatedTokens;
      else stream.chars = item.chars;
      streams.set(phase, stream);
      const total = (pick: (s: { chars: number; thinking: number }) => number) =>
        [...streams.values()].reduce((sum, s) => sum + pick(s), 0);
      deps.onProgress?.(
        item.kind === 'thinking'
          ? { kind: 'thinking', estimatedTokens: total((s) => s.thinking) }
          : { kind: 'text', text: item.text, chars: total((s) => s.chars) },
      );
    },
  });
}

/**
 * Menjalankan detail 7b `phases` bersamaan, paling banyak `concurrency` sekaligus. Menunggu semua
 * fase selesai; fase yang gagal dikumpulkan, bukan menghentikan yang lain.
 */
async function runPhases(
  deps: RunStageDeps,
  phases: Phase[],
  run: (phase: Phase, deps: RunStageDeps) => Promise<unknown>,
  concurrency: number,
) {
  const failures: { phase: Phase; error: unknown }[] = [];
  const depsOf = phaseDeps(deps, new Map());
  let next = 0;
  let done = 0;
  const report = () => deps.onPhases?.(done, phases.length, failures.length);
  report();
  const worker = async () => {
    while (next < phases.length) {
      const phase = phases[next++] as Phase;
      try {
        await run(phase, depsOf(phase.phase));
        done++;
      } catch (error) {
        failures.push({ phase, error });
      }
      report();
    }
  };
  const workers = Math.max(1, Math.min(concurrency, phases.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return failures.sort((a, b) => a.phase.phase - b.phase.phase);
}

export function stage7Job(
  options: Stage6Options = {},
  { concurrency = STAGE7B_CONCURRENCY }: { concurrency?: number } = {},
): StageJob {
  return {
    stage: 'stage7',
    notReadyReason: ({ db, projectId }) =>
      latestDocument(db, projectId, 'prd') && reachedStage(db, projectId, 'stage7')
        ? null
        : 'Selesaikan PRD dan review kedua dulu sebelum menulis TASKS.',
    execute: async (deps: RunStageDeps, projectId: string) => {
      const context = { db: deps.db, projectId };
      // Daftar file template dibutuhkan 7b (D-15): diperiksa sebelum 7a, agar tahap gagal sebelum
      // `claude` dipanggil bila tidak bisa dibaca. Template yang tidak valid dilaporkan 7a dengan
      // pesan konvensinya sendiri.
      const dir = (options.templateDir ?? (() => process.env.TEMPLATE_DIR))();
      if ((await readTemplate(dir)).ok) await readTemplateFiles(dir);
      const before = stage7Progress(context);
      const complete = before.list !== null && before.missing.length === 0;
      const needsList = before.list === null || complete;

      // Langkah 1 dari 2: daftar task (bila perlu); langkah terakhir: detail semua fase bersamaan.
      const totalSteps = needsList ? 2 : 1;
      if (needsList) {
        deps.onStep?.(1, totalSteps);
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
      deps.onStep?.(totalSteps, totalSteps);
      const failures = await runPhases(
        deps,
        missing,
        (phase, phaseDeps) => runStage(phaseDeps, stage7bDefinition(phase, options), projectId),
        concurrency,
      );
      const unexpected = failures.find((f) => !(f.error instanceof StageFailedError));
      if (unexpected) throw unexpected.error;
      if (failures.length > 0) {
        const listed = failures
          .map((f) => `fase ${f.phase.phase} (${f.phase.name}): ${(f.error as Error).message}`)
          .join('; ');
        throw new StageFailedError(
          `Detail task gagal untuk ${failures.length} dari ${missing.length} fase: ${listed}. Detail fase lain sudah tersimpan; jalankan tahap 7 lagi untuk mengulang fase yang gagal saja.`,
        );
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
