// Keputusan atas temuan review (FR-06, `PUT /api/projects/{id}/decisions/{origin}`).
// - Setiap temuan menjadi satu keputusan dengan kode temuannya (`RV-01`, ...), kategori, temuan,
//   opsi yang dipilih, dan konsekuensi opsi itu.
// - Temuan yang tidak dikirim memakai rekomendasinya (default: rekomendasi).
// - Keputusan lama dari review yang sama diganti seluruhnya; proyek lalu pindah ke tahap berikutnya.
// - Review kedua (`review2`, FR-07): hanya bisa diputuskan selama proyek di tahap review kedua.
//   Bila ada opsi `changes_prd` yang dipilih, proyek tetap di `review2` dan `regenerate` true:
//   pemanggil menjalankan ulang tahap 6 sekali, dan PRD baru memindahkan proyek ke TASKS.
//   Tanpa perbaikan, proyek langsung pindah ke TASKS.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { decisions, projects } from '../../core/db/schema.ts';
import { AppError } from '../../core/errors.ts';
import type { ProjectStage } from '../../projects/stage-labels.ts';
import { currentOutput, type RunStage, type Stage } from '../run-stage.ts';
import type { Stage5Output } from './validate.ts';

export const saveDecisionsSchema = z.object({
  choices: z.array(z.object({ findingId: z.string(), option: z.string() }).strict(), {
    error: 'choices harus berupa daftar pilihan.',
  }),
});

export type SaveDecisionsInput = z.infer<typeof saveDecisionsSchema>;

type ReviewOrigin = 'review1' | 'review2';

type ReviewConfig = {
  stage: Stage;
  nextStage: ProjectStage;
  notRun: string;
  /** Keputusan hanya bisa disimpan saat proyek di tahap ini. */
  onlyAt?: { stage: ProjectStage; message: string };
  /** Opsi `changes_prd` yang dipilih membuat PRD ditulis ulang. */
  regeneratesPrd?: boolean;
};

/** Bentuk bersama output tahap 5 dan review kedua (`changes_prd` hanya di review kedua). */
type ReviewOutput = {
  findings: (Omit<Stage5Output['findings'][number], 'category' | 'options'> & {
    category: string;
    options: { label: string; consequence: string; changes_prd?: boolean }[];
  })[];
};

/** Review yang punya temuan untuk diputuskan, per `origin`. */
export const REVIEWS: Partial<Record<string, ReviewConfig>> = {
  review1: {
    stage: 'stage5',
    nextStage: 'stage6',
    notRun: 'Jalankan review kritis dulu sebelum memutuskan temuan.',
  },
  review2: {
    stage: 'review2',
    nextStage: 'stage7',
    notRun: 'Jalankan review kedua dulu sebelum memutuskan temuan.',
    onlyAt: {
      stage: 'review2',
      message:
        'Keputusan review kedua sudah disimpan dan proyek sudah lanjut ke TASKS. Jalankan ulang review kedua untuk mengubahnya.',
    },
    regeneratesPrd: true,
  },
};

export function parseOrigin(value: string): ReviewConfig & { origin: ReviewOrigin } {
  const review = REVIEWS[value];
  if (!review) throw new AppError('NOT_FOUND', `Review tidak dikenal: ${value}.`);
  return { ...review, origin: value as ReviewOrigin };
}

export function saveReviewDecisions(
  { db, clock }: { db: Db; clock: Clock },
  projectId: string,
  originValue: string,
  input: SaveDecisionsInput,
) {
  const review = parseOrigin(originValue);
  const project = db
    .select({ currentStage: projects.currentStage })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  // Tahap review (stage5, review2) tidak pernah stage7, jadi sama dengan tahap run-nya.
  const output = currentOutput<ReviewOutput>(db, projectId, review.stage as RunStage);
  if (!output) throw new AppError('CONFLICT', review.notRun);
  if (review.onlyAt && project.currentStage !== review.onlyAt.stage) {
    throw new AppError('CONFLICT', review.onlyAt.message);
  }

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

  const optionOf = (finding: ReviewOutput['findings'][number]) => {
    const label = chosen.get(finding.id) ?? finding.recommended_option;
    return { label, option: finding.options.find((o) => o.label === label) };
  };
  const regenerate =
    review.regeneratesPrd === true &&
    output.findings.some((finding) => optionOf(finding).option?.changes_prd === true);
  const nextStage = regenerate ? review.stage : review.nextStage;

  const now = clock();
  return db.transaction((tx) => {
    tx.delete(decisions)
      .where(and(eq(decisions.projectId, projectId), eq(decisions.origin, review.origin)))
      .run();
    const saved = output.findings.map((finding) => {
      const { label, option } = optionOf(finding);
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
      .set({ currentStage: nextStage, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();
    return { decisions: saved, currentStage: nextStage, regenerate };
  });
}
