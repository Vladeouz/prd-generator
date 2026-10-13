// Kontrak output tahap 3 (FR-04), diturunkan dari `validate` di
// docs/reference/validate-claude-p-stage3-v2.mjs dan `validateStage3` di docs/reference/e2e-gym.mjs.
// Perbedaan dari rujukan:
// - istilah internal ("Profil A", "Profil B", "stack profile") di teks untuk user adalah error;
// - setiap pertanyaan wajib punya `default_policy_key` dari tabel kebijakan untuk topiknya, dan
//   teks default tidak boleh memuat pola terlarang kunci itu (policy.ts);
// - `mobile_masa_depan` kondisional: SEO penting → cukup website, dan cukup website → Profil B;
// - risiko SEO untuk Profil A dan ketegangan `ikut_jawaban_produk` wajib ada di `detected_risks`.
import { type Question, validateQuestions } from '../questions.ts';
import type { StageValidation } from '../run-stage.ts';
import { forbiddenHits, policyKeysFor, policyRule, TECH_TOPICS } from './policy.ts';

export const AFFECTS = ['profil', 'arsitektur', 'skema', 'deployment'] as const;

export type TechQuestion = Question & {
  default_policy_key: string;
  default_reason: string;
  affects: string[];
};

export type ProfileRecommendation = {
  profile: 'A' | 'B';
  status: 'supported' | 'not_yet_supported';
  reason: string;
  depends_on_questions: string[];
  fallback_if_unsupported: string;
};

export type Stage3Output = {
  questions: TechQuestion[];
  profile_recommendation: ProfileRecommendation;
  detected_risks: string[];
  assumptions: string[];
};

/** Nama teknologi yang sudah ditentukan stack: menanyakannya hanya menghasilkan peringatan. */
const STACK_KEYWORDS = [
  'flutter',
  'next.js',
  'nextjs',
  'react',
  'hono',
  'postgres',
  'mysql',
  'mongodb',
  'sqlite',
  'firebase',
  'supabase',
  'vercel',
  'framework',
  'bahasa pemrograman',
  'database apa',
];

const INTERNAL_TERMS = /profil\s+[ab]\b|stack profile/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const asText = (value: unknown) =>
  Array.isArray(value) ? value.map(String).join(' | ') : String(value ?? '');

/** Error untuk setiap teks yang dibaca user dan menyebut istilah internal. */
function internalTermErrors(o: Record<string, unknown>): string[] {
  const texts: [string, unknown][] = [];
  if (Array.isArray(o.questions)) {
    o.questions.forEach((q: unknown, i) => {
      if (!isRecord(q)) return;
      for (const key of ['question', 'options', 'recommended_default', 'default_reason']) {
        texts.push([`questions[${i}].${key}`, q[key]]);
      }
      texts.push([`questions[${i}].why_it_matters`, q.why_it_matters]);
    });
  }
  const pr = o.profile_recommendation;
  if (isRecord(pr)) {
    texts.push(['profile_recommendation.reason', pr.reason]);
    texts.push(['profile_recommendation.fallback_if_unsupported', pr.fallback_if_unsupported]);
  }
  for (const key of ['detected_risks', 'assumptions']) {
    if (Array.isArray(o[key])) {
      (o[key] as unknown[]).forEach((item, i) => {
        texts.push([`${key}[${i}]`, item]);
      });
    }
  }
  return texts
    .filter(([, value]) => INTERNAL_TERMS.test(asText(value)))
    .map(
      ([path]) =>
        `${path} menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")`,
    );
}

