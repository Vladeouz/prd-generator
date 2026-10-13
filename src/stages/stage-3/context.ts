// Hasil tahap 3 yang menjadi input tahap 4, mengikuti `contextBlock` di e2e-gym.mjs. Jawaban yang
// memakai default ditulis dengan kunci kebijakannya (lihat `formatAnswers`).
import { eq } from 'drizzle-orm';
import type { Db } from '../../core/db/client.ts';
import { projects } from '../../core/db/schema.ts';
import { formatAnswers, formatList, type StoredAnswer, storedAnswers } from '../answers.ts';
import { currentOutput } from '../run-stage.ts';
import { PROFILE_CHOICE_TEXT, type ProfileChoice } from './profile-text.ts';
import type { Stage3Output } from './validate.ts';

export type TechnicalContext = {
  answers: StoredAnswer[];
  assumptions: string[];
  risks: string[];
  profileChoice: ProfileChoice | null;
};

export function technicalContext(db: Db, projectId: string): TechnicalContext {
  const project = db
    .select({ profileChoice: projects.profileChoice })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!project) throw new Error('Proyek tidak ditemukan.');
  const output = currentOutput<Stage3Output>(db, projectId, 'stage3');
  return {
    answers: storedAnswers(db, projectId, 'stage3'),
    assumptions: output?.assumptions ?? [],
    risks: output?.detected_risks ?? [],
    profileChoice: project.profileChoice,
  };
}

export function formatTechnicalContext(context: TechnicalContext): string {
  const stack = context.profileChoice
    ? `${PROFILE_CHOICE_TEXT[context.profileChoice].label}. ${PROFILE_CHOICE_TEXT[context.profileChoice].consequence}`
    : '(belum dipilih)';
  return `Jawaban teknis:
${formatAnswers(context.answers)}

Asumsi teknis:
${formatList(context.assumptions)}

Risiko yang sudah terdeteksi:
${formatList(context.risks)}

Pilihan stack:
${stack}`;
}
