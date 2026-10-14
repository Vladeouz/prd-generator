import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { extractJson } from '../../../src/stages/parse.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import {
  type Finding,
  type Stage5Output,
  validateStage5,
} from '../../../src/stages/stage-5/validate.ts';

/** Output nyata tahap 5 (review draft gym yang diberi empat kesalahan). */
const gym = () => extractJson(loadClaudeFixture('stage5').result) as Stage5Output;

function broken(change: (output: Stage5Output, first: Finding) => void) {
  const output = structuredClone(gym());
  change(output, output.findings[0] as Finding);
  return validateStage5(output).errors;
}

describe('validateStage5', () => {
  it('menerima output nyata tanpa error dan tanpa peringatan', () => {
    expect(validateStage5(gym())).toEqual({ errors: [], warnings: [] });
  });

  it('temuan tanpa bukti ditolak', () => {
    expect(
      broken((_, f) => {
        f.evidence = '  ';
      }),
    ).toEqual(['findings[0].evidence kosong']);
  });

  it('kategori di luar daftar yang diizinkan ditolak', () => {
    expect(
      broken((_, f) => {
        (f as { category: string }).category = 'performance';
      }),
    ).toEqual(['findings[0].category tidak dikenal: performance']);
  });

  it('jumlah opsi harus 2–3', () => {
    expect(
      broken((_, f) => {
        f.options = f.options.slice(0, 1);
        f.recommended_option = f.options[0]?.label as string;
      }),
    ).toEqual(['findings[0].options harus 2-3']);
    expect(
      broken((_, f) => {
        f.options = [
          ...f.options,
          { label: 'C', consequence: 'c' },
          { label: 'D', consequence: 'd' },
        ];
      }),
    ).toEqual(['findings[0].options harus 2-3']);
  });

  it('rekomendasi harus sama persis dengan salah satu label opsi', () => {
    expect(
      broken((_, f) => {
        f.recommended_option = `${f.recommended_option}.`;
      }),
    ).toEqual(['findings[0].recommended_option tidak sama dengan label opsi']);
  });

  it('id temuan harus RV-xx dan unik; label opsi unik dengan konsekuensi', () => {
    expect(
      broken((_, f) => {
        f.id = 'R1';
      }),
    ).toEqual(['findings[0].id harus berbentuk RV-01: R1']);
    expect(
      broken((o) => {
        (o.findings[1] as Finding).id = 'RV-01';
      }),
    ).toEqual(['findings[1].id RV-01 dipakai lebih dari sekali']);
    expect(
      broken((_, f) => {
        (f.options[1] as Finding['options'][number]).label = f.options[0]?.label as string;
      }),
    ).toEqual(['findings[0].options punya label ganda']);
    expect(
      broken((_, f) => {
        (f.options[0] as Finding['options'][number]).consequence = '';
      }),
    ).toEqual(['findings[0].options[0].consequence kosong']);
  });

  it('ready, passed_checks, dan severity diperiksa', () => {
    expect(
      broken((o) => {
        o.ready = true;
      }),
    ).toEqual(['ready true padahal ada temuan severity high']);
    expect(
      broken((o) => {
        (o as { passed_checks: string[] }).passed_checks = ['ux'];
      }),
    ).toEqual(['passed_checks tidak dikenal: ux']);
    expect(
      broken((_, f) => {
        (f as { severity: string }).severity = 'kritis';
      }),
    ).toEqual(['findings[0].severity tidak valid']);
    expect(validateStage5({} as Stage5Output).errors).toEqual(['findings bukan array']);
  });

  it('tanpa temuan dan ready true diterima', () => {
    expect(validateStage5({ findings: [], passed_checks: ['security'], ready: true })).toEqual({
      errors: [],
      warnings: [],
    });
  });
});

describe('prompts/stage-5.md', () => {
  it('punya versi dan placeholder kategori, konteks, dan draft', () => {
    const prompt = loadPrompt('stage-5');
    expect(prompt.version).toBe('1');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual([
      'categories',
      'context',
      'draft',
    ]);
    expect(prompt.body).toContain(
      '"accepted_recommendations" adalah fitur rekomendasi yang SUDAH DIPILIH',
    );
  });
});
