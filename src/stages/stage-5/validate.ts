// Kontrak output tahap 5 (FR-06), diturunkan dari `validateStage5` di docs/reference/e2e-gym.mjs.
// Tambahan dari rujukan:
// - `finding` wajib diisi dan `id` berbentuk `RV-xx` yang unik, karena dipakai sebagai kode
//   keputusan (`decisions.code` unik per proyek);
// - label opsi unik dan setiap opsi punya konsekuensi;
// - `passed_checks` berisi kategori yang dikenal, dan `ready` tidak boleh true bila ada temuan high;
// - istilah internal ("Profil A", "Profil B", "stack profile") hanya peringatan.
import type { StageValidation } from '../run-stage.ts';

export const REVIEW_CATEGORIES = [
  'stack_deploy',
  'dependency_order',
  'security',
  'consistency',
  'scope_creep',
  'testability',
] as const;

export const SEVERITIES = ['high', 'medium', 'low'] as const;

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];
export type Severity = (typeof SEVERITIES)[number];

export type ReviewOption = { label: string; consequence: string };

export type Finding = {
  id: string;
  category: ReviewCategory;
  severity: Severity;
  finding: string;
  evidence: string;
  options: ReviewOption[];
  recommended_option: string;
};

export type Stage5Output = {
  findings: Finding[];
  passed_checks: ReviewCategory[];
  ready: boolean;
};

const INTERNAL_TERMS = /profil\s+[ab]\b|stack profile/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown) => typeof value === 'string' && value.trim() !== '';

export function validateStage5(output: Stage5Output): StageValidation {
  const o = output as unknown as Record<string, unknown>;
  if (!Array.isArray(o.findings)) return { errors: ['findings bukan array'], warnings: [] };
  const errors: string[] = [];
  const ids = new Set<unknown>();

  o.findings.forEach((f: unknown, i) => {
    const p = `findings[${i}]`;
    if (!isRecord(f)) {
      errors.push(`${p} bukan objek`);
      return;
    }
    if (typeof f.id !== 'string' || !/^RV-\d{2}$/.test(f.id)) {
      errors.push(`${p}.id harus berbentuk RV-01: ${String(f.id)}`);
    } else if (ids.has(f.id)) {
      errors.push(`${p}.id ${f.id} dipakai lebih dari sekali`);
    }
    ids.add(f.id);
    if (!(REVIEW_CATEGORIES as readonly unknown[]).includes(f.category)) {
      errors.push(`${p}.category tidak dikenal: ${String(f.category)}`);
    }
    if (!(SEVERITIES as readonly unknown[]).includes(f.severity)) {
      errors.push(`${p}.severity tidak valid`);
    }
    if (!isText(f.finding)) errors.push(`${p}.finding kosong`);
    if (!isText(f.evidence)) errors.push(`${p}.evidence kosong`);
    const options = (Array.isArray(f.options) ? f.options : []).filter(isRecord);
    const labels = options.map((x) => x.label);
    if (!Array.isArray(f.options) || labels.length < 2 || labels.length > 3) {
      errors.push(`${p}.options harus 2-3`);
    }
    if (new Set(labels).size !== labels.length) errors.push(`${p}.options punya label ganda`);
    options.forEach((x, j) => {
      if (!isText(x.label)) errors.push(`${p}.options[${j}].label kosong`);
      if (!isText(x.consequence)) errors.push(`${p}.options[${j}].consequence kosong`);
    });
    if (!labels.includes(f.recommended_option)) {
      errors.push(`${p}.recommended_option tidak sama dengan label opsi`);
    }
  });

  if (!Array.isArray(o.passed_checks)) {
    errors.push('passed_checks bukan array');
  } else {
    const unknown = o.passed_checks.filter(
      (c) => !(REVIEW_CATEGORIES as readonly unknown[]).includes(c),
    );
    if (unknown.length) errors.push(`passed_checks tidak dikenal: ${unknown.join(', ')}`);
  }
  if (typeof o.ready !== 'boolean') errors.push('ready bukan boolean');
  if (o.ready === true && o.findings.some((f) => isRecord(f) && f.severity === 'high')) {
    errors.push('ready true padahal ada temuan severity high');
  }

  const warnings =
    errors.length === 0 && INTERNAL_TERMS.test(JSON.stringify(output.findings))
      ? ['temuan menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")']
      : [];
  return { errors, warnings };
}
