// Kontrak output tahap 4 (FR-05), diturunkan dari `validateStage4` di docs/reference/e2e-gym.mjs.
// Tambahan dari rujukan:
// - pemeriksaan tipe setiap field (rujukan menganggap bentuknya sudah benar);
// - id fitur rekomendasi unik dan tidak sama dengan id fitur MVP, karena dipakai sebagai
//   `feature_choices.feature_code`;
// - fase hanya boleh merujuk id fitur MVP yang ada;
// - istilah internal ("Profil A", "Profil B", "stack profile") hanya peringatan.
import type { StageValidation } from '../run-stage.ts';

export const FEATURE_SOURCES = ['user', 'fondasi'] as const;

export type MvpFeature = {
  id: string;
  name: string;
  description: string;
  source: (typeof FEATURE_SOURCES)[number];
  sub_features: string[];
  depends_on: string[];
};

export type RecommendedFeature = { id: string; name: string; reason: string };

export type Phase = { phase: number; name: string; goal: string; feature_ids: string[] };

export type Stage4Output = {
  product_name: string;
  mvp_features: MvpFeature[];
  recommended_features: RecommendedFeature[];
  non_goals: string[];
  phases: Phase[];
  technical_decisions: string[];
  open_questions: string[];
};

const INTERNAL_TERMS = /profil\s+[ab]\b|stack profile/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isText = (value: unknown) => typeof value === 'string' && value.trim() !== '';

export function validateStage4(output: Stage4Output): StageValidation {
  const o = output as unknown as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isText(o.product_name)) errors.push('product_name kosong');
  const features = (Array.isArray(o.mvp_features) ? o.mvp_features : []).filter(isRecord);
  if (!Array.isArray(o.mvp_features) || features.length === 0) errors.push('mvp_features kosong');
  if (!Array.isArray(o.recommended_features)) errors.push('recommended_features bukan array');
  const recommended = (Array.isArray(o.recommended_features) ? o.recommended_features : []).filter(
    isRecord,
  );
  if (!isStringArray(o.non_goals) || o.non_goals.length === 0) errors.push('non_goals kosong');
  if (!Array.isArray(o.phases) || o.phases.length === 0) errors.push('phases kosong');
  const phases = (Array.isArray(o.phases) ? o.phases : []).filter(isRecord);
  if (!isStringArray(o.technical_decisions)) errors.push('technical_decisions bukan array string');
  if (!isStringArray(o.open_questions)) errors.push('open_questions bukan array string');

  const ids = new Set(features.map((f) => f.id));
  if (ids.size !== features.length) errors.push('id fitur tidak unik');
  features.forEach((f, i) => {
    const p = typeof f.id === 'string' && f.id ? f.id : `mvp_features[${i}]`;
    if (!isText(f.id)) errors.push(`mvp_features[${i}].id kosong`);
    if (!isText(f.name)) errors.push(`${p}.name kosong`);
    if (!isText(f.description)) errors.push(`${p}.description kosong`);
    if (!(FEATURE_SOURCES as readonly unknown[]).includes(f.source)) {
      errors.push(`${p}.source tidak valid: ${String(f.source)}`);
    }
    if (!isStringArray(f.sub_features)) errors.push(`${p}.sub_features bukan array string`);
    if (!isStringArray(f.depends_on)) {
      errors.push(`${p}.depends_on bukan array string`);
      return;
    }
    for (const d of f.depends_on) {
      if (!ids.has(d)) errors.push(`${p}.depends_on merujuk ${d} yang tidak ada`);
    }
  });

  const recommendedIds = new Set(recommended.map((r) => r.id));
  if (recommendedIds.size !== recommended.length) errors.push('id fitur rekomendasi tidak unik');
  recommended.forEach((r, i) => {
    const p = typeof r.id === 'string' && r.id ? r.id : `recommended_features[${i}]`;
    if (!isText(r.id)) errors.push(`recommended_features[${i}].id kosong`);
    if (ids.has(r.id)) errors.push(`${p} dipakai sebagai id fitur MVP sekaligus rekomendasi`);
    if (!isText(r.name)) errors.push(`${p}.name kosong`);
    if (!isText(r.reason)) errors.push(`${p}.reason kosong`);
  });

  const phaseOf = new Map<unknown, number>();
  phases.forEach((phase, i) => {
    if (typeof phase.phase !== 'number') errors.push(`phases[${i}].phase bukan angka`);
    if (!isText(phase.name)) errors.push(`phases[${i}].name kosong`);
    if (!isStringArray(phase.feature_ids)) {
      errors.push(`phases[${i}].feature_ids bukan array string`);
      return;
    }
    for (const id of phase.feature_ids) {
      if (recommendedIds.has(id)) {
        errors.push(`${id} (rekomendasi) masuk fase`);
        continue;
      }
      if (!ids.has(id)) errors.push(`phases[${i}] merujuk ${id} yang tidak ada`);
      if (phaseOf.has(id)) errors.push(`${id} ada di lebih dari satu fase`);
      phaseOf.set(id, phase.phase as number);
    }
  });
  if (!phases.some((p) => p.phase === 0)) errors.push('tidak ada fase 0');

  for (const f of features) {
    const own = phaseOf.get(f.id);
    if (own === undefined) {
      errors.push(`${String(f.id)} tidak ada di fase mana pun`);
      continue;
    }
    for (const d of isStringArray(f.depends_on) ? f.depends_on : []) {
      const dep = phaseOf.get(d);
      if (dep !== undefined && dep > own) {
        errors.push(
          `${String(f.id)} (fase ${own}) bergantung pada ${d} (fase ${dep}) yang lebih lambat`,
        );
      }
    }
  }

  if (errors.length === 0 && INTERNAL_TERMS.test(JSON.stringify(output))) {
    warnings.push(
      'output menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")',
    );
  }
  return { errors, warnings };
}
