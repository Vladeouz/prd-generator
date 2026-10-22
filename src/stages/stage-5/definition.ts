// Tahap 5: review kritis atas draft rencana sebelum PRD ditulis (FR-06).

import { and, eq } from 'drizzle-orm';
import { STAGE_PROFILES } from '../../core/config/claude.ts';
import type { Db } from '../../core/db/client.ts';
import { decisions, PROJECT_STAGES, projects } from '../../core/db/schema.ts';
import { extractJson } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import type { StageDefinition } from '../run-stage.ts';
import { formatProductContext, productContext } from '../stage-2/context.ts';
import { formatTechnicalContext, technicalContext } from '../stage-3/context.ts';
import { featureDraft } from '../stage-4/features.ts';
import { REVIEW_CATEGORIES, type Stage5Output, validateStage5 } from './validate.ts';

/** True bila tahap proyek saat ini sudah sampai `stage` atau lewat. */
export function reachedStage(db: Db, projectId: string, stage: (typeof PROJECT_STAGES)[number]) {
  const project = db
    .select({ currentStage: projects.currentStage })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new Error('Proyek tidak ditemukan.');
  return PROJECT_STAGES.indexOf(project.currentStage) >= PROJECT_STAGES.indexOf(stage);
}

/** Fase struktur fitur tahap 4, berurutan. */
const draftPhases = (db: Db, projectId: string) =>
  [...(featureDraft(db, projectId)?.phases ?? [])].sort((a, b) => a.phase - b.phase);

export function stage5Definition(): StageDefinition<Stage5Output> {
  const prompt = loadPrompt('stage-5');
  return {
    stage: 'stage5',
    promptVersion: prompt.version,
    profile: STAGE_PROFILES.stage5,
    notReadyReason: ({ db, projectId }) => {
      if (!featureDraft(db, projectId)) {
        return 'Jalankan struktur fitur dulu sebelum review kritis.';
      }
      return reachedStage(db, projectId, 'stage5')
        ? null
        : 'Simpan pilihan fitur rekomendasi dulu sebelum review kritis.';
    },
    buildPrompt: ({ db, projectId }) =>
      renderPrompt(prompt, {
        categories: REVIEW_CATEGORIES.join(', '),
        context: `${formatProductContext(productContext(db, projectId))}

${formatTechnicalContext(technicalContext(db, projectId))}`,
        draft: JSON.stringify(featureDraft(db, projectId), null, 2),
        phases: draftPhases(db, projectId)
          .map((p) => `${p.phase} (${p.name})`)
          .join(', '),
      }),
    parse: (result) => extractJson(result) as Stage5Output,
    validate: (output, { db, projectId }) =>
      validateStage5(
        output,
        draftPhases(db, projectId).map((p) => p.phase),
      ),
    // Temuan baru: keputusan review pertama yang lama tidak berlaku lagi.
    onSuccess: ({ tx, projectId, now }) => {
      tx.delete(decisions)
        .where(and(eq(decisions.projectId, projectId), eq(decisions.origin, 'review1')))
        .run();
      tx.update(projects)
        .set({ currentStage: 'stage5', updatedAt: now })
        .where(eq(projects.id, projectId))
        .run();
    },
  };
}
