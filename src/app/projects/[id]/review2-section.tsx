import { Card } from '../../../components/ui/card.tsx';
import type { ProjectDetail } from '../../../projects/projects.ts';
import type { Review2Output } from '../../../stages/review-2/validate.ts';
import { DecisionForm } from './decision-form.tsx';
import { StageRunner } from './stage-runner.tsx';
import { SeveritySummary } from './stage5-section.tsx';

const SAVED_MESSAGE = 'Keputusan tersimpan. Tahap berikutnya: TASKS — siap dijalankan.';
const REGENERATE_MESSAGE =
  'Keputusan tersimpan. PRD sedang ditulis ulang dengan perbaikan yang kamu pilih (sekitar 5–10 menit).';

/**
 * Review kedua di layar PRD (FR-07): temuan tentang data model, aturan bisnis tanpa constraint,
 * dan rute UI tanpa endpoint pendukung, diputuskan sebagai RV2-xx.
 */
export function Review2Section({ project }: { project: ProjectDetail }) {
  const output = project.stageOutputs.review2 as Review2Output | undefined;
  const saved = project.decisions.filter((d) => d.origin === 'review2');
  const deciding = project.currentStage === 'review2';

  return (
    <Card as="section" size="main" aria-labelledby="review2-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 id="review2-title" className="text-lg font-bold">
          Review kedua
        </h2>
        <p className="text-sm text-ink-muted">
          PRD diperiksa sebelum dipecah menjadi task: data model, aturan bisnis tanpa constraint,
          dan rute UI tanpa endpoint pendukung. Memilih perbaikan membuat PRD ditulis ulang sekali.
        </p>
      </div>
      <StageRunner
        projectId={project.id}
        stage="review2"
        label="Review kedua"
        activeJob={project.activeJob}
        latestJob={project.latestJob}
        hasOutput={output !== undefined}
        estimate="sekitar 1 menit"
      />
      {output && !deciding && saved.length > 0 && (
        <div className="flex flex-col gap-2 text-sm" data-testid="review2-decided">
          <p className="text-success">
            Keputusan review kedua tersimpan. Jalankan ulang review kedua untuk meninjau PRD
            terbaru.
          </p>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {[...saved]
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((d) => (
                <li key={d.code} className="flex gap-2">
                  <span className="font-mono text-ink-muted">{d.code}</span>
                  <span className="text-ink-secondary">{d.chosenOption}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
      {output && deciding && (
        <>
          <SeveritySummary findings={output.findings} />
          <DecisionForm
            projectId={project.id}
            origin="review2"
            next="TASKS"
            findings={output.findings}
            saved={Object.fromEntries(saved.map((d) => [d.code, d.chosenOption]))}
            savedMessage={SAVED_MESSAGE}
            regenerateMessage={REGENERATE_MESSAGE}
          />
        </>
      )}
    </Card>
  );
}
