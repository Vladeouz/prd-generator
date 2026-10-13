import type { ProjectDetail } from '../../../projects/projects.ts';
import type { StoredAnswer } from '../../../stages/answers.ts';
import { GUESS_TOPICS, type Stage2Output } from '../../../stages/stage-2/validate.ts';
import { QuestionForm } from './question-form.tsx';
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
          },
        ]
      : [];
  });
}

export function Stage2Section({ project }: { project: ProjectDetail }) {
  const output = project.stageOutputs.stage2 as Stage2Output | undefined;
  const saved = answersFor(project, 'stage2');

  return (
    <section className="mt-8" id="stage2">
      <h2 className="text-xl font-semibold">Tahap 2 — Klarifikasi produk</h2>
      <p className="mt-1 text-sm text-slate-600">
        Pertanyaan singkat tentang produkmu. Lewati pertanyaan yang tidak penting; jawaban default
        dipakai.
      </p>
      <div className="mt-4">
        <StageRunner
          projectId={project.id}
          stage="stage2"
          label="Klarifikasi produk"
          activeJob={project.activeJob}
          latestJob={project.latestJob}
          hasOutput={output !== undefined}
          estimate="sekitar 20 detik"
        />
      </div>

      {output && (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-slate-600" data-testid="clarity">
            Kejelasan ide {output.clarity}/5: {output.clarity_reason}
          </p>
          {saved.length > 0 && (
            <p className="text-sm text-green-700" data-testid="answers-saved">
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
            nextStageLabel="Klarifikasi teknis"
          />
          {output.assumptions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Asumsi produk</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700" data-testid="assumptions">
                {output.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {output.deferred_technical.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Dibahas di tahap teknis</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700" data-testid="deferred">
                {output.deferred_technical.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