export function validateStage3(output: Stage3Output): StageValidation {
  const o = output as unknown as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  errors.push(...validateQuestions(o.questions, { topics: TECH_TOPICS, allowText: false }));
  const questions = (Array.isArray(o.questions) ? o.questions : []).filter(isRecord);
  if (Array.isArray(o.questions) && (o.questions.length < 2 || o.questions.length > 5)) {
    errors.push(`jumlah pertanyaan ${o.questions.length}, harus 2-5`);
  }

  const riskList = isStringArray(o.detected_risks) ? o.detected_risks : null;
  if (!riskList) errors.push('detected_risks bukan array string');
  if (!isStringArray(o.assumptions)) errors.push('assumptions bukan array string');
  const risksText = (riskList ?? []).join(' ').toLowerCase();

  const keyByTopic = new Map<unknown, string>();
  questions.forEach((q, i) => {
    const p = `questions[${i}]`;
    if (typeof q.default_reason !== 'string' || !q.default_reason.trim()) {
      errors.push(`${p}.default_reason kosong/bukan string`);
    }
    if (!isStringArray(q.affects) || q.affects.length === 0) {
      errors.push(`${p}.affects kosong/bukan array`);
    } else {
      const unknown = q.affects.filter((a) => !(AFFECTS as readonly string[]).includes(a));
      if (unknown.length) errors.push(`${p}.affects tidak dikenal: ${unknown.join(', ')}`);
    }

    const key = q.default_policy_key;
    const allowed = policyKeysFor(String(q.topic));
    if (typeof key !== 'string' || !key) {
      errors.push(`${p}.default_policy_key kosong/bukan string`);
      return;
    }
    if (!allowed.includes(key)) {
      errors.push(
        allowed.length
          ? `${p}.default_policy_key "${key}" bukan kunci kebijakan untuk topik ${String(q.topic)} (${allowed.join(', ')})`
          : `${p}.default_policy_key "${key}" tidak bisa diperiksa karena topiknya tidak dikenal`,
      );
      return;
    }
    keyByTopic.set(q.topic, key);
    const hits = forbiddenHits(key, asText(q.recommended_default));
    if (hits.length) {
      errors.push(`${p}.recommended_default melanggar kebijakan ${key} (${hits.join(', ')})`);
    }
    if (policyRule(key)?.needsRisk && riskList && riskList.length === 0) {
      errors.push(`${p}.default_policy_key ${key} wajib disertai ketegangannya di detected_risks`);
    }
  });

  const pr = o.profile_recommendation;
  if (!isRecord(pr)) {
    errors.push('profile_recommendation tidak ada');
  } else {
    if (pr.profile !== 'A' && pr.profile !== 'B') {
      errors.push(`profile tidak valid: ${String(pr.profile)}`);
    }
    if (pr.status !== 'supported' && pr.status !== 'not_yet_supported') {
      errors.push(`status tidak valid: ${String(pr.status)}`);
    }
    if (pr.profile === 'A' && pr.status !== 'supported') {
      errors.push('Profil A harus berstatus supported');
    }
    if (pr.profile === 'B' && pr.status !== 'not_yet_supported') {
      errors.push('Profil B harus berstatus not_yet_supported');
    }
    if (pr.profile === 'B' && !String(pr.fallback_if_unsupported ?? '').trim()) {
      errors.push('Profil B wajib punya fallback_if_unsupported');
    }
    if (typeof pr.reason !== 'string' || !pr.reason.trim()) {
      errors.push('profile_recommendation.reason kosong');
    }
    if (!isStringArray(pr.depends_on_questions)) {
      errors.push('depends_on_questions bukan array string');
    } else {
      const ids = new Set(questions.map((q) => q.id));
      const missing = pr.depends_on_questions.filter((id) => !ids.has(id));
      if (missing.length) {
        errors.push(`depends_on_questions merujuk id yang tidak ada: ${missing.join(', ')}`);
      }
    }

    const seoImportant = keyByTopic.get('seo') === 'seo.penting';
    const mobileKey = keyByTopic.get('mobile_masa_depan');
    if (seoImportant && mobileKey && mobileKey !== 'mobile_masa_depan.cukup_website') {
      errors.push(
        `default mobile_masa_depan harus mobile_masa_depan.cukup_website karena SEO penting, didapat ${mobileKey}`,
      );
    }
    if (mobileKey === 'mobile_masa_depan.cukup_website' && pr.profile !== 'B') {
      errors.push('default mobile_masa_depan.cukup_website (web-only, SEO inti) harus Profil B');
    }
    if (pr.profile === 'A' && seoImportant && !risksText.includes('seo')) {
      errors.push('Profil A dengan SEO penting wajib menyebut risiko SEO di detected_risks');
    }
  }

  errors.push(...internalTermErrors(o));

  if (errors.length === 0) {
    for (const q of output.questions) {
      const text = `${q.question} ${q.options.join(' ')}`.toLowerCase();
      const stack = STACK_KEYWORDS.filter((keyword) => text.includes(keyword));
      if (stack.length) {
        warnings.push(`${q.id}: menanyakan hal yang sudah ditentukan stack (${stack.join(', ')})`);
      }
    }
  }
  return { errors, warnings };
}
