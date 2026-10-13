// Tahap 3: klarifikasi teknis dan rekomendasi stack (FR-04).
import { and, eq } from 'drizzle-orm';
import { answers, decisions, projects } from '../../core/db/schema.ts';
import { storedAnswers } from '../answers.ts';
import { extractJson } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import { currentOutput, type StageDefinition } from '../run-stage.ts';
import { formatProductContext, productContext } from '../stage-2/context.ts';
import { formatPolicy, TECH_TOPICS } from './policy.ts';
import { PROFILE_DECISION_CODE } from './profile.ts';
import { AFFECTS, type Stage3Output, validateStage3 } from './validate.ts';

export function stage3Definition(): StageDefinition<Stage3Output> {
  const prompt = loadPrompt('stage-3');
  return {
    stage: 'stage3',
    promptVersion: prompt.version,
    notReadyReason: ({ db, projectId }) => {
      if (!currentOutput(db, projectId, 'stage2')) {
        return 'Jalankan klarifikasi produk dulu sebelum klarifikasi teknis.';
      }
      return storedAnswers(db, projectId, 'stage2').length === 0
        ? 'Simpan jawaban klarifikasi produk dulu sebelum klarifikasi teknis.'
        : null;
    },
    buildPrompt: ({ db, projectId }) =>
      renderPrompt(prompt, {
        topics: TECH_TOPICS.join(', '),
        affects: AFFECTS.join(', '),
        policy: formatPolicy(),
        context: formatProductContext(productContext(db, projectId)),
      }),
    parse: (result) => extractJson(result) as Stage3Output,
    validate: validateStage3,
    // Pertanyaan dan rekomendasi baru: jawaban dan pilihan stack lama tidak berlaku lagi.
    // Rekomendasi Profil A langsung memakai stack yang tersedia; Profil B menunggu pilihan user.
    onSuccess: ({ tx, projectId, output, now }) => {
      tx.delete(answers)
        .where(and(eq(answers.projectId, projectId), eq(answers.stage, 'stage3')))
        .run();
      tx.delete(decisions)
        .where(and(eq(decisions.projectId, projectId), eq(decisions.code, PROFILE_DECISION_CODE)))
        .run();
      tx.update(projects)
        .set({
          currentStage: 'stage3',
          profileChoice: output.profile_recommendation.profile === 'A' ? 'A' : null,
          updatedAt: now,
        })
        .where(eq(projects.id, projectId))
        .run();
    },
  };
}
