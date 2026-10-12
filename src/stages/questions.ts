// Pertanyaan klarifikasi (tahap 2 dan 3): tipe, validasi, dan jawaban default.
// Validasi diturunkan dari `validate` di docs/reference/validate-claude-p-v2.mjs dan
// `validateQuestions` di docs/reference/e2e-gym.mjs.

export type QuestionType = 'single' | 'multi' | 'text';

export type Question = {
  id: string;
  topic: string;
  question: string;
  type: QuestionType;
  options: string[];
  recommended_default: string | string[];
  why_it_matters: string;
};

export const MAX_DEFAULT_MULTI = 3;
const REQUIRED_STRINGS = ['id', 'topic', 'question', 'type', 'why_it_matters'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Error kontrak untuk daftar pertanyaan; kosong bila semuanya valid. */
export function validateQuestions(
  questions: unknown,
  { topics, allowText }: { topics: readonly string[]; allowText: boolean },
): string[] {
  if (!Array.isArray(questions)) return ['questions bukan array'];
  const errors: string[] = [];
  const seenTopics = new Set<unknown>();
  const seenIds = new Set<unknown>();
  const types = allowText ? ['single', 'multi', 'text'] : ['single', 'multi'];

  questions.forEach((q: unknown, i) => {
    const p = `questions[${i}]`;
    if (!isRecord(q)) {
      errors.push(`${p} bukan objek`);
      return;
    }
    for (const key of REQUIRED_STRINGS) {
      const value = q[key];
      if (typeof value !== 'string' || !value.trim())
        errors.push(`${p}.${key} kosong/bukan string`);
    }
    if (seenIds.has(q.id)) errors.push(`${p}.id "${String(q.id)}" dipakai lebih dari sekali`);
    seenIds.add(q.id);
    if (!topics.includes(q.topic as string))
      errors.push(`${p}.topic tidak dikenal: ${String(q.topic)}`);
    if (seenTopics.has(q.topic))
      errors.push(`${p}.topic "${String(q.topic)}" dipakai lebih dari sekali`);
    seenTopics.add(q.topic);
    if (!types.includes(q.type as string)) errors.push(`${p}.type tidak valid: ${String(q.type)}`);

    const options = Array.isArray(q.options) ? q.options : null;
    if (!options) {
      errors.push(`${p}.options bukan array`);
    } else if (options.some((option) => typeof option !== 'string' || !option.trim())) {
      errors.push(`${p}.options berisi nilai kosong/bukan string`);
    } else if (q.type !== 'text' && (options.length < 2 || options.length > 6)) {
      errors.push(`${p}.options berisi ${options.length}, harus 2-6`);
    }

    const d = q.recommended_default;
    if (q.type === 'single') {
      if (typeof d !== 'string') errors.push(`${p}.recommended_default harus string untuk single`);
      else if (options && !options.includes(d)) {
        errors.push(`${p}.recommended_default tidak sama dengan opsi mana pun`);
      }
    } else if (q.type === 'multi') {
      if (!Array.isArray(d)) errors.push(`${p}.recommended_default harus array untuk multi`);
      else {
        if (d.length < 1 || d.length > MAX_DEFAULT_MULTI) {
          errors.push(`${p}.recommended_default berisi ${d.length}, harus 1-${MAX_DEFAULT_MULTI}`);
        }
        const unknown = d.filter((value) => options && !options.includes(value));
        if (unknown.length) {
          errors.push(`${p}.recommended_default berisi nilai di luar opsi: ${unknown.join(' | ')}`);
        }
      }
    } else if (q.type === 'text' && typeof d !== 'string') {
      errors.push(`${p}.recommended_default harus string untuk text`);
    }
  });
  return errors;
}

/** Peringatan bila istilah internal muncul di teks untuk user (dari `jargonWarnings` rujukan). */
export function jargonWarnings(questions: Question[]): string[] {
  return questions
    .filter((q) => /profil [ab]|stack profile/i.test(`${q.question} ${q.options.join(' ')}`))
    .map((q) => `${q.id}: istilah internal muncul di teks untuk user`);
}
