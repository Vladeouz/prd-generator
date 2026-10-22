// Kontrak output review kedua (FR-07). Tidak ada rujukan di docs/reference/ untuk review ini;
// bentuknya mengikuti tahap 5 (`validateReview`), dengan perbedaan:
// - kategori: data model, aturan bisnis tanpa constraint, dan rute UI tanpa endpoint pendukung;
// - id `RV2-xx`;
// - setiap opsi punya `changes_prd`: true bila memilihnya membuat PRD ditulis ulang; setiap temuan
//   wajib punya minimal satu opsi perbaikan dan satu opsi tanpa perubahan;
// - setiap celah dari `endpointGaps` (PRD yang direview) wajib menjadi temuan `ui_endpoint`;
// - `passed_checks` di luar kategori hanya peringatan (uji T-018: kalimat bebas memicu percobaan
//   ulang yang tidak perlu).
import { latestDocument } from '../../projects/documents.ts';
import type { StageContext, StageValidation } from '../run-stage.ts';
import type { ReviewOption, Severity } from '../stage-5/validate.ts';
import { validateReview } from '../stage-5/validate.ts';
import { type EndpointGap, endpointGaps, normalizePath } from './gaps.ts';

export const REVIEW2_CATEGORIES = ['data_model', 'business_rule', 'ui_endpoint'] as const;

export type Review2Category = (typeof REVIEW2_CATEGORIES)[number];
export type Review2Option = ReviewOption & { changes_prd: boolean };
export type Review2Finding = {
  id: string;
  category: Review2Category;
  severity: Severity;
  finding: string;
  evidence: string;
  options: Review2Option[];
  recommended_option: string;
};
export type Review2Output = {
  findings: Review2Finding[];
  passed_checks: Review2Category[];
  ready: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validasi tanpa database: struktur dan celah yang sudah diketahui. */
export function validateReview2Output(output: Review2Output, gaps: EndpointGap[]): StageValidation {
  const { errors, warnings = [] } = validateReview(output, {
    categories: REVIEW2_CATEGORIES,
    idPrefix: 'RV2',
    unknownPassedChecks: 'warning',
  });
  const findings = (Array.isArray(output?.findings) ? output.findings : []).filter(isRecord);
  findings.forEach((f, i) => {
    const options = (Array.isArray(f.options) ? f.options : []).filter(isRecord);
    options.forEach((o, j) => {
      if (typeof o.changes_prd !== 'boolean') {
        errors.push(`findings[${i}].options[${j}].changes_prd bukan boolean`);
      }
    });
    if (!options.some((o) => o.changes_prd === true)) {
      errors.push(`findings[${i}] tidak punya opsi perbaikan (changes_prd true)`);
    }
    if (!options.some((o) => o.changes_prd === false)) {
      errors.push(`findings[${i}] tidak punya opsi tanpa perubahan (changes_prd false)`);
    }
  });
  for (const gap of gaps) {
    const covered = findings.some(
      (f) =>
        f.category === 'ui_endpoint' &&
        normalizePath(`${String(f.finding)} ${String(f.evidence)}`).includes(gap.resource),
    );
    if (!covered) {
      errors.push(
        `celah ${gap.missing} untuk rute ${gap.route} tidak dijadikan temuan ui_endpoint`,
      );
    }
  }
  return { errors, warnings };
}

export function validateReview2(output: Review2Output, { db, projectId }: StageContext) {
  const prd = latestDocument(db, projectId, 'prd');
  return validateReview2Output(output, prd ? endpointGaps(prd.content) : []);
}
