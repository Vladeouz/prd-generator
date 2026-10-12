// Hasil tahap 2 yang menjadi input tahap 3 (FR-03: `deferred_technical` ikut dikirim).
import { eq } from 'drizzle-orm';
import type { Db } from '../../core/db/client.ts';
import { projects } from '../../core/db/schema.ts';
import { formatAnswers, formatList, type StoredAnswer, storedAnswers } from '../answers.ts';
import { currentOutput } from '../run-stage.ts';
import type { Stage2Output } from './validate.ts';

export type ProductContext = {
  idea: string;
  answers: StoredAnswer[];
  assumptions: string[];
  deferredTechnical: string[];
};

export function productContext(db: Db, projectId: string): ProductContext {
  const project = db
    .select({ idea: projects.idea })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new Error('Proyek tidak ditemukan.');
  const output = currentOutput<Stage2Output>(db, projectId, 'stage2');
  return {
    idea: project.idea,
    answers: storedAnswers(db, projectId, 'stage2'),
    assumptions: output?.assumptions ?? [],
    deferredTechnical: output?.deferred_technical ?? [],
  };
}

/** Blok konteks produk untuk prompt tahap 3, mengikuti `promptStage3` di e2e-gym.mjs. */
export function formatProductContext(context: ProductContext): string {
  return `Ide:
"""${context.idea}"""

Jawaban klarifikasi produk:
${formatAnswers(context.answers)}

Asumsi produk:
${formatList(context.assumptions)}

Catatan teknis dari tahap sebelumnya:
${formatList(context.deferredTechnical)}`;
}
