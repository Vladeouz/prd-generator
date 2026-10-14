import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { extractJson } from '../../../src/stages/parse.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import { buildFeatureDraft, notChosenNonGoal } from '../../../src/stages/stage-4/features.ts';
import { type Stage4Output, validateStage4 } from '../../../src/stages/stage-4/validate.ts';

/** Output nyata tahap 4 (ide gym). */
const gym = () => extractJson(loadClaudeFixture('stage4').result) as Stage4Output;

function broken(change: (output: Stage4Output) => void) {
  const output = structuredClone(gym());
  change(output);
  return validateStage4(output).errors;
}
const phase = (output: Stage4Output, number: number) => {
  const found = output.phases.find((p) => p.phase === number);
  if (!found) throw new Error(`fase ${number} tidak ada`);
  return found;
};

describe('validateStage4', () => {
  it('menerima output nyata tanpa error dan tanpa peringatan', () => {
    expect(validateStage4(gym())).toEqual({ errors: [], warnings: [] });
  });

  it('fitur MVP di dua fase atau tidak di fase mana pun ditolak', () => {
    expect(broken((o) => phase(o, 1).feature_ids.push('F-05'))).toContain(
      'F-05 ada di lebih dari satu fase',
    );
    expect(
      broken((o) => {
        phase(o, 1).feature_ids = [];
      }),
    ).toContain('F-04 tidak ada di fase mana pun');
  });

  it('dependensi yang mengarah ke fase lebih lambat ditolak', () => {
    const errors = broken((o) => {
      phase(o, 0).feature_ids = ['F-01', 'F-02'];
      phase(o, 3).feature_ids.push('F-03');
    });
    expect(errors).toContain('F-04 (fase 1) bergantung pada F-03 (fase 3) yang lebih lambat');
  });

  it('draft dengan kesalahan injectFlaws (login di fase terakhir) ditolak', () => {
    const { draft } = JSON.parse(
      readFileSync('docs/reference/e2e-output/stage-4-with-flaws.json', 'utf8'),
    ) as { draft: Stage4Output };
    expect(validateStage4(draft).errors).toContain(
      'F-02 (fase 0) bergantung pada F-01 (fase 3) yang lebih lambat',
    );
  });

  it('fitur rekomendasi di fase mana pun ditolak', () => {
    expect(broken((o) => phase(o, 2).feature_ids.push('R-01'))).toContain(
      'R-01 (rekomendasi) masuk fase',
    );
  });

  it('id ganda, id yang tidak ada, dan source yang tidak dikenal ditolak', () => {
    expect(
      broken((o) => {
        (o.mvp_features[1] as Stage4Output['mvp_features'][number]).id = 'F-01';
      }),
    ).toContain('id fitur tidak unik');
    expect(
      broken((o) => {
        (o.recommended_features[0] as Stage4Output['recommended_features'][number]).id = 'F-01';
      }),
    ).toContain('F-01 dipakai sebagai id fitur MVP sekaligus rekomendasi');
    expect(broken((o) => o.mvp_features[0]?.depends_on.push('F-77'))).toContain(
      'F-01.depends_on merujuk F-77 yang tidak ada',
    );
    expect(broken((o) => phase(o, 3).feature_ids.push('F-88'))).toContain(
      'phases[3] merujuk F-88 yang tidak ada',
    );
    expect(
      broken((o) => {
        (o.mvp_features[0] as { source: string }).source = 'rekomendasi';
      }),
    ).toContain('F-01.source tidak valid: rekomendasi');
  });

  it('bentuk yang salah ditolak: tanpa fase 0, daftar kosong, field bukan array', () => {
    expect(
      broken((o) => {
        o.phases = o.phases.filter((p) => p.phase !== 0);
        phase(o, 1).feature_ids.push('F-01', 'F-02', 'F-03');
      }),
    ).toContain('tidak ada fase 0');
    expect(
      broken((o) => {
        o.mvp_features = [];
      }),
    ).toContain('mvp_features kosong');
    expect(
      broken((o) => {
        o.non_goals = [];
      }),
    ).toContain('non_goals kosong');
    expect(
      broken((o) => {
        (o as unknown as Record<string, unknown>).recommended_features = null;
      }),
    ).toContain('recommended_features bukan array');
    expect(validateStage4({} as Stage4Output).errors.length).toBeGreaterThan(0);
  });

  it('istilah internal hanya peringatan', () => {
    const output = structuredClone(gym());
    output.technical_decisions.push('Memakai Profil A.');
    expect(validateStage4(output)).toEqual({
      errors: [],
      warnings: ['output menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")'],
    });
  });
});

describe('buildFeatureDraft', () => {
  it('hanya rekomendasi yang dicentang ikut; sisanya ditambahkan ke non-goals', () => {
    const output = gym();
    const draft = buildFeatureDraft(output, ['R-01', 'R-04']);
    expect(draft.accepted_recommendations.map((r) => r.id)).toEqual(['R-01', 'R-04']);
    const rejected = output.recommended_features.filter((r) => !['R-01', 'R-04'].includes(r.id));
    expect(draft.non_goals).toEqual([...output.non_goals, ...rejected.map(notChosenNonGoal)]);
    expect(draft.non_goals).toContain(
      'Laporan pendapatan dan tren perpanjangan (fitur rekomendasi yang tidak dipilih)',
    );
  });

  it('tanpa centang: semua rekomendasi menjadi non-goals', () => {
    const output = gym();
    const draft = buildFeatureDraft(output, []);
    expect(draft.accepted_recommendations).toEqual([]);
    expect(draft.non_goals).toHaveLength(
      output.non_goals.length + output.recommended_features.length,
    );
  });
});

describe('prompts/stage-4.md', () => {
  it('punya versi dan hanya satu placeholder konteks', () => {
    const prompt = loadPrompt('stage-4');
    expect(prompt.version).toBe('1');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual(['context']);
    expect(prompt.body).toContain('JANGAN tulis fitur rekomendasi di sini');
  });
});
