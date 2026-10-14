// Pilihan fitur rekomendasi setelah tahap 4 (FR-05, `PUT /api/projects/{id}/features`).
// - Semua fitur rekomendasi tidak dicentang secara default; hanya kode yang dikirim di `accepted`
//   yang ikut dikerjakan.
// - Setiap fitur rekomendasi disimpan di `feature_choices` (accepted 1 atau 0), menggantikan
//   pilihan sebelumnya. Setelah tersimpan, proyek pindah ke tahap 5.
// - Draft untuk tahap berikutnya (`buildFeatureDraft`): fitur rekomendasi yang dicentang menjadi
//   `accepted_recommendations`; sisanya ditambahkan ke `non_goals`.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../../core/clock.ts';
import type { Db } from '../../core/db/client.ts';
import { featureChoices, projects } from '../../core/db/schema.ts';
import { AppError } from '../../core/errors.ts';
import { currentOutput } from '../run-stage.ts';
import type { RecommendedFeature, Stage4Output } from './validate.ts';

export const saveFeaturesSchema = z.object({
  accepted: z.array(z.string(), { error: 'accepted harus berupa daftar kode fitur.' }),
});

export type SaveFeaturesInput = z.infer<typeof saveFeaturesSchema>;

/** Teks non-goal untuk fitur rekomendasi yang tidak dicentang. */
export const notChosenNonGoal = (feature: RecommendedFeature) =>
  `${feature.name} (fitur rekomendasi yang tidak dipilih)`;

export type FeatureDraft = Omit<Stage4Output, 'recommended_features'> & {
  /** Fitur rekomendasi yang dicentang user: ikut dikerjakan, belum punya fase. */
  accepted_recommendations: RecommendedFeature[];
};

export function buildFeatureDraft(output: Stage4Output, accepted: readonly string[]): FeatureDraft {
  const { recommended_features: recommended, ...rest } = output;
  const chosen = recommended.filter((feature) => accepted.includes(feature.id));
  const rejected = recommended.filter((feature) => !accepted.includes(feature.id));
  return {
    ...rest,
    accepted_recommendations: chosen,
    non_goals: [...output.non_goals, ...rejected.map(notChosenNonGoal)],
  };
}

/** Kode fitur rekomendasi yang dicentang user. */
export function acceptedFeatureCodes(db: Db, projectId: string): string[] {
  const rows = db
    .select({ featureCode: featureChoices.featureCode })
    .from(featureChoices)
    .where(and(eq(featureChoices.projectId, projectId), eq(featureChoices.accepted, 1)))
    .all();
  return rows.map((row) => row.featureCode);
}

/** Draft rencana untuk tahap 5; null bila tahap 4 belum punya output yang berlaku. */
export function featureDraft(db: Db, projectId: string): FeatureDraft | null {
  const output = currentOutput<Stage4Output>(db, projectId, 'stage4');
  return output ? buildFeatureDraft(output, acceptedFeatureCodes(db, projectId)) : null;
}

export function saveFeatureChoices(
  { db, clock }: { db: Db; clock: Clock },
  projectId: string,
  input: SaveFeaturesInput,
) {
  const project = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  const output = currentOutput<Stage4Output>(db, projectId, 'stage4');
  if (!output) {
    throw new AppError('CONFLICT', 'Jalankan struktur fitur dulu sebelum memilih fitur.');
  }
  const known = output.recommended_features.map((feature) => feature.id);
  const unknown = input.accepted.filter((code) => !known.includes(code));
  if (unknown.length > 0) {
    throw new AppError('VALIDATION_ERROR', 'Ada fitur yang tidak ada di rekomendasi.', {
      accepted: `Fitur tidak ada di rekomendasi: ${[...new Set(unknown)].join(', ')}.`,
    });
  }

  const accepted = known.filter((code) => input.accepted.includes(code));
  const now = clock();
  db.transaction((tx) => {
    tx.delete(featureChoices).where(eq(featureChoices.projectId, projectId)).run();
    if (known.length > 0) {
      tx.insert(featureChoices)
        .values(
          known.map((code) => ({
            id: randomUUID(),
            projectId,
            featureCode: code,
            accepted: accepted.includes(code) ? 1 : 0,
          })),
        )
        .run();
    }
    tx.update(projects)
      .set({ currentStage: 'stage5', updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();
  });
  return { accepted, currentStage: 'stage5' as const };
}
