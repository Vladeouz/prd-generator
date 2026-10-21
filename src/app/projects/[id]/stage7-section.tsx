import type { TemplateStatus } from '../../../components/ui/app-header.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { EmptyState } from '../../../components/ui/states.tsx';
import type { ProjectDetail, StageUsage } from '../../../projects/projects.ts';
import type { StageEstimate } from '../../../projects/usage.ts';
import { formatDateTime, stageNumber } from '../format.ts';
import { DocumentCard, ExportPanel } from './document-panels.tsx';
import { bannerEstimate, confirmationText } from './run-confirmation.ts';
import { StageLayout, UsageCard } from './stage-layout.tsx';
import { StageRunner } from './stage-runner.tsx';
import { TemplateInvalidCard } from './stage6-section.tsx';

/**
 * Perkiraan durasi tahap 7 (FR-02) bila belum ada rata-rata: satu job berisi daftar task (7a) dan
 * detail per fase (7b, D-11), dengan target NFR-06 ≤ 5 menit; bisa lebih lama bila sebuah langkah
 * dicoba ulang.
 */
export const STAGE7_ESTIMATE = 'sekitar 3–6 menit';

/** Langkah tahap 7 yang sudah valid: daftar task (7a) dan fase dengan detail (7b). */
export type Stage7Steps = { list: boolean; phasesDone: number; phasesTotal: number };

/**
 * Keterangan bila job tahap 7 sebelumnya berhenti di tengah: langkah yang sudah valid tidak diulang
 * saat dijalankan lagi. Null bila belum ada langkah atau semua sudah lengkap.
 */
export function resumeNote(steps: Stage7Steps | undefined): string | null {
  if (!steps?.list || steps.phasesDone >= steps.phasesTotal) return null;
  return `Daftar task dan detail ${steps.phasesDone} dari ${steps.phasesTotal} fase sudah tersimpan. Menjalankan lagi hanya melanjutkan fase yang belum selesai.`;
}

type Props = {
  project: ProjectDetail;
  usage?: StageUsage;
  template?: TemplateStatus;
  estimate?: StageEstimate;
  steps?: Stage7Steps;
};

export function Stage7Section({ project, usage, template, estimate, steps }: Props) {
  const ready = stageNumber(project.currentStage) >= 7;
  const tasks = project.documents.tasks;

  let runner = (
    <EmptyState title="TASKS belum bisa ditulis" data-testid="stage7-not-ready">
      Selesaikan PRD dan keputusan review kedua dulu, lalu TASKS bisa ditulis.
    </EmptyState>
  );
  if (ready && !(template?.valid ?? false)) {
    runner = <TemplateInvalidCard document="TASKS" />;
  } else if (ready) {
    const note = resumeNote(steps);
    runner = (
      <div className="flex flex-col gap-2.5">
        {note && (
          <p className="text-sm text-ink-secondary" data-testid="stage7-resume">
            {note}
          </p>
        )}
        <StageRunner
          projectId={project.id}
          stage="stage7"
          label="Penulisan TASKS"
          activeJob={project.activeJob}
          latestJob={project.latestJob}
          hasOutput={tasks !== null}
          estimate={STAGE7_ESTIMATE}
          {...bannerEstimate(estimate)}
          confirmation={estimate && confirmationText('Penulisan TASKS', estimate, 'tahap 7')}
        />
      </div>
    );
  }

  return (
    <StageLayout
      id="stage7"
      number={7}
      title="TASKS"
      description="Daftar task berurutan dari PRD, satu task per sesi agent. Setup yang sudah disediakan repo template tidak ditulis ulang, dan setiap task diakhiri pnpm check hijau."
      runner={runner}
      aside={
        tasks && (
          <>
            <Card as="section" className="flex flex-col gap-2 text-sm">
              <h2 className="text-[15px] font-bold">Dokumen</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-ink-muted">Versi</dt>
                <dd data-testid="tasks-version">{tasks.version}</dd>
                <dt className="text-ink-muted">Dibuat</dt>
                <dd>{formatDateTime(tasks.createdAt)}</dd>
                <dt className="text-ink-muted">Dari PRD</dt>
                <dd>versi {project.documents.prd?.version ?? '-'}</dd>
              </dl>
            </Card>
            <UsageCard usage={usage} />
            <ExportPanel project={project} />
          </>
        )
      }
    >
      {tasks && <DocumentCard kind="tasks" content={tasks.content} version={tasks.version} />}
    </StageLayout>
  );
}
