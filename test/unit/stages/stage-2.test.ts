import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { extractJson } from '../../../src/stages/parse.ts';
import { loadPrompt, renderPrompt } from '../../../src/stages/prompt.ts';
import {
  expectedQuestionCount,
  PRODUCT_TOPICS,
  type Stage2Output,
  validateStage2,
} from '../../../src/stages/stage-2/validate.ts';

const gym = () => extractJson(loadClaudeFixture('stage2').result) as Stage2Output;
const reportOutputs = (
  JSON.parse(readFileSync('docs/reference/validate-report-v2.json', 'utf8')) as {
    results: { data: Stage2Output }[];
  }
).results.map((result) => result.data);

/** Salinan output gym dengan satu perubahan. */
function broken(change: (output: Stage2Output) => void): Stage2Output {
  const output = structuredClone(gym());
  change(output);
  return output;
}

describe('validateStage2: output nyata diterima', () => {
  it('fixture gym (tahap 2 uji end-to-end)', () => {
    expect(validateStage2(gym()).errors).toEqual([]);
  });

  it.each(reportOutputs.map((output, i) => [i, output] as const))(
    'validate-report-v2.json hasil #%i',
    (_i, output) => {
      expect(validateStage2(output).errors).toEqual([]);
    },
  );
});

describe('validateStage2: contoh rusak ditolak', () => {
  it('jumlah pertanyaan tidak sesuai clarity', () => {
    const output = broken((o) => {
      o.clarity = 4; // harus 2 pertanyaan, fixture punya 4
    });
    expect(validateStage2(output).errors).toContain('clarity 4 harus 2 pertanyaan, didapat 4');
  });

  it('default single tidak sama persis dengan opsi', () => {
    const output = broken((o) => {
      const q = o.questions[0] as Stage2Output['questions'][number];
      q.recommended_default = `${q.recommended_default as string} `;
    });
    expect(validateStage2(output).errors).toContain(
      'questions[0].recommended_default tidak sama dengan opsi mana pun',
    );
  });

  it('default multi di luar opsi atau lebih dari 3', () => {
    const outside = broken((o) => {
      (o.questions[3] as Stage2Output['questions'][number]).recommended_default = ['Fitur rahasia'];
    });
    expect(validateStage2(outside).errors).toContain(
      'questions[3].recommended_default berisi nilai di luar opsi: Fitur rahasia',
    );
    const tooMany = broken((o) => {
      const q = o.questions[3] as Stage2Output['questions'][number];
      q.recommended_default = q.options.slice(0, 4);
    });
    expect(validateStage2(tooMany).errors).toContain(
      'questions[3].recommended_default berisi 4, harus 1-3',
    );
  });

  it('default multi berupa string, bukan array', () => {
    const output = broken((o) => {
      const q = o.questions[3] as Stage2Output['questions'][number];
      q.recommended_default = q.options[0] as string;
    });
    expect(validateStage2(output).errors).toContain(
      'questions[3].recommended_default harus array untuk multi',
    );
  });

  it.each(['platform', 'notifikasi', 'login'])('topik teknis "%s" ditolak', (topic) => {
    const output = broken((o) => {
      (o.questions[2] as Stage2Output['questions'][number]).topic = topic;
    });
    expect(validateStage2(output).errors).toContain(`questions[2].topic tidak dikenal: ${topic}`);
  });

  it('topik atau id dipakai dua kali', () => {
    const output = broken((o) => {
      const [first, second] = o.questions as [
        Stage2Output['questions'][number],
        Stage2Output['questions'][number],
      ];
      second.topic = first.topic;
      second.id = first.id;
    });
    const { errors } = validateStage2(output);
    expect(errors).toContain('questions[1].topic "masalah" dipakai lebih dari sekali');
    expect(errors).toContain('questions[1].id "q1" dipakai lebih dari sekali');
  });

  it.each([0, 6, 2.5, '3'])('clarity %j tidak valid', (clarity) => {
    const output = broken((o) => {
      o.clarity = clarity as number;
    });
    expect(validateStage2(output).errors[0]).toMatch(/^clarity tidak valid/);
  });

  it('opsi kurang dari 2 dan deferred_technical bukan array', () => {
    const output = broken((o) => {
      (o.questions[0] as Stage2Output['questions'][number]).options = ['satu'];
      (o as unknown as Record<string, unknown>).deferred_technical = 'web';
    });
    const { errors } = validateStage2(output);
    expect(errors).toContain('questions[0].options berisi 1, harus 2-6');
    expect(errors).toContain('deferred_technical bukan array string');
  });

  it('type text dengan default bukan string', () => {
    const output = broken((o) => {
      const q = o.questions[2] as Stage2Output['questions'][number];
      q.type = 'text';
      q.options = [];
      q.recommended_default = ['x'];
    });
    expect(validateStage2(output).errors).toContain(
      'questions[2].recommended_default harus string untuk text',
    );
  });

  it('topik teknis di teks pertanyaan menjadi peringatan, bukan error', () => {
    const output = broken((o) => {
      (o.questions[0] as Stage2Output['questions'][number]).question = 'Perlu login lewat email?';
    });
    const { errors, warnings } = validateStage2(output);
    expect(errors).toEqual([]);
    expect(warnings).toContain('q1: kemungkinan topik teknis (email, login)');
  });
});

describe('expectedQuestionCount', () => {
  it('clarity 1 → 5, 2 → 4, 3 → 3, 4 dan 5 → 2', () => {
    expect([1, 2, 3, 4, 5].map(expectedQuestionCount)).toEqual([5, 4, 3, 2, 2]);
  });
});

describe('prompts/stage-2.md', () => {
  const prompt = loadPrompt('stage-2');
  const text = renderPrompt(prompt, {
    topics: PRODUCT_TOPICS.join(', '),
    idea: 'Catatan keuangan pribadi.',
  });

  it('berversi dan semua placeholder terisi', () => {
    expect(prompt.version).toBe('1');
    expect(text).not.toMatch(/\{\{\w+\}\}/);
    expect(text).toContain('"""Catatan keuangan pribadi."""');
    expect(text).toContain('masalah, pengguna, aksi_pertama, fitur_wajib, pembeda');
  });

  it('perbaikan FR-03: tanpa aturan koma, nada "kamu", istilah internal dilarang', () => {
    expect(text).not.toMatch(/koma/i);
    expect(text).toContain('sapa user dengan "kamu"');
    expect(text).toContain('Jangan menyebut istilah internal seperti "Profil A"');
  });

  it('melarang tool dan meminta JSON murni (PRD bagian 3)', () => {
    expect(text).toContain('JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.');
    expect(text).toContain('Balas HANYA dengan satu objek JSON valid');
  });
});
