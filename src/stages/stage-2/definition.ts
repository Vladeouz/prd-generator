// Tahap 2: klarifikasi produk (FR-03).

import { and, eq } from 'drizzle-orm';
import { STAGE_PROFILES } from '../../core/config/claude.ts';
import { answers, projects } from '../../core/db/schema.ts';
import { extractJson } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import type { StageDefinition } from '../run-stage.ts';
import { PRODUCT_TOPICS, type Stage2Output, validateStage2 } from './validate.ts';

export function stage2Definition(): StageDefinition<Stage2Output> {
  const prompt = loadPrompt('stage-2');
  return {
    stage: 'stage2',
    promptVersion: prompt.version,
    profile: STAGE_PROFILES.stage2,
    buildPrompt: ({ db, projectId }) => {
      const project = db
        .select({ idea: projects.idea })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();
      if (!project) throw new Error('Proyek tidak ditemukan.');
      return renderPrompt(prompt, { topics: PRODUCT_TOPICS.join(', '), idea: project.idea });
    },
    parse: (result) => extractJson(result) as Stage2Output,
    validate: validateStage2,
    // Pertanyaan baru: jawaban lama tidak berlaku lagi, dan user kembali menjawab di tahap 2.
    onSuccess: ({ tx, projectId, now }) => {
      tx.delete(answers)
        .where(and(eq(answers.projectId, projectId), eq(answers.stage, 'stage2')))
        .run();
      tx.update(projects)
        .set({ currentStage: 'stage2', updatedAt: now })
        .where(eq(projects.id, projectId))
        .run();
    },
  };
}
