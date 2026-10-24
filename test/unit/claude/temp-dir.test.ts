// Penghapusan folder sementara runner CLI memakai percobaan ulang `rmSync` (T-038).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rmSync = vi.fn();
vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  rmSync: (...args: unknown[]) => rmSync(...args),
}));

const { removeTempDir, TEMP_DIR_REMOVE_OPTIONS } = await import(
  '../../../src/claude/cli-runner.ts'
);

beforeEach(() => rmSync.mockReset());

describe('removeTempDir', () => {
  it('rmSync rekursif dengan maxRetries dan retryDelay singkat', () => {
    removeTempDir('/tmp/prd-generator-claude-x');
    expect(rmSync).toHaveBeenCalledExactlyOnceWith('/tmp/prd-generator-claude-x', {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    expect(TEMP_DIR_REMOVE_OPTIONS.maxRetries * TEMP_DIR_REMOVE_OPTIONS.retryDelay).toBeLessThan(
      2_000,
    );
  });
});
