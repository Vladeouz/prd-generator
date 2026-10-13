import { describe, expect, it } from 'vitest';
import { ClaudeRunError } from '../../../src/claude/types.ts';
import { AppError } from '../../../src/core/errors.ts';
import { handle } from '../../../src/core/http.ts';
import { StageFailedError } from '../../../src/stages/run-stage.ts';

// Next.js membundel instrumentation.ts terpisah dari route, sehingga antrean job melempar error dari
// salinan modul lain. Query string pada import memberi salinan modul terpisah di Vitest.
// Path disusun saat runtime agar TypeScript tidak mencoba me-resolve query string-nya.
const copyOf = <T>(path: string): Promise<T> => import(`${path}?salinan-lain`);

async function foreignCopies() {
  const errors = await copyOf<typeof import('../../../src/core/errors.ts')>(
    '../../../src/core/errors.ts',
  );
  const claude = await copyOf<typeof import('../../../src/claude/types.ts')>(
    '../../../src/claude/types.ts',
  );
  const stages = await copyOf<typeof import('../../../src/stages/run-stage.ts')>(
    '../../../src/stages/run-stage.ts',
  );
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
