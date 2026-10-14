import Link from 'next/link';
import type { TemplateStatus } from '../../../components/ui/app-header.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { EmptyState } from '../../../components/ui/states.tsx';
import type { ProjectDetail, StageUsage } from '../../../projects/projects.ts';
import type { StageEstimate } from '../../../projects/usage.ts';
import { formatDateTime, stageNumber } from '../format.ts';
import { DocumentCard, ExportPanel } from './document-panels.tsx';
import { Review2Section } from './review2-section.tsx';
import { bannerEstimate, confirmationText } from './run-confirmation.ts';
import { StageLayout, UsageCard } from './stage-layout.tsx';
import { StageRunner } from './stage-runner.tsx';

/** Perkiraan durasi tahap 6 (FR-02): ±4,5 menit di uji end-to-end, ±9–10 menit saat verifikasi T-012/T-014. */
export const STAGE6_ESTIMATE = 'sekitar 5–10 menit';

/** Tahap 6–7 tidak bisa dijalankan selama repo template tidak valid (FR-11). */
export function TemplateInvalidCard({ document }: { document: string }) {
  return (
    <Card tone="high" className="flex flex-col gap-1.5 text-sm" data-testid="template-invalid">
      <h2 className="font-bold">Repo template belum valid</h2>
      <p className="text-ink-secondary">
        {document} memakai konvensi dari repo template, jadi tahap ini belum bisa dijalankan. Lihat
        masalahnya di{' '}
        <Link href="/settings" className="text-accent underline">
          Pengaturan
        </Link>
        .
      </p>
    </Card>
  );
}

type Props = {
  project: ProjectDetail;
  usage?: StageUsage;
  template?: TemplateStatus;
  estimate?: StageEstimate;
};

export function Stage6Section({ project, usage, template, estimate }: Props) {
  const ready = stageNumber(project.currentStage) >= 6;
  const prd = project.documents.prd;
  const templateValid = template?.valid ?? false;

  let runner = (
    <EmptyState title="PRD belum bisa ditulis" data-testid="stage6-not-ready">
      Simpan keputusan review kritis dulu, lalu PRD bisa ditulis.
    </EmptyState>
  );
  if (ready && !templateValid) {
    runner = <TemplateInvalidCard document="PRD" />;
  } else if (ready) {
    runner = (
      <StageRunner
        projectId={project.id}
        stage="stage6"
        label="Penulisan PRD"
        activeJob={project.activeJob}
        latestJob={project.latestJob}
        hasOutput={prd !== null}
        estimate={STAGE6_ESTIMATE}
        {...bannerEstimate(estimate)}
        confirmation={estimate && confirmationText('Penulisan PRD', estimate)}
      />
    );
  }

  return (
    <StageLayout
      id="stage6"
      number={6}
      title="PRD"
      description="PRD ditulis dari jawaban, struktur fitur, dan keputusan review, memakai konvensi repo template. Bagian 8 (Assumptions & Decisions) disusun aplikasi dari buku keputusan, bukan ditulis AI."
      runner={runner}
      aside={
        prd && (
          <>
            <Card as="section" className="flex flex-col gap-2 text-sm">
              <h2 className="text-[15px] font-bold">Dokumen</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-ink-muted">Versi</dt>
                <dd data-testid="prd-version">{prd.version}</dd>
                <dt className="text-ink-muted">Dibuat</dt>
                <dd>{formatDateTime(prd.createdAt)}</dd>
                <dt className="text-ink-muted">Template</dt>
                <dd className="font-mono" data-testid="prd-template-commit">
                  {project.templateCommit?.slice(0, 7) ?? '-'}
                </dd>
              </dl>
            </Card>
            <UsageCard usage={usage} />
            <ExportPanel project={project} />
          </>
        )
      }
    >
      {prd && <Review2Section project={project} estimate={estimate} />}
      {prd && <DocumentCard kind="prd" content={prd.content} version={prd.version} />}
    </StageLayout>
  );
}
