// Kontrak output tahap 2 (FR-03), diturunkan dari `validate` di
// docs/reference/validate-claude-p-v2.mjs.
import { jargonWarnings, type Question, validateQuestions } from '../questions.ts';
import type { StageValidation } from '../run-stage.ts';

export const PRODUCT_TOPICS = ['masalah', 'pengguna', 'aksi_pertama', 'fitur_wajib', 'pembeda'];
/** Fakta yang hanya diketahui user: jawaban default untuk topik ini disimpan sebagai tebakan. */
export const GUESS_TOPICS = ['masalah', 'pengguna'];

// Heuristik topik teknis di pertanyaan atau asumsi: menghasilkan peringatan, bukan error.
const TECH_KEYWORDS = [
  'android',
  'ios',
  'mobile',
  'native',
  'web responsif',
  'browser',
  'platform',
  'push notification',
  'notifikasi dikirim',
  'dikirim lewat',
  'email',
  'login',
  'server',
  'database',
  'deploy',
  'hosting',
  'framework',
];

export type Stage2Output = {
  clarity: number;
  clarity_reason: string;
  questions: Question[];
  assumptions: string[];
  deferred_technical: string[];
};

/** clarity 1 → 5 pertanyaan, 2 → 4, 3 → 3, 4 dan 5 → 2. */
export const expectedQuestionCount = (clarity: number) => Math.max(2, 6 - clarity);

const findTechKeywords = (text: string) =>
  TECH_KEYWORDS.filter((keyword) => text.toLowerCase().includes(keyword));

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

export function validateStage2(output: Stage2Output): StageValidation {
  const o = output as unknown as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  const clarity = o.clarity;
  const validClarity =
    Number.isInteger(clarity) && (clarity as number) >= 1 && (clarity as number) <= 5;
  if (!validClarity) errors.push(`clarity tidak valid: ${String(clarity)}`);
  if (typeof o.clarity_reason !== 'string' || !o.clarity_reason.trim()) {
    errors.push('clarity_reason kosong/bukan string');
  }

  errors.push(...validateQuestions(o.questions, { topics: PRODUCT_TOPICS, allowText: true }));
  if (Array.isArray(o.questions) && validClarity) {
    const expected = expectedQuestionCount(clarity as number);
    if (o.questions.length !== expected) {
      errors.push(`clarity ${clarity} harus ${expected} pertanyaan, didapat ${o.questions.length}`);
    }
  }

  if (!isStringArray(o.assumptions)) errors.push('assumptions bukan array string');
  if (!isStringArray(o.deferred_technical)) errors.push('deferred_technical bukan array string');

  if (errors.length === 0) {
    for (const q of output.questions) {
      const tech = findTechKeywords(`${q.question} ${q.options.join(' ')}`);
      if (tech.length) warnings.push(`${q.id}: kemungkinan topik teknis (${tech.join(', ')})`);
    }
    output.assumptions.forEach((assumption, i) => {
      const tech = findTechKeywords(assumption);
      if (tech.length) warnings.push(`assumptions[${i}]: asumsi teknis (${tech.join(', ')})`);
    });
    warnings.push(...jargonWarnings(output.questions));
  }
  return { errors, warnings };
}
