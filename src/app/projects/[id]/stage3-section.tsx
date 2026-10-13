import { Card } from '../../../components/ui/card.tsx';
import type { ProjectDetail, StageUsage } from '../../../projects/projects.ts';
import { PROFILE_CHOICE_TEXT } from '../../../stages/stage-3/profile-text.ts';
import type { Stage3Output } from '../../../stages/stage-3/validate.ts';
import { ProfileChoiceForm } from './profile-choice-form.tsx';
import { QuestionForm } from './question-form.tsx';
import { NotesCard, StageLayout, UsageCard } from './stage-layout.tsx';
import { StageRunner } from './stage-runner.tsx';
import { answersFor } from './stage2-section.tsx';

const NEXT_STAGE_READY = 'Tahap berikutnya: Struktur fitur — siap dijalankan.';

export function Stage3Section({ project, usage }: { project: ProjectDetail; usage?: StageUsage }) {
  const output = project.stageOutputs.stage3 as Stage3Output | undefined;
  const saved = answersFor(project, 'stage3');
  const productAnswered = answersFor(project, 'stage2').length > 0;
  const recommendation = output?.profile_recommendation;
  const needsChoice = recommendation?.profile === 'B';
  const stackChosen =
    project.profileChoice === 'A' || project.profileChoice === 'A_with_seo_mitigation';
  const waitingMessage =
    project.profileChoice === 'postpone'
      ? 'Proyek ditunda. Ubah pilihan stack di atas untuk melanjutkan ke Struktur fitur.'
      : 'Pilih kelanjutan stack di atas sebelum lanjut ke Struktur fitur.';
  const savedMessage = `Jawaban tersimpan. ${stackChosen ? NEXT_STAGE_READY : waitingMessage}`;
  const dependsOn = (recommendation?.depends_on_questions ?? [])
    .map((id) => (output?.questions.findIndex((q) => q.id === id) ?? -1) + 1)
    .filter((number) => number > 0);

  return (
    <StageLayout
      id="stage3"
      number={3}
      title="Klarifikasi teknis"
      description="Pertanyaan teknis yang mengubah arsitektur, dan stack yang dipakai. Lewati pertanyaan yang tidak penting; jawaban default mengikuti kebijakan yang paling sederhana."
      runner={
        productAnswered ? (
          <StageRunner
            projectId={project.id}
            stage="stage3"
            label="Klarifikasi teknis"
            activeJob={project.activeJob}
            latestJob={project.latestJob}
            hasOutput={output !== undefined}
            estimate="sekitar 30 detik"
          />
        ) : (
          <p
            className="rounded-panel border border-dashed border-line px-4.5 py-4 text-sm text-ink-muted"
            data-testid="stage3-not-ready"
          >
            Simpan jawaban klarifikasi produk dulu, lalu klarifikasi teknis bisa dijalankan.
          </p>
        )
      }
      aside={
        output && (
          <>
            <NotesCard
              title="Asumsi teknis"
              items={output.assumptions}
              testId="assumptions-stage3"
            />
            <UsageCard usage={usage} />
          </>
        )
      }
    >
      {output && recommendation && (
        <>
          {needsChoice ? (
            <Card
              tone="medium"
              size="main"
              className="flex flex-col gap-2 text-sm"
              data-testid="profile-recommendation"
            >
              <h2 className="text-lg font-bold">Stack yang paling cocok belum tersedia</h2>
              <p className="text-ink-secondary">
                Idemu paling cocok dibuat sebagai website yang ramah SEO, dan stack itu belum
                tersedia di generator ini. {recommendation.reason}
              </p>
              <p className="text-ink-secondary">{recommendation.fallback_if_unsupported}</p>
              <p className="mt-2 font-semibold">Pilih kelanjutannya:</p>
              <ProfileChoiceForm projectId={project.id} current={project.profileChoice} />
              {project.profileChoice && project.profileChoice !== 'A' && (
                <p className="text-success" data-testid="profile-chosen">
                  Pilihan tersimpan: {PROFILE_CHOICE_TEXT[project.profileChoice].label}.
                </p>
              )}
            </Card>
          ) : (
            <Card
              size="main"
              className="flex flex-col gap-1.5 text-sm"
              data-testid="profile-recommendation"
            >
              <h2 className="text-lg font-bold">
                Stack: {PROFILE_CHOICE_TEXT.A.label.toLowerCase()}
              </h2>
              <p className="text-ink-secondary">{PROFILE_CHOICE_TEXT.A.consequence}</p>
              <p className="text-ink-muted">{recommendation.reason}</p>
            </Card>
          )}
          {dependsOn.length > 0 && (
            <p className="text-sm text-ink-muted" data-testid="depends-on">
              Rekomendasi ini bergantung pada jawabanmu untuk pertanyaan nomor{' '}
              {dependsOn.join(', ')}. Bila jawabanmu berbeda dari default, jalankan ulang
              klarifikasi teknis.
            </p>
          )}

          {output.detected_risks.length > 0 && (
            <Card as="section" className="flex flex-col gap-2">
              <h2 className="text-[15px] font-bold">Risiko yang perlu kamu ketahui</h2>
              <ul
                className="flex list-disc flex-col gap-1.5 pl-4.5 text-sm text-ink-secondary"
                data-testid="risks"
              >
                {output.detected_risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          )}

          {saved.length > 0 && (
            <p className="text-sm text-success" data-testid="answers-saved-stage3">
              {savedMessage} Kamu masih bisa mengubah jawaban di bawah.
            </p>
          )}
          <QuestionForm
            projectId={project.id}
            stage="stage3"
            questions={output.questions}
            guessTopics={[]}
            saved={saved}
            savedMessage={savedMessage}
            nextStage="Struktur fitur"
          />
        </>
      )}
    </StageLayout>
  );
}
