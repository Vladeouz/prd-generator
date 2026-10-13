import type { ProjectDetail, StageUsage } from '../../../projects/projects.ts';
import type { StoredAnswer } from '../../../stages/answers.ts';
import { GUESS_TOPICS, type Stage2Output } from '../../../stages/stage-2/validate.ts';
import { QuestionForm } from './question-form.tsx';
import { NotesCard, StageLayout, UsageCard } from './stage-layout.tsx';
import { StageRunner } from './stage-runner.tsx';

/** Jawaban tersimpan tahap ini, digabung dengan teks pertanyaannya. */
export function answersFor(project: ProjectDetail, stage: 'stage2' | 'stage3'): StoredAnswer[] {
  const output = project.stageOutputs[stage] as
    | { questions: Stage2Output['questions'] }
    | undefined;
  if (!output) return [];
  return output.questions.flatMap((question) => {
    const answer = project.answers.find((a) => a.stage === stage && a.questionId === question.id);
    return answer
      ? [
          {
            questionId: question.id,
            topic: question.topic,
            question: question.question,
            value: answer.value as string | string[],
            source: answer.source,
            policyKey: answer.policyKey,
          },
        ]
      : [];
  });
}

export function Stage2Section({ project, usage }: { project: ProjectDetail; usage?: StageUsage }) {
  const output = project.stageOutputs.stage2 as Stage2Output | undefined;
  const saved = answersFor(project, 'stage2');

  return (
    <StageLayout
      id="stage2"
      number={2}
      title="Klarifikasi produk"
      description="Pertanyaan singkat tentang produkmu. Lewati pertanyaan yang tidak penting; jawaban default dipakai."
      runner={
        <StageRunner
          projectId={project.id}
          stage="stage2"
          label="Klarifikasi produk"
          activeJob={project.activeJob}
          latestJob={project.latestJob}
          hasOutput={output !== undefined}
          estimate="sekitar 20 detik"
        />
      }
      aside={
        output && (
          <>
            <NotesCard title="Asumsi produk" items={output.assumptions} testId="assumptions" />
            <NotesCard
              title="Dibahas di tahap teknis"
              items={output.deferred_technical}
              empty="Belum ada. Idenya tidak menyebut hal teknis yang perlu ditunda."
              testId="deferred"
            />
            <UsageCard usage={usage} />
          </>
        )
      }
    >
      {output && (
        <>
          <div className="flex flex-wrap items-center gap-3.5 text-sm text-ink-muted">
            <ClarityMeter value={output.clarity} />
            <p data-testid="clarity">
              Kejelasan ide {output.clarity}/5: {output.clarity_reason}
            </p>
          </div>
          {saved.length > 0 && (
            <p className="text-sm text-success" data-testid="answers-saved">
              Jawaban tersimpan. Tahap berikutnya: Klarifikasi teknis — siap dijalankan. Kamu masih
              bisa mengubah jawaban di bawah.
            </p>
          )}
          <QuestionForm
            projectId={project.id}
            stage="stage2"
            questions={output.questions}
            guessTopics={GUESS_TOPICS}
            saved={saved}
            savedMessage="Jawaban tersimpan. Tahap berikutnya: Klarifikasi teknis — siap dijalankan."
            nextStage="Klarifikasi teknis"
          />
        </>
      )}
    </StageLayout>
  );
}

/** Meter kejelasan ide 1–5. */
function ClarityMeter({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`Kejelasan ide ${value} dari 5`}>
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          className={`h-2 w-7 rounded-sm ${level <= value ? 'bg-accent' : 'bg-line'}`}
        />
      ))}
    </span>
  );
}
