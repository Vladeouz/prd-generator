import { describe, expect, it } from 'vitest';
import { ClaudeRunError } from '../../../src/claude/types.ts';
import { AppError } from '../../../src/core/errors.ts';
import { handle } from '../../../src/core/http.ts';
import { StageFailedError } from '../../../src/stages/run-stage.ts';

// Next.js membundel instrumentation.ts terpisah dari route, sehingga antrean job melempar error dari
// salinan modul lain. Query string pada import memberi salinan modul terpisah di Vitest.
async function foreignCopies() {
  const errors = await import('../../../src/core/errors.ts?salinan-lain');
  const claude = await import('../../../src/claude/types.ts?salinan-lain');
  const stages = await import('../../../src/stages/run-stage.ts?salinan-lain');
  return {
    AppError: errors.AppError,
    ClaudeRunError: claude.ClaudeRunError,
    StageFailedError: stages.StageFailedError,
  };
}

describe('error dari salinan modul lain (bundle terpisah)', () => {
  it('salinan benar-benar kelas yang berbeda', async () => {
    const foreign = await foreignCopies();
    expect(foreign.AppError).not.toBe(AppError);
  });

  it('instanceof tetap mengenali AppError, ClaudeRunError, dan StageFailedError', async () => {
    const foreign = await foreignCopies();
    expect(new foreign.AppError('CONFLICT', 'x')).toBeInstanceOf(AppError);
    expect(new foreign.ClaudeRunError('TIMEOUT', 'x')).toBeInstanceOf(ClaudeRunError);
    expect(new foreign.StageFailedError('x')).toBeInstanceOf(StageFailedError);
    expect(new Error('x')).not.toBeInstanceOf(AppError);
    expect(new foreign.AppError('CONFLICT', 'x')).not.toBeInstanceOf(ClaudeRunError);
  });

  it('handle() mengembalikan 409, bukan 500, untuk AppError dari salinan lain', async () => {
    const foreign = await foreignCopies();
    const response = await handle(() => {
      throw new foreign.AppError('CONFLICT', 'Masih ada tahap lain yang berjalan.');
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: 'CONFLICT', message: 'Masih ada tahap lain yang berjalan.' },
    });
  });
});
