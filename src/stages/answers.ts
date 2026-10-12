// Jawaban user untuk pertanyaan klarifikasi (FR-03, dipakai juga tahap 3).
//
// Bentuk `value` per pertanyaan di `PUT /api/projects/{id}/answers/{stage}`:
//   null               → dilewati: jawaban default dipakai (`source` default, atau guess untuk
//                        topik yang hanya diketahui user)
//   "opsi"             → single: satu opsi yang ada; text: isian teks
//   ["opsi", ...]      → multi: satu atau lebih opsi yang ada
//   { "lainnya": "…" } → single/multi: jawaban sendiri di luar opsi
// Setiap pertanyaan wajib ada tepat satu kali; jawaban lama tahap itu diganti seluruhnya.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Clock } from '../core/clock.ts';
import type { Db } from '../core/db/client.ts';
import { answers, projects } from '../core/db/schema.ts';
import { AppError } from '../core/errors.ts';
import type { ProjectStage } from '../projects/stage-labels.ts';
import type { Question } from './questions.ts';
import { currentOutput, type Stage } from './run-stage.ts';

export type QuestionStageConfig = {
  /** Topik yang default-nya disimpan sebagai tebakan (`source: guess`). */
  guessTopics: readonly string[];
  /** Tahap proyek setelah jawaban disimpan. */
  nextStage: ProjectStage;
};

/** Tahap yang punya pertanyaan untuk user; tahap 3 ditambahkan di T-009. */
export const QUESTION_STAGES: Partial<Record<Stage, QuestionStageConfig>> = {
  stage2: { guessTopics: ['masalah', 'pengguna'], nextStage: 'stage3' },
};

export const answerValueSchema = z.union([
  z.null(),
  z.string(),
  z.array(z.string()),
  z.object({ lainnya: z.string() }).strict(),
]);

export const saveAnswersSchema = z.object({
  answers: z.array(z.object({ questionId: z.string(), value: answerValueSchema }).strict()),
});

export type AnswerValue = z.infer<typeof answerValueSchema>;
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;
export type AnswerSource = 'user' | 'default' | 'guess';
export type ResolvedAnswer = { value: string | string[]; source: AnswerSource };

/** Mengubah jawaban mentah menjadi nilai yang disimpan, atau pesan error untuk user. */
export function resolveAnswer(
  question: Question,
  value: AnswerValue,
  guessTopics: readonly string[],
): ResolvedAnswer | { error: string } {
  if (value === null) {
    return {
      value: question.recommended_default,
      source: guessTopics.includes(question.topic) ? 'guess' : 'default',
    };
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (question.type === 'text') return { error: 'Pertanyaan ini dijawab dengan teks biasa.' };
    const text = value.lainnya.trim();
    return text ? { value: text, source: 'user' } : { error: 'Isi jawaban "Lainnya".' };
  }
  if (question.type === 'single') {
    return typeof value === 'string' && question.options.includes(value)
      ? { value, source: 'user' }
      : { error: 'Pilih salah satu opsi yang tersedia.' };
  }
  if (question.type === 'multi') {
    if (!Array.isArray(value) || value.length === 0) return { error: 'Pilih minimal satu opsi.' };
    if (new Set(value).size !== value.length) return { error: 'Opsi dipilih lebih dari sekali.' };
    return value.every((item) => question.options.includes(item))
      ? { value, source: 'user' }
      : { error: 'Pilih hanya dari opsi yang tersedia.' };
  }
  const text = typeof value === 'string' ? value.trim() : '';
  return text
    ? { value: text, source: 'user' }
    : { error: 'Isi jawaban atau lewati pertanyaan ini.' };
}

export type StoredAnswer = {
  questionId: string;
  topic: string;
  question: string;
  value: string | string[];
  source: AnswerSource;
};

export function saveAnswers(
  { db, clock }: { db: Db; clock: Clock },
  projectId: string,
  stage: Stage,
  input: SaveAnswersInput,
): StoredAnswer[] {
  const config = QUESTION_STAGES[stage];
  if (!config) throw new AppError('BAD_REQUEST', 'Tahap ini tidak punya pertanyaan.');
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new AppError('NOT_FOUND', 'Proyek tidak ditemukan.');
  const output = currentOutput<{ questions: Question[] }>(db, projectId, stage);
  if (!output) {
    throw new AppError('CONFLICT', 'Tahap ini belum punya pertanyaan. Jalankan tahapnya dulu.');
  }

  const details: Record<string, string> = {};
  const byId = new Map<string, AnswerValue>();
  for (const { questionId, value } of input.answers) {
    if (!output.questions.some((q) => q.id === questionId))
      details[questionId] = 'Pertanyaan tidak dikenal.';
    else if (byId.has(questionId))
      details[questionId] = 'Pertanyaan ini dijawab lebih dari sekali.';
    byId.set(questionId, value);
  }
  const resolved: StoredAnswer[] = [];
  for (const question of output.questions) {
    if (!byId.has(question.id)) {
      details[question.id] ??= 'Pertanyaan ini belum dijawab atau dilewati.';
      continue;
    }
    const result = resolveAnswer(question, byId.get(question.id) ?? null, config.guessTopics);
    if ('error' in result) details[question.id] ??= result.error;
    else
      resolved.push({
        questionId: question.id,
        topic: question.topic,
        question: question.question,
        ...result,
      });
  }
  if (Object.keys(details).length > 0) {
    throw new AppError('VALIDATION_ERROR', 'Jawaban tidak cocok dengan pertanyaan.', details);
  }

  const now = clock();
  db.transaction((tx) => {
    tx.delete(answers)
      .where(and(eq(answers.projectId, projectId), eq(answers.stage, stage)))
      .run();
    for (const answer of resolved) {
      tx.insert(answers)
        .values({
          id: randomUUID(),
          projectId,
          stage,
          questionId: answer.questionId,
          topic: answer.topic,
          valueJson: JSON.stringify(answer.value),
          source: answer.source,
          createdAt: now,
        })
        .run();
    }
    tx.update(projects)
      .set({ currentStage: config.nextStage, updatedAt: now })
      .where(eq(projects.id, projectId))
      .run();
  });
  return resolved;
}

/** Jawaban tersimpan untuk pertanyaan output yang berlaku, berurutan sesuai pertanyaan. */
export function storedAnswers(db: Db, projectId: string, stage: Stage): StoredAnswer[] {
  const output = currentOutput<{ questions: Question[] }>(db, projectId, stage);
  if (!output) return [];
  const rows = db
    .select()
    .from(answers)
    .where(and(eq(answers.projectId, projectId), eq(answers.stage, stage)))
    .all();
  return output.questions.flatMap((question) => {
    const row = rows.find((r) => r.questionId === question.id);
    return row
      ? [
          {
            questionId: question.id,
            topic: question.topic,
            question: question.question,
            value: JSON.parse(row.valueJson) as string | string[],
            source: row.source,
          },
        ]
      : [];
  });
}

/** Format jawaban untuk prompt tahap berikutnya (dari `formatAnswers` di e2e-gym.mjs). */
export function formatAnswers(list: StoredAnswer[]): string {
  if (list.length === 0) return '- (tidak ada)';
  return list
    .map((answer) => {
      const value = Array.isArray(answer.value) ? answer.value.join(' | ') : answer.value;
      const note = answer.source === 'guess' ? ' (TEBAKAN default, belum dikonfirmasi user)' : '';
      return `- ${answer.topic}: ${value}${note}`;
    })
    .join('\n');
}

export const formatList = (items: string[]) =>
  items.map((item) => `- ${item}`).join('\n') || '- (tidak ada)';
