// Isi stepper 8 tahap di halaman proyek: status, token, dan tautan per tahap.
import type { Step, StepStatus } from '../../../components/ui/stepper.tsx';
import type { ProjectDetail, Stage, StageUsage } from '../../../projects/projects.ts';
import type { ProjectStage } from '../../../projects/stage-labels.ts';
import { formatCount, stageNumber } from '../format.ts';

/** Tahap yang sudah punya layar. Tahap berikutnya ditambahkan saat layarnya dibuat. */
export const VIEW_STAGES = ['stage2', 'stage3'] as const;
export type ViewStage = (typeof VIEW_STAGES)[number];

const FLOW: { number: number; label: string; stages: ProjectStage[] }[] = [
  { number: 1, label: 'Ide', stages: [] },
  { number: 2, label: 'Klarifikasi produk', stages: ['stage2'] },
  { number: 3, label: 'Klarifikasi teknis', stages: ['stage3'] },
  { number: 4, label: 'Struktur fitur', stages: ['stage4'] },
  { number: 5, label: 'Review kritis', stages: ['stage5'] },
  { number: 6, label: 'PRD', stages: ['stage6', 'review2'] },
  { number: 7, label: 'TASKS', stages: ['stage7'] },
  { number: 8, label: 'Ekspor', stages: ['export'] },
];

type Questions = { questions: unknown[] } | undefined;

function status(project: ProjectDetail, number: number, stages: ProjectStage[]): StepStatus {
  if (number === 1) return 'done';
  const has = (stage: string | undefined) => stages.includes(stage as ProjectStage);
  if (project.activeJob && has(project.activeJob.stage)) return 'running';
  const failed = project.latestJob;
  if (failed && has(failed.stage) && ['failed', 'interrupted'].includes(failed.status)) {
    return 'failed';
  }
  const current = stageNumber(project.currentStage);
  if (number === current) return 'current';
  return number < current ? 'done' : 'locked';
}

function meta(project: ProjectDetail, stages: ProjectStage[], kind: StepStatus) {
  const [stage] = stages;
  if (stage !== 'stage2' && stage !== 'stage3') return undefined;
  const output = project.stageOutputs[stage] as Questions;
  if (stage === 'stage3' && kind === 'current' && output && project.profileChoice === null) {
    return 'Menunggu pilihan stack';
  }
  return output ? `${output.questions.length} pertanyaan` : undefined;
}

function tokens(usage: Partial<Record<Stage, StageUsage>>, stages: ProjectStage[]) {
  const total = stages.reduce(
    (sum, stage) =>
      sum + (usage[stage as Stage]?.inputTokens ?? 0) + (usage[stage as Stage]?.outputTokens ?? 0),
    0,
  );
  return total > 0 ? `${formatCount(total)} token` : undefined;
}

export function projectSteps(
  project: ProjectDetail,
  usage: Partial<Record<Stage, StageUsage>>,
  selected: ViewStage,
): Step[] {
  return FLOW.map(({ number, label, stages }) => {
    const kind = status(project, number, stages);
    const [stage] = stages;
    const viewable = VIEW_STAGES.includes(stage as ViewStage) && kind !== 'locked';
    return {
      number,
      label,
      status: kind,
      meta: meta(project, stages, kind),
      tokens: tokens(usage, stages),
      href: viewable ? `/projects/${project.id}?tahap=${number}` : undefined,
      selected: stage === selected,
    };
  });
}

/**
 * Tahap yang dibuka: `?tahap=2` atau `?tahap=3` bila tahap itu sudah terbuka; selain itu tahap
 * proyek saat ini (tahap sesudah 3 belum punya layar, jadi jatuh ke tahap 3).
 */
export function selectedStage(project: ProjectDetail, requested?: string): ViewStage {
  const current: ViewStage = project.currentStage === 'stage2' ? 'stage2' : 'stage3';
  if (requested === '2') return 'stage2';
  if (requested === '3' && current === 'stage3') return 'stage3';
  return current;
}
