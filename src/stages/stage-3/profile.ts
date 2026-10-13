// Pilihan stack setelah tahap 3 (FR-04, `PUT /api/projects/{id}/profile`).
// - Rekomendasi Profil A: proyek langsung memakai stack yang tersedia (`profile_choice` A, diisi
//   saat output tahap 3 berlaku), tanpa pertanyaan tambahan.
// - Rekomendasi Profil B (belum tersedia): user memilih eksplisit antara lanjut dengan stack yang
//   tersedia plus mitigasi SEO, atau menunda. Pilihan tersimpan sebagai keputusan D-01.
// Proyek pindah ke tahap 4 setelah jawaban tahap 3 tersimpan DAN stack sudah dipilih (bukan ditunda).
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { answers, decisions, PROFILE_CHOICES, projects } from '../../core/db/schema.ts';
import { AppError } from '../../core/errors.ts';
import type { ProjectStage } from '../../projects/stage-labels.ts';
import { currentOutput, type Tx } from '../run-stage.ts';
import { PROFILE_CHOICE_TEXT, type ProfileChoice } from './profile-text.ts';
import type { ProfileRecommendation, Stage3Output } from './validate.ts';

export const PROFILE_DECISION_CODE = 'D-01';

export const chooseProfileSchema = z.object({
  choice: z.enum(PROFILE_CHOICES, { error: 'Pilih salah satu kelanjutan stack.' }),
});

export type ChooseProfileInput = z.infer<typeof chooseProfileSchema>;

/** Pilihan yang boleh untuk sebuah rekomendasi. */
export const allowedProfileChoices = (recommendation: ProfileRecommendation): ProfileChoice[] =>
  recommendation.profile === 'A' ? ['A'] : ['A_with_seo_mitigation', 'postpone'];

/** Tahap proyek setelah klarifikasi teknis, dari jawaban dan pilihan stack yang tersimpan. */
export function stageAfterStage3(tx: Tx, projectId: string): ProjectStage {
  const answered = tx
    .select({ id: answers.id })
    .from(answers)
    .where(and(eq(answers.projectId, projectId), eq(answers.stage, 'stage3')))
    .get();
  const project = tx
    .select({ profileChoice: projects.profileChoice })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  const chosen =
    project?.profileChoice === 'A' || project?.profileChoice === 'A_with_seo_mitigation';
  return answered && chosen ? 'stage4' : 'stage3';
}

export function chooseProfile(
  { db, clock }: { db: Db; clock: Clock },
  projectId: string,
  input: ChooseProfileInput,
) {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  const output = currentOutput<Stage3Output>(db, projectId, 'stage3');
  if (!output) {
    throw new AppError('CONFLICT', 'Jalankan klarifikasi teknis dulu sebelum memilih stack.');
  }
  const recommendation = output.profile_recommendation;
  if (!allowedProfileChoices(recommendation).includes(input.choice)) {
    throw new AppError('VALIDATION_ERROR', 'Pilihan ini tidak tersedia untuk rekomendasi stack.', {
      choice:
        recommendation.profile === 'A'
          ? 'Proyek ini langsung memakai stack yang tersedia.'
          : 'Pilih lanjut dengan mitigasi SEO, atau tunda.',
    });
  }

  const now = clock();
  return db.transaction((tx) => {
    tx.delete(decisions)
      .where(and(eq(decisions.projectId, projectId), eq(decisions.code, PROFILE_DECISION_CODE)))
      .run();
    const decision =
      recommendation.profile === 'B'
        ? tx
            .insert(decisions)
            .values({
              id: randomUUID(),
              projectId,
              code: PROFILE_DECISION_CODE,
              origin: 'profile',
              category: 'stack',
              finding: profileFinding(recommendation),
              chosenOption: PROFILE_CHOICE_TEXT[input.choice].label,
              consequence: PROFILE_CHOICE_TEXT[input.choice].consequence,
              createdAt: now,
            })
            .returning()
            .get()
        : null;
    tx.update(projects)
      .set({ profileChoice: input.choice, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();
    const currentStage = stageAfterStage3(tx, projectId);
    tx.update(projects).set({ currentStage }).where(eq(projects.id, projectId)).run();
    return { profileChoice: input.choice, currentStage, decision };
  });
}

/** Temuan keputusan D-01: alasan rekomendasi dan apa yang terjadi selama stack belum tersedia. */
export const profileFinding = (recommendation: ProfileRecommendation) =>
  `Idenya paling cocok dibuat sebagai website yang ramah SEO, dan stack itu belum tersedia. ${recommendation.reason} ${recommendation.fallback_if_unsupported}`.trim();
