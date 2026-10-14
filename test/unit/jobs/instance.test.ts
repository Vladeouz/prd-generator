import { describe, expect, it } from 'vitest';
import { FakeClaudeRunner } from '../../../src/claude/fake-runner.ts';
import type { Db } from '../../../src/core/db/client.ts';
import { currentQueue } from '../../../src/jobs/instance.ts';
import { JobQueue } from '../../../src/jobs/job-queue.ts';

// Query string pada import memberi salinan modul terpisah di Vitest, seperti bundle instrumentation
// Next.js atau modul sebelum hot reload. Path disusun saat runtime agar TypeScript tidak me-resolve
// query string-nya.
const copyOf = <T>(path: string): Promise<T> => import(`${path}?salinan-lain`);

const deps = {
  db: {} as Db,
  runner: new FakeClaudeRunner([]),
  clock: () => '2026-10-14T00:00:00.000Z',
  stages: {},
};

describe('currentQueue', () => {
  it('antrean dari kode JobQueue yang sama dipakai ulang', () => {
    const existing = new JobQueue(deps);
    expect(currentQueue(existing, () => new JobQueue(deps))).toBe(existing);
  });

  it('antrean dari salinan modul lama diganti, agar job memakai runStage terbaru', async () => {
    const old = await copyOf<typeof import('../../../src/jobs/job-queue.ts')>(
      '../../../src/jobs/job-queue.ts',
    );
    const stale = new old.JobQueue(deps);
    expect(stale).not.toBeInstanceOf(JobQueue);
    const fresh = currentQueue(stale, () => new JobQueue(deps));
    expect(fresh).not.toBe(stale);
    expect(fresh).toBeInstanceOf(JobQueue);
  });

  it('belum ada antrean: dibuat baru', () => {
    expect(currentQueue(undefined, () => new JobQueue(deps))).toBeInstanceOf(JobQueue);
  });
});
