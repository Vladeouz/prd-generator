import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import type { ProjectDetail, StageUsage } from '../../../projects/projects.ts';
import { SEVERITY_TEXT } from '../../../stages/stage-5/review-text.ts';
import { SEVERITIES, type Severity, type Stage5Output } from '../../../stages/stage-5/validate.ts';
import { stageNumber } from '../format.ts';
import { DecisionForm } from './decision-form.tsx';
import { StageLayout, UsageCard } from './stage-layout.tsx';
import { StageRunner } from './stage-runner.tsx';

const SAVED_MESSAGE = 'Keputusan tersimpan. Tahap berikutnya: PRD — siap dijalankan.';

/** Jumlah temuan per keparahan; status juga tertulis sebagai teks. */
export function SeveritySummary({ findings }: { findings: { severity: Severity }[] }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="severity-summary">
      {SEVERITIES.map((severity) => {
        const count = findings.filter((f) => f.severity === severity).length;
        return count > 0 ? (
          <Badge key={severity} tone={severity} dot>
            {count} {SEVERITY_TEXT[severity].toLowerCase()}
          </Badge>
        ) : null;
      })}
      {findings.length === 0 && <Badge tone="success">Tidak ada temuan</Badge>}
    </div>
  );
}

/** Buku keputusan: semua keputusan proyek, ditulis apa adanya ke PRD oleh aplikasi (D-05). */
function DecisionBook({ project }: { project: ProjectDetail }) {
  const items = [...project.decisions].sort((a, b) => a.code.localeCompare(b.code));
  return (
    <Card as="section" className="flex flex-col gap-2.5">
      <h2 className="text-[15px] font-bold">Buku keputusan</h2>
      <p className="text-[13px] text-ink-muted">
        Ditulis apa adanya ke PRD oleh aplikasi, bukan oleh AI.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Belum ada keputusan tersimpan.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-[13px]" data-testid="decision-book">
          {items.map((d) => (
            <li key={d.code} className="flex gap-2">
              <span className="font-mono text-ink-muted">{d.code}</span>
              <span className="text-ink-secondary">{d.chosenOption}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Stage5Section({ project, usage }: { project: ProjectDetail; usage?: StageUsage }) {
  const output = project.stageOutputs.stage5 as Stage5Output | undefined;
  const ready = stageNumber(project.currentStage) >= 5;
  const saved = Object.fromEntries(
    project.decisions.filter((d) => d.origin === 'review1').map((d) => [d.code, d.chosenOption]),
  );
  const decided = stageNumber(project.currentStage) >= 6 && Object.keys(saved).length > 0;

  return (
    <StageLayout
      id="stage5"
      number={5}
      title="Review kritis"
      description="Draf rencana diperiksa sebelum PRD ditulis. Setiap temuan punya bukti dari draf dan pilihan yang bisa kamu putuskan; rekomendasi sudah terpilih."
      runner={
        ready ? (
          <StageRunner
            projectId={project.id}
            stage="stage5"
            label="Review kritis"
            activeJob={project.activeJob}
            latestJob={project.latestJob}
            hasOutput={output !== undefined}
            estimate="sekitar 1 menit"
          />
        ) : (
          <p
            className="rounded-panel border border-dashed border-line px-4.5 py-4 text-sm text-ink-muted"
            data-testid="stage5-not-ready"
          >
            Simpan pilihan fitur rekomendasi dulu, lalu review kritis bisa dijalankan.
          </p>
        )
      }
      aside={
        output && (
          <>
            <DecisionBook project={project} />
            <UsageCard usage={usage} />
          </>
        )
      }
    >
      {output && (
        <>
          <SeveritySummary findings={output.findings} />
          {decided && (
            <p className="text-sm text-success" data-testid="decisions-saved">
              {SAVED_MESSAGE} Kamu masih bisa mengubah keputusan di bawah.
            </p>
          )}
          <DecisionForm
            projectId={project.id}
            origin="review1"
            next="PRD"
            findings={output.findings}
            saved={saved}
            savedMessage={SAVED_MESSAGE}
          />
        </>
      )}
    </StageLayout>
  );
}
