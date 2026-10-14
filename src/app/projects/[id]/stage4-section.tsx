import { Badge } from '../../../components/ui/badge.tsx';
import { Card } from '../../../components/ui/card.tsx';
import type { ProjectDetail, StageUsage } from '../../../projects/projects.ts';
import type { MvpFeature, Stage4Output } from '../../../stages/stage-4/validate.ts';
import { stageNumber } from '../format.ts';
import { FeatureChoiceForm } from './feature-choice-form.tsx';
import { NotesCard, StageLayout, UsageCard } from './stage-layout.tsx';
import { StageRunner } from './stage-runner.tsx';

const SAVED_MESSAGE = 'Pilihan fitur tersimpan. Tahap berikutnya: Review kritis — siap dijalankan.';

function FeatureItem({ feature }: { feature: MvpFeature }) {
  return (
    <li className="flex flex-col gap-1.5 border-t border-line-subtle pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink-muted">{feature.id}</span>
        <h3 className="font-bold">{feature.name}</h3>
        <Badge tone={feature.source === 'user' ? 'accent' : 'neutral'} size="sm">
          {feature.source === 'user' ? 'Dari jawabanmu' : 'Fondasi'}
        </Badge>
      </div>
      <p className="text-sm text-ink-secondary">{feature.description}</p>
      {feature.sub_features.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-4.5 text-[13px] text-ink-muted">
          {feature.sub_features.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {feature.depends_on.length > 0 && (
        <p className="text-[13px] text-ink-muted" data-testid={`depends-${feature.id}`}>
          Bergantung pada: {feature.depends_on.join(', ')}
        </p>
      )}
    </li>
  );
}

export function Stage4Section({ project, usage }: { project: ProjectDetail; usage?: StageUsage }) {
  const output = project.stageOutputs.stage4 as Stage4Output | undefined;
  const ready = stageNumber(project.currentStage) >= 4;
  const saved = stageNumber(project.currentStage) >= 5;
  const accepted = project.featureChoices.filter((c) => c.accepted === 1).map((c) => c.featureCode);
  const features = new Map(output?.mvp_features.map((f) => [f.id, f]));
  const phases = [...(output?.phases ?? [])].sort((a, b) => a.phase - b.phase);

  return (
    <StageLayout
      id="stage4"
      number={4}
      title="Struktur fitur"
      description="Fitur MVP dari jawabanmu beserta fondasinya, disusun per fase sesuai dependensi. Pilih fitur rekomendasi yang ingin ikut dikerjakan."
      runner={
        ready ? (
          <StageRunner
            projectId={project.id}
            stage="stage4"
            label="Struktur fitur"
            activeJob={project.activeJob}
            latestJob={project.latestJob}
            hasOutput={output !== undefined}
            estimate="sekitar 1 menit"
          />
        ) : (
          <p
            className="rounded-panel border border-dashed border-line px-4.5 py-4 text-sm text-ink-muted"
            data-testid="stage4-not-ready"
          >
            Simpan jawaban klarifikasi teknis dan pilih stack dulu, lalu struktur fitur bisa
            dijalankan.
          </p>
        )
      }
      aside={
        output && (
          <>
            <NotesCard
              title="Keputusan teknis"
              items={output.technical_decisions}
              testId="technical-decisions"
            />
            <NotesCard
              title="Pertanyaan terbuka"
              items={output.open_questions}
              testId="open-questions"
            />
            <UsageCard usage={usage} />
          </>
        )
      }
    >
      {output && (
        <>
          <section aria-labelledby="mvp-title" className="flex flex-col gap-3">
            <h2 id="mvp-title" className="text-lg font-bold">
              Fitur MVP per fase
            </h2>
            {phases.map((phase) => (
              <Card
                key={phase.phase}
                as="section"
                size="main"
                className="flex flex-col gap-3.5"
                data-testid={`phase-${phase.phase}`}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-xs text-accent">FASE {phase.phase}</span>
                  <h3 className="text-[17px] font-bold">{phase.name}</h3>
                  <p className="text-sm text-ink-muted">{phase.goal}</p>
                </div>
                <ul className="flex flex-col gap-3">
                  {phase.feature_ids.flatMap((id) => {
                    const feature = features.get(id);
                    return feature ? [<FeatureItem key={id} feature={feature} />] : [];
                  })}
                </ul>
              </Card>
            ))}
          </section>

          <Card as="section" className="flex flex-col gap-2">
            <h2 className="text-[15px] font-bold">Tidak dikerjakan di versi pertama</h2>
            <ul
              className="flex list-disc flex-col gap-1.5 pl-4.5 text-sm text-ink-secondary"
              data-testid="non-goals"
            >
              {output.non_goals.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>

          {saved && (
            <p className="text-sm text-success" data-testid="features-saved">
              {SAVED_MESSAGE} Kamu masih bisa mengubah pilihan di bawah.
            </p>
          )}
          <FeatureChoiceForm
            projectId={project.id}
            features={output.recommended_features}
            saved={accepted}
            savedMessage={SAVED_MESSAGE}
          />
        </>
      )}
    </StageLayout>
  );
}
