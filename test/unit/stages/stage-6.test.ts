import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { composePrd, type PrdAppendix } from '../../../src/projects/compose-prd.ts';
import { extractMarkdown } from '../../../src/stages/parse.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import { prdInfo, validatePrd } from '../../../src/stages/stage-6/validate.ts';

/** PRD nyata gym tanpa bagian 8 (fixture turunan). */
const prd = () => extractMarkdown(loadClaudeFixture('derived/stage6-gym').result);
/** PRD nyata gym apa adanya, dengan bagian 8 buatan AI. */
const original = () => extractMarkdown(loadClaudeFixture('stage6').result);

const errorsOf = (md: string) => validatePrd(md).errors;

describe('validatePrd', () => {
  it('menerima PRD nyata tanpa bagian 8', () => {
    expect(validatePrd(prd())).toEqual({ errors: [], warnings: [] });
    const info = prdInfo(prd());
    expect(info.frIds).toHaveLength(17);
    expect(info.endpoints.length).toBeGreaterThanOrEqual(3);
  });

  it('menolak PRD nyata yang masih memuat bagian 8 buatan AI', () => {
    expect(errorsOf(original())).toEqual([
      'bagian 8 ditulis oleh aplikasi; jangan tulis "## 8. Assumptions & Decisions"',
      'Open Questions ditulis oleh aplikasi; jangan tulis "### Open Questions"',
    ]);
  });

  it('heading harus persis dan urut', () => {
    expect(errorsOf(prd().replace('## 5. API Contract', '## 5. API'))).toContain(
      'heading hilang: ## 5. API Contract',
    );
    expect(errorsOf(prd().replace('### Non-goals', '### Non-goals:'))).toContain(
      'heading hilang: ### Non-goals',
    );
    const swapped = prd()
      .replace('## 3. Tech Constraints', '## X')
      .replace('## 4. Data Model', '## 3. Tech Constraints')
      .replace('## X', '## 4. Data Model');
    expect(errorsOf(swapped)).toContain('heading tidak urut: ## 4. Data Model');
    expect(errorsOf(`Berikut PRD-nya:\n${prd()}`)).toContain(
      'PRD harus dimulai dengan "# <Nama Produk>"',
    );
  });

  it('tepat satu erDiagram', () => {
    expect(errorsOf(prd().replace('```mermaid\nerDiagram', '```text\nerDiagram'))).toContain(
      'tidak ada blok mermaid erDiagram',
    );
    const twice = prd().replace(
      '## 5. API Contract',
      '```mermaid\nerDiagram\n  A ||--o{ B : has\n```\n\n## 5. API Contract',
    );
    expect(errorsOf(twice)).toContain('2 blok mermaid erDiagram (harus tepat satu)');
    const flow = prd().replace(
      '## 5. API Contract',
      '```mermaid\nflowchart LR\n  A --> B\n```\n\n## 5. API Contract',
    );
    expect(validatePrd(flow)).toEqual({
      errors: [],
      warnings: ['1 blok mermaid selain erDiagram'],
    });
  });

  it('minimal 3 endpoint METHOD /path di API Contract', () => {
    const api =
      prd().split('## 5. API Contract')[1]?.split('## 6. Functional Requirements')[0] ?? '';
    const stripped = prd().replace(api, '\n\nBelum ada endpoint. GET /satu\n\n');
    expect(errorsOf(stripped)).toContain('endpoint di API Contract hanya 1');
  });

  it('setiap FR-xx punya checklist acceptance criteria, dan NFR-xx ada', () => {
    const fr = prd().split('### FR-02')[0]?.split('### FR-01')[1] ?? '';
    expect(errorsOf(prd().replace(fr, fr.replaceAll('- [ ]', '-')))).toEqual([
      'FR-01 tanpa checklist acceptance criteria',
    ]);
    expect(errorsOf(prd().replaceAll(/NFR-(\d\d)/g, 'N$1'))).toEqual([
      'tidak ada NFR-xx di Non-Functional Requirements',
    ]);
  });
});

