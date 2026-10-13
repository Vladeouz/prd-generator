import type { ProjectDetail } from '../../../projects/projects.ts';
import { PROFILE_CHOICE_TEXT } from '../../../stages/stage-3/profile-text.ts';
import type { Stage3Output } from '../../../stages/stage-3/validate.ts';
import { ProfileChoiceForm } from './profile-choice-form.tsx';
import { QuestionForm } from './question-form.tsx';
import { StageRunner } from './stage-runner.tsx';
import { answersFor } from './stage2-section.tsx';

const NEXT_STAGE_READY = 'Tahap berikutnya: Struktur fitur — siap dijalankan.';

export function Stage3Section({ project }: { project: ProjectDetail }) {
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
    <section className="mt-12" id="stage3">
      <h2 className="text-xl font-semibold">Tahap 3 — Klarifikasi teknis</h2>
      <p className="mt-1 text-sm text-slate-600">
        Pertanyaan teknis yang mengubah arsitektur, dan stack yang dipakai. Lewati pertanyaan yang
        tidak penting; jawaban default mengikuti kebijakan yang paling sederhana.
      </p>
      <div className="mt-4">
        {productAnswered ? (
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
          <p className="text-sm text-slate-500" data-testid="stage3-not-ready">
            Simpan jawaban klarifikasi produk dulu, lalu klarifikasi teknis bisa dijalankan.
          </p>
        )}
      </div>

      {output && recommendation && (
        <div className="mt-6 space-y-6">
          {needsChoice ? (
            <div
              className="rounded border border-amber-300 bg-amber-50 p-4 text-sm"
              data-testid="profile-recommendation"
            >
              <h3 className="font-semibold">Stack yang paling cocok belum tersedia</h3>
              <p className="mt-1">
                Idemu paling cocok dibuat sebagai website yang ramah SEO, dan stack itu belum
                tersedia di generator ini. {recommendation.reason}
              </p>
              <p className="mt-1">{recommendation.fallback_if_unsupported}</p>
              <p className="mt-3 font-medium">Pilih kelanjutannya:</p>
              <ProfileChoiceForm projectId={project.id} current={project.profileChoice} />
              {project.profileChoice && project.profileChoice !== 'A' && (
                <p className="mt-2 text-green-700" data-testid="profile-chosen">
                  Pilihan tersimpan: {PROFILE_CHOICE_TEXT[project.profileChoice].label}.
                </p>
              )}
            </div>
          ) : (
            <div
              className="rounded border border-slate-200 bg-white p-4 text-sm"
              data-testid="profile-recommendation"
            >
              <h3 className="font-semibold">Stack: {PROFILE_CHOICE_TEXT.A.label.toLowerCase()}</h3>
              <p className="mt-1">{PROFILE_CHOICE_TEXT.A.consequence}</p>
              <p className="mt-1 text-slate-600">{recommendation.reason}</p>
            </div>
          )}
          {dependsOn.length > 0 && (
            <p className="text-sm text-slate-600" data-testid="depends-on">
              Rekomendasi ini bergantung pada jawabanmu untuk pertanyaan nomor{' '}
              {dependsOn.join(', ')}. Bila jawabanmu berbeda dari default, jalankan ulang
              klarifikasi teknis.
            </p>
          )}

          {output.detected_risks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Risiko yang perlu kamu ketahui</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700" data-testid="risks">
                {output.detected_risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {saved.length > 0 && (
            <p className="text-sm text-green-700" data-testid="answers-saved-stage3">
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
          />
          {output.assumptions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">Asumsi teknis</h3>
              <ul
                className="mt-1 list-disc pl-5 text-sm text-slate-700"
                data-testid="assumptions-stage3"
              >
                {output.assumptions.map((item) => (
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
