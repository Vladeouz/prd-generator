import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors.ts';
import { retryPrompt, summarizeErrors } from '../../../src/stages/run-stage.ts';

describe('retryPrompt', () => {
  it('menambahkan daftar error ke prompt awal, maksimal 10', () => {
    const errors = Array.from({ length: 12 }, (_, i) => `error ${i + 1}`);
    const prompt = retryPrompt('PROMPT', errors);
    expect(
      prompt.startsWith('PROMPT\n\nPERHATIAN: output kamu sebelumnya tidak valid karena:\n'),
    ).toBe(true);
    expect(prompt).toContain('- error 10\n');
    expect(prompt).not.toContain('error 11');
    expect(prompt.endsWith('Perbaiki dan kirim ulang output lengkap sesuai format.')).toBe(true);
  });
});

describe('summarizeErrors', () => {
  it('menampilkan tiga error pertama dan jumlah sisanya', () => {
    expect(summarizeErrors(['a'])).toBe('a');
    expect(summarizeErrors(['a', 'b', 'c', 'd', 'e'])).toBe('a; b; c (+2 lainnya)');
  });
});

describe('AppError', () => {
  it('memetakan kode ke status HTTP dan format error PRD bagian 5', () => {
    const error = new AppError('VALIDATION_ERROR', 'Ide wajib diisi.', { idea: 'kosong' });
    expect(error.status).toBe(422);
    expect(error.toBody()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Ide wajib diisi.', details: { idea: 'kosong' } },
    });
    expect(new AppError('CONFLICT', 'x').toBody()).toEqual({
      error: { code: 'CONFLICT', message: 'x' },
    });
  });
});
