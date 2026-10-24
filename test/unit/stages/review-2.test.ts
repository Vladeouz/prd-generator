import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { extractJson } from '../../../src/stages/parse.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import { endpointGaps, formatGaps, normalizePath } from '../../../src/stages/review-2/gaps.ts';
import {
  type Review2Finding,
  type Review2Output,
  validateReview2Output,
} from '../../../src/stages/review-2/validate.ts';

const prd = (name: string) => loadClaudeFixture(name).result;
const review = () =>
  extractJson(loadClaudeFixture('synthetic/review2-daftar-belanja').result) as Review2Output;
const GAP = {
  route: '/items/{id}/edit',
  missing: 'GET /items/{id}',
  resource: '/items/{}',
};

describe('validateReview2Output: passed_checks (uji nyata T-018)', () => {
  it('kalimat bebas di passed_checks hanya peringatan; temuan valid tetap diterima', () => {
    const t018 = extractJson(
      loadClaudeFixture('verification/t018-review2-attempt1').result,
    ) as Review2Output;
    const prdV1 = readFileSync('test/fixtures/claude/verification/t018-prd-v1.md', 'utf8');
    const result = validateReview2Output(t018, endpointGaps(prdV1));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toMatch(
      /^passed_checks tidak dikenal: Autentikasi, format error, dan pagination sudah sesuai konvensi/,
    );
  });

  it('nilai tak dikenal tidak menggagalkan, nilai kategori tetap tanpa peringatan', () => {
    const output = structuredClone(review());
    output.passed_checks = ['kalimat bebas' as never];
    expect(validateReview2Output(output, [GAP])).toEqual({
      errors: [],
      warnings: ['passed_checks tidak dikenal: kalimat bebas'],
    });
    output.passed_checks = ['data_model'];
    expect(validateReview2Output(output, [GAP]).warnings).toEqual([]);
  });
});

function broken(change: (output: Review2Output, first: Review2Finding) => void) {
  const output = structuredClone(review());
  change(output, output.findings[0] as Review2Finding);
  return validateReview2Output(output, [GAP]).errors;
}

describe('endpointGaps', () => {
  it('rute form edit tanpa GET per item adalah celah (kasus daftar-belanja)', () => {
    expect(endpointGaps(prd('synthetic/prd-daftar-belanja'))).toEqual([GAP]);
    expect(formatGaps([GAP])).toBe(
      '- Rute UI /items/{id}/edit tidak punya endpoint pendukung GET /items/{id}.',
    );
  });

  it('tidak ada celah bila GET per item ada, juga dengan nama parameter atau awalan berbeda', () => {
    expect(endpointGaps(prd('synthetic/prd-daftar-belanja-fixed'))).toEqual([]);
    const md = (api: string) =>
      `# P\n\n## 5. API Contract\n\n${api}\n\n## 6. Functional Requirements\n\nLayar /items/:itemId/edit.\n`;
    expect(endpointGaps(md('- **GET /api/items/{id}** — satu item'))).toEqual([]);
    expect(endpointGaps(md('- GET /items?status=open'))).toEqual([
      { route: '/items/:itemId/edit', missing: 'GET /items/:itemId', resource: '/items/{}' },
    ]);
  });

  it('PRD gym (tanpa rute UI) tidak punya celah', () => {
    expect(endpointGaps(prd('derived/stage6-gym'))).toEqual([]);
    expect(formatGaps([])).toBe('- (tidak ada)');
  });

  it('normalizePath menyeragamkan parameter', () => {
    expect(normalizePath('/members/{memberId}/periods/:periodId/')).toBe('/members/{}/periods/{}');
  });
});

describe('validateReview2Output', () => {
  it('menerima fixture daftar-belanja', () => {
    expect(validateReview2Output(review(), [GAP])).toEqual({ errors: [], warnings: [] });
  });

  it('celah yang tidak dijadikan temuan ui_endpoint ditolak', () => {
    expect(
      broken((o) => {
        o.findings = o.findings.slice(1);
      }),
    ).toEqual([
      'celah GET /items/{id} untuk rute /items/{id}/edit tidak dijadikan temuan ui_endpoint',
    ]);
    expect(
      broken((_, f) => {
        f.category = 'data_model';
      }),
    ).toEqual([
      'celah GET /items/{id} untuk rute /items/{id}/edit tidak dijadikan temuan ui_endpoint',
    ]);
  });

  it('setiap temuan butuh opsi perbaikan dan opsi tanpa perubahan', () => {
    expect(
      broken((_, f) => {
        for (const o of f.options) o.changes_prd = true;
      }),
    ).toEqual(['findings[0] tidak punya opsi tanpa perubahan (changes_prd false)']);
    expect(
      broken((_, f) => {
        for (const o of f.options) o.changes_prd = false;
      }),
    ).toEqual(['findings[0] tidak punya opsi perbaikan (changes_prd true)']);
    expect(
      broken((_, f) => {
        delete (f.options[1] as { changes_prd?: boolean }).changes_prd;
      }),
    ).toEqual([
      'findings[0].options[1].changes_prd bukan boolean',
      'findings[0] tidak punya opsi tanpa perubahan (changes_prd false)',
    ]);
  });

  it('memakai aturan review: id RV2-xx, kategori review kedua, bukti, dan rekomendasi', () => {
    expect(
      broken((_, f) => {
        f.id = 'RV-01';
      }),
    ).toEqual(['findings[0].id harus berbentuk RV2-01: RV-01']);
    expect(
      broken((o) => {
        (o.findings[1] as Review2Finding).category = 'security' as Review2Finding['category'];
      }),
    ).toEqual(['findings[1].category tidak dikenal: security']);
    expect(
      broken((_, f) => {
        f.evidence = '';
        f.recommended_option = 'Lain';
      }),
    ).toEqual([
      'findings[0].evidence kosong',
      'findings[0].recommended_option tidak sama dengan label opsi',
    ]);
  });
});

describe('prompts/review-2.md', () => {
  it('punya versi dan placeholder celah, kategori, konvensi terpilih, dan PRD', () => {
    const prompt = loadPrompt('review-2');
    expect(prompt.version).toBe('4');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual([
      'gaps',
      'categories',
      'categories',
      'conventions',
      'prd',
    ]);
    expect(prompt.body).toContain('Jangan menulis kalimat atau penjelasan di "passed_checks"');
    expect(prompt.body).toContain('klaim peran atau identitas');
    // Body request dan nullability terhadap konvensi kontrak (T-037).
    expect(prompt.body).toContain(
      'aturan body request dan nullability di API Contract yang tidak bisa dikirim client',
    );
  });
});
