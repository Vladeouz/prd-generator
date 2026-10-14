import type { TemplateStatus } from '../../../components/ui/app-header.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { MarkdownPreview } from '../../../components/ui/markdown-preview.tsx';
import type { ProjectDetail, StageUsage } from '../../../projects/projects.ts';
import type { StageEstimate } from '../../../projects/usage.ts';
import { formatDateTime, stageNumber } from '../format.ts';
import { confirmationText } from './run-confirmation.ts';
import { StageLayout, UsageCard } from './stage-layout.tsx';
import { StageRunner } from './stage-runner.tsx';
import { TemplateInvalidCard } from './stage6-section.tsx';

/**
 * Perkiraan durasi tahap 7 (FR-02): ±3 menit di uji end-to-end, ±7–8 menit per percobaan saat
 * verifikasi T-014, dan bisa dua kali lipat bila output dicoba ulang.
 */
export const STAGE7_ESTIMATE = 'sekitar 5–15 menit';

type Props = {
  project: ProjectDetail;
  usage?: StageUsage;
  template?: TemplateStatus;
  estimate?: StageEstimate;
};

export function Stage7Section({ project, usage, template, estimate }: Props) {
  const ready = stageNumber(project.currentStage) >= 7;
  const tasks = project.documents.tasks;

  let runner = (
    <p
      className="rounded-panel border border-dashed border-line px-4.5 py-4 text-sm text-ink-muted"
      data-testid="stage7-not-ready"
    >
      Selesaikan PRD dan keputusan review kedua dulu, lalu TASKS bisa ditulis.
    </p>
  );
  if (ready && !(template?.valid ?? false)) {
    runner = <TemplateInvalidCard document="TASKS" />;
  } else if (ready) {
    runner = (
      <StageRunner
        projectId={project.id}
        stage="stage7"
        label="Penulisan TASKS"
        activeJob={project.activeJob}
        latestJob={project.latestJob}
        hasOutput={tasks !== null}
        estimate={STAGE7_ESTIMATE}
        confirmation={estimate && confirmationText('Penulisan TASKS', estimate)}
      />
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
          </>
        )
      }
    >
      {tasks && (
        <Card size="main" data-testid="tasks-preview">
          <span className="mb-4 block font-mono text-xs text-ink-muted">
            TASKS · versi {tasks.version}
          </span>
          <MarkdownPreview markdown={tasks.content} label="Pratinjau TASKS" />
        </Card>
      )}
    </StageLayout>
  );
}
