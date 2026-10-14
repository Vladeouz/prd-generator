// Keputusan atas temuan review (FR-06, `PUT /api/projects/{id}/decisions/{origin}`).
// - Setiap temuan menjadi satu keputusan dengan kode temuannya (`RV-01`, ...), kategori, temuan,
//   opsi yang dipilih, dan konsekuensi opsi itu.
// - Temuan yang tidak dikirim memakai rekomendasinya (default: rekomendasi).
// - Keputusan lama dari review yang sama diganti seluruhnya; proyek lalu pindah ke tahap berikutnya.
// Review kedua (`review2`) ditambahkan di T-013.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { decisions, projects } from '../../core/db/schema.ts';
import { AppError } from '../../core/errors.ts';
import type { ProjectStage } from '../../projects/stage-labels.ts';
import { currentOutput, type Stage } from '../run-stage.ts';
import type { Stage5Output } from './validate.ts';

export const saveDecisionsSchema = z.object({
  choices: z.array(z.object({ findingId: z.string(), option: z.string() }).strict(), {
    error: 'choices harus berupa daftar pilihan.',
  }),
});

export type SaveDecisionsInput = z.infer<typeof saveDecisionsSchema>;

type ReviewConfig = { stage: Stage; nextStage: ProjectStage; notRun: string };

/** Review yang punya temuan untuk diputuskan, per `origin`. */
export const REVIEWS: Partial<Record<string, ReviewConfig>> = {
  review1: {
    stage: 'stage5',
    nextStage: 'stage6',
    notRun: 'Jalankan review kritis dulu sebelum memutuskan temuan.',
  },
};

export function parseOrigin(value: string): ReviewConfig & { origin: 'review1' } {
  const review = REVIEWS[value];
  if (!review) throw new AppError('NOT_FOUND', `Review tidak dikenal: ${value}.`);
  return { ...review, origin: value as 'review1' };
}

export function saveReviewDecisions(
  { db, clock }: { db: Db; clock: Clock },
  projectId: string,
  originValue: string,
  input: SaveDecisionsInput,
) {
  const review = parseOrigin(originValue);
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  const output = currentOutput<Stage5Output>(db, projectId, review.stage);
  if (!output) throw new AppError('CONFLICT', review.notRun);

  const details: Record<string, string> = {};
  const chosen = new Map<string, string>();
  for (const { findingId, option } of input.choices) {
    const finding = output.findings.find((f) => f.id === findingId);
    if (!finding) details[findingId] = 'Temuan tidak ada di hasil review.';
    else if (chosen.has(findingId)) details[findingId] = 'Temuan dipilih lebih dari sekali.';
    else if (!finding.options.some((o) => o.label === option)) {
      details[findingId] = `Opsi tidak ada untuk temuan ini: ${option}.`;
    }
    chosen.set(findingId, option);
  }
  if (Object.keys(details).length > 0) {
    throw new AppError('VALIDATION_ERROR', 'Ada pilihan yang tidak cocok dengan temuan.', details);
  }

  const now = clock();
  return db.transaction((tx) => {
    tx.delete(decisions)
      .where(and(eq(decisions.projectId, projectId), eq(decisions.origin, review.origin)))
      .run();
    const saved = output.findings.map((finding) => {
      const label = chosen.get(finding.id) ?? finding.recommended_option;
      const option = finding.options.find((o) => o.label === label);
      return tx
        .insert(decisions)
        .values({
          id: randomUUID(),
          projectId,
          code: finding.id,
          origin: review.origin,
          category: finding.category,
          finding: finding.finding,
          chosenOption: label,
          consequence: option?.consequence ?? '',
          createdAt: now,
        })
        .returning()
        .get();
    });
    tx.update(projects)
      .set({ currentStage: review.nextStage, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();
    return { decisions: saved, currentStage: review.nextStage };
  });
}
