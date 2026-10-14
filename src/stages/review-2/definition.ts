// Review kedua: PRD yang sudah ditulis diperiksa sebelum dipecah menjadi task (FR-07).
import { and, eq } from 'drizzle-orm';
import { decisions, projects } from '../../core/db/schema.ts';
import { latestDocument } from '../../projects/documents.ts';
import { extractJson } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import type { StageDefinition } from '../run-stage.ts';
import { reachedStage } from '../stage-5/definition.ts';
import { endpointGaps, formatGaps } from './gaps.ts';
import { REVIEW2_CATEGORIES, type Review2Output, validateReview2 } from './validate.ts';

export function review2Definition(): StageDefinition<Review2Output> {
  const prompt = loadPrompt('review-2');
  return {
    stage: 'review2',
    promptVersion: prompt.version,
    notReadyReason: ({ db, projectId }) =>
      latestDocument(db, projectId, 'prd') && reachedStage(db, projectId, 'review2')
        ? null
        : 'Tulis PRD dulu sebelum review kedua.',
    buildPrompt: ({ db, projectId }) => {
      const prd = latestDocument(db, projectId, 'prd')?.content ?? '';
      return renderPrompt(prompt, {
        gaps: formatGaps(endpointGaps(prd)),
        categories: REVIEW2_CATEGORIES.join(', '),
        prd,
      });
    },
    parse: (result) => extractJson(result) as Review2Output,
    validate: validateReview2,
    // Temuan baru: keputusan review kedua yang lama tidak berlaku lagi.
    onSuccess: ({ tx, projectId, now }) => {
      tx.delete(decisions)
        .where(and(eq(decisions.projectId, projectId), eq(decisions.origin, 'review2')))
        .run();
      tx.update(projects)
        .set({ currentStage: 'review2', updatedAt: now })
        .where(eq(projects.id, projectId))
        .run();
    },
  };
}
