// Tahap 4: struktur fitur dan draft fase (FR-05).

import { eq } from 'drizzle-orm';
import { STAGE_PROFILES } from '../../core/config/claude.ts';
import { featureChoices, projects } from '../../core/db/schema.ts';
import { storedAnswers } from '../answers.ts';
import { extractJson } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import { currentOutput, type StageDefinition } from '../run-stage.ts';
import { formatProductContext, productContext } from '../stage-2/context.ts';
import { formatTechnicalContext, technicalContext } from '../stage-3/context.ts';
import { type Stage4Output, validateStage4 } from './validate.ts';

export function stage4Definition(): StageDefinition<Stage4Output> {
  const prompt = loadPrompt('stage-4');
  return {
    stage: 'stage4',
    promptVersion: prompt.version,
    profile: STAGE_PROFILES.stage4,
    notReadyReason: ({ db, projectId }) => {
      if (!currentOutput(db, projectId, 'stage3')) {
        return 'Jalankan klarifikasi teknis dulu sebelum struktur fitur.';
      }
      if (storedAnswers(db, projectId, 'stage3').length === 0) {
        return 'Simpan jawaban klarifikasi teknis dulu sebelum struktur fitur.';
      }
      const { profileChoice } = technicalContext(db, projectId);
      if (profileChoice === 'postpone') {
        return 'Proyek ditunda. Ubah pilihan stack di klarifikasi teknis untuk melanjutkan.';
      }
      return profileChoice === null ? 'Pilih kelanjutan stack dulu sebelum struktur fitur.' : null;
    },
    buildPrompt: ({ db, projectId }) =>
      renderPrompt(prompt, {
        context: `${formatProductContext(productContext(db, projectId))}

${formatTechnicalContext(technicalContext(db, projectId))}`,
      }),
    parse: (result) => extractJson(result) as Stage4Output,
    validate: validateStage4,
    // Fitur rekomendasi baru: pilihan fitur lama tidak berlaku lagi.
    onSuccess: ({ tx, projectId, now }) => {
      tx.delete(featureChoices).where(eq(featureChoices.projectId, projectId)).run();
      tx.update(projects)
        .set({ currentStage: 'stage4', updatedAt: now })
        .where(eq(projects.id, projectId))
        .run();
    },
  };
}
