import { buttonClass } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { EmptyState } from '../../../components/ui/states.tsx';
import type { ProjectDetail } from '../../../projects/projects.ts';
import { ExportForm } from './export-form.tsx';
import { StageLayout } from './stage-layout.tsx';

/** Layar ekspor (FR-09): unduh PRD.md dan TASKS.md, atau tulis ke folder proyek turunan template. */
export function ExportSection({ project }: { project: ProjectDetail }) {
  const { prd, tasks } = project.documents;
  const ready = project.currentStage === 'export' && prd !== null && tasks !== null;
  const download = (kind: 'prd' | 'tasks') =>
    `/api/projects/${project.id}/documents/${kind}?download=1`;

  return (
    <StageLayout
      id="export"
      number={8}
      title="Ekspor"
      description="Bawa PRD dan TASKS ke proyek yang dibuat dari repo template, lalu mulai sesi Claude Code pertama di proyek itu."
      runner={
        ready ? null : (
          <EmptyState data-testid="export-not-ready">
            Selesaikan PRD dan TASKS dulu, lalu dokumennya bisa diekspor.
          </EmptyState>
        )
      }
    >
      {ready && (
        <>
          <Card as="section" size="main" className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Unduh</h2>
            <p className="text-sm text-ink-muted">
              PRD versi {prd.version} dan TASKS versi {tasks.version}.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={download('prd')} className={buttonClass('secondary')} download="PRD.md">
                Unduh PRD.md
              </a>
              <a href={download('tasks')} className={buttonClass('secondary')} download="TASKS.md">
                Unduh TASKS.md
              </a>
            </div>
          </Card>
          <Card as="section" size="main" className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">Tulis ke folder proyek</h2>
            <p className="text-sm text-ink-muted">
              Buat proyek dulu dari salinan baru repo template dengan{' '}
              <code className="font-mono">pnpm init-project &lt;nama&gt;</code>, lalu ketik path
              folder itu di sini. File PRD di folder itu harus masih placeholder dari init-project.
            </p>
            <ExportForm projectId={project.id} />
          </Card>
        </>
      )}
    </StageLayout>
  );
}
