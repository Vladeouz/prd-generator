import { AppHeader, type TemplateStatus } from '../../../components/ui/app-header.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { DocumentToc } from '../../../components/ui/document-toc.tsx';
import { documentOutline } from '../../../components/ui/markdown-outline.ts';
import { Stepper } from '../../../components/ui/stepper.tsx';
import type { ProjectDetail, Stage, StageUsage } from '../../../projects/projects.ts';
import { STAGE_LABELS } from '../../../projects/stage-labels.ts';
import type { StageEstimate } from '../../../projects/usage.ts';
import { formatDateTime, formatTokens } from '../format.ts';
import { DeleteProjectButton } from './delete-project-button.tsx';
import { ExportSection } from './export-section.tsx';
import { Stage2Section } from './stage2-section.tsx';
import { Stage3Section } from './stage3-section.tsx';
import { Stage4Section } from './stage4-section.tsx';
import { Stage5Section } from './stage5-section.tsx';
import { Stage6Section } from './stage6-section.tsx';
import { Stage7Section, type Stage7Steps } from './stage7-section.tsx';
import { projectSteps, selectedStage } from './steps.ts';
import { UsageSummary } from './usage-summary.tsx';

/** Daftar isi untuk layar dokumen (tahap 6 dan 7) bila dokumennya sudah ada. */
function DocumentNav({ project, selected }: { project: ProjectDetail; selected: string }) {
  const kind = selected === 'stage6' ? 'prd' : selected === 'stage7' ? 'tasks' : null;
  const doc = kind ? project.documents[kind] : null;
  if (!kind || !doc) return null;
  const name = kind === 'prd' ? 'PRD' : 'TASKS';
  return (
    <div className="hidden lg:sticky lg:top-0 lg:z-10 lg:block lg:max-h-screen lg:overflow-y-auto lg:bg-canvas lg:py-2">
      <DocumentToc
        title={`${name} · versi ${doc.version}`}
        label={`Daftar isi ${name}`}
        items={documentOutline(doc.content)}
      />
    </div>
  );
}

type Estimates = { stage6: StageEstimate; stage7: StageEstimate };

type Props = {
  project: ProjectDetail;
  /** Pemakaian per tahap (`getStageUsage`). */
  usage?: Partial<Record<Stage, StageUsage>>;
  /** Nilai `?tahap=` dari URL. */
  stage?: string;
  template?: TemplateStatus;
  /** Perkiraan tahap 6–7 untuk konfirmasi sebelum dijalankan (FR-10). */
  estimates?: Estimates;
  /** Langkah tahap 7 yang sudah valid (D-11), untuk keterangan melanjutkan. */
  stage7Steps?: Stage7Steps;
};

/**
 * Halaman proyek: tiga kolom (stepper, konten tahap, panel samping). Di layar sempit kolom menumpuk
 * berurutan: konten, stepper, panel (urutan diatur lewat `order` di grid).
 */
export function ProjectView({
  project,
  usage = {},
  stage,
  template,
  estimates,
  stage7Steps,
}: Props) {
  const selected = selectedStage(project, stage);
  return (
    <>
      <AppHeader
        project={project.name}
        tokens={formatTokens(project.totalTokens)}
        template={template}
      />
      <main
        id="konten"
        className="grid gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(560px,1fr)_300px]"
      >
        <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-none lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <DocumentNav project={project} selected={selected} />
          <Stepper steps={projectSteps(project, usage, selected)} />
          <Card as="section" aria-label="Ringkasan proyek" className="flex flex-col gap-3 text-sm">
            <h2 className="text-[15px] font-bold">{project.name}</h2>
            <p className="whitespace-pre-wrap text-ink-secondary">{project.idea}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-ink-muted">Tahap saat ini</dt>
              <dd id="current-stage">
                {STAGE_LABELS[project.currentStage]}
                {project.activeJob ? ' — sedang berjalan' : ' — siap dijalankan'}
              </dd>
              <dt className="text-ink-muted">Terakhir selesai</dt>
              <dd id="last-stage">
                {project.lastCompletedStage
                  ? STAGE_LABELS[project.lastCompletedStage]
                  : 'Belum ada'}
              </dd>
              <dt className="text-ink-muted">Token</dt>
              <dd id="tokens" className="font-mono">
                {formatTokens(project.totalTokens)}
              </dd>
              <dt className="text-ink-muted">Dibuat</dt>
              <dd>{formatDateTime(project.createdAt)}</dd>
            </dl>
            <DeleteProjectButton projectId={project.id} name={project.name} />
          </Card>
          <UsageSummary usage={usage} />
        </div>
        {selected === 'stage2' && <Stage2Section project={project} usage={usage.stage2} />}
        {selected === 'stage3' && <Stage3Section project={project} usage={usage.stage3} />}
        {selected === 'stage4' && <Stage4Section project={project} usage={usage.stage4} />}
        {selected === 'stage5' && <Stage5Section project={project} usage={usage.stage5} />}
        {selected === 'stage6' && (
          <Stage6Section
            project={project}
            usage={usage.stage6}
            template={template}
            estimate={estimates?.stage6}
          />
        )}
        {selected === 'stage7' && (
          <Stage7Section
            project={project}
            usage={usage.stage7}
            template={template}
            estimate={estimates?.stage7}
            steps={stage7Steps}
          />
        )}
        {selected === 'export' && <ExportSection project={project} />}
      </main>
    </>
  );
}