describe('extractMarkdown', () => {
  it('membuang blok kode pembungkus dan teks sebelum heading pertama', () => {
    expect(extractMarkdown('```markdown\n# Judul\n\nIsi\n```')).toBe('# Judul\n\nIsi');
    expect(extractMarkdown('Berikut PRD:\n# Judul\n')).toBe('# Judul');
    expect(() => extractMarkdown('tanpa heading')).toThrow('tidak ada heading markdown');
  });
});

const appendix = (patch: Partial<PrdAppendix> = {}): PrdAppendix => ({
  decisions: [],
  assumptions: [],
  guesses: [],
  openQuestions: [],
  ...patch,
});

describe('composePrd', () => {
  it('bagian 1–7 apa adanya, lalu bagian 8 dengan Keputusan, Asumsi, dan Open Questions', () => {
    const md = composePrd(
      '# Produk\n\n## 1. Context & Goal\n\nIsi.\n\n',
      appendix({
        decisions: [
          {
            code: 'RV-08',
            category: 'consistency',
            finding: 'Hak staf mengubah tanggal berakhir belum jelas.',
            chosenOption: 'Anggap isi fitur sebagai default',
            consequence: 'Untuk ubah tanggal manual, sementara hanya pemilik yang boleh.',
          },
        ],
        assumptions: ['Satu gym saja.'],
        guesses: [
          { topic: 'masalah', question: 'Apa masalah utamanya?', value: 'Susah memantau member' },
        ],
        openQuestions: ['Berapa hari sebelum habis admin diingatkan?'],
      }),
    );
    expect(md).toBe(
      [
        '# Produk',
        '',
        '## 1. Context & Goal',
        '',
        'Isi.',
        '',
        '## 8. Assumptions & Decisions',
        '',
        'Bagian ini disusun aplikasi dari keputusan dan jawaban yang tersimpan, bukan ditulis AI.',
        '',
        '### Keputusan',
        '',
        '- **RV-08** (consistency): Hak staf mengubah tanggal berakhir belum jelas.',
        '  - Diputuskan: Anggap isi fitur sebagai default',
        '  - Konsekuensi: Untuk ubah tanggal manual, sementara hanya pemilik yang boleh.',
        '',
        '### Asumsi',
        '',
        '- Satu gym saja.',
        '',
        '### Open Questions',
        '',
        '- **Tebakan (masalah):** Apa masalah utamanya? Jawaban yang dipakai: Susah memantau member.',
        '- Berapa hari sebelum habis admin diingatkan?',
        '',
      ].join('\n'),
    );
  });

  it('daftar kosong ditulis "Tidak ada.", dan jawaban multi digabung', () => {
    const md = composePrd(
      '# P',
      appendix({ guesses: [{ topic: 'pengguna', question: 'Siapa?', value: ['Admin', 'Staf'] }] }),
    );
    expect(md).toContain('### Keputusan\n\n- Tidak ada.\n');
    expect(md).toContain('### Asumsi\n\n- Tidak ada.\n');
    expect(md).toContain('Jawaban yang dipakai: Admin, Staf.');
  });

  it('PRD lengkap dari fixture lolos validasi bagian 1–7 kecuali larangan bagian 8', () => {
    const errors = validatePrd(composePrd(prd(), appendix())).errors;
    expect(errors).toEqual([
      'bagian 8 ditulis oleh aplikasi; jangan tulis "## 8. Assumptions & Decisions"',
      'Open Questions ditulis oleh aplikasi; jangan tulis "### Open Questions"',
    ]);
  });
});

describe('prompts/stage-6.md', () => {
  it('punya versi, placeholder, dan hanya meminta bagian 1–7', () => {
    const prompt = loadPrompt('stage-6');
    expect(prompt.version).toBe('1');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual([
      'decisions',
      'conventions',
      'context',
      'draft',
    ]);
    expect(prompt.body).toContain('## 7. Non-Functional Requirements\n\nJANGAN menulis bagian 8');
    expect(prompt.body).not.toMatch(/^## 8\./m);
  });
});
