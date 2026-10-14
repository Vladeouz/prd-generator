import { describe, expect, it } from 'vitest';
import {
  attemptNote,
  jobToPoll,
  trackedJob,
} from '../../../src/app/projects/[id]/stage-runner.tsx';
import type { Job } from '../../../src/jobs/job-queue.ts';

const NOW = '2026-10-14T00:00:00.000Z';
const job = (id: string, stage: string, status: Job['status'] = 'running'): Job => ({
  id,
  projectId: 'p1',
  stage: stage as Job['stage'],
  status,
  error: null,
  createdAt: NOW,
  startedAt: NOW,
  finishedAt: null,
});

describe('trackedJob', () => {
  it('job tahap ini yang dimulai setelah layar tampil ikut dipantau (penulisan ulang PRD)', () => {
    // Layar PRD sudah tampil tanpa job; keputusan review kedua memulai job tahap 6, lalu
    // router.refresh() mengirim job itu lewat props.
    const regen = job('regen', 'stage6');
    expect(trackedJob(null, regen, 'stage6')).toBe(regen);
  });

  it('job lama diganti job aktif yang berbeda; job tahap lain tidak diambil', () => {
    const old = job('lama', 'stage6', 'succeeded');
    const fresh = job('baru', 'stage6');
    expect(trackedJob(old, fresh, 'stage6')).toBe(fresh);
    expect(trackedJob(null, job('x', 'review2'), 'stage6')).toBeNull();
    const same = job('sama', 'stage6');
    expect(trackedJob(same, { ...same }, 'stage6')).toBe(same);
  });
});

describe('jobToPoll', () => {
  it('memantau job tahap ini bila berjalan', () => {
    const own = job('a', 'stage6');
    expect(jobToPoll(own, own)).toBe(own);
  });

  it('memantau job tahap lain yang berjalan, agar halaman dimuat ulang saat selesai', () => {
    const other = job('b', 'stage6');
    expect(jobToPoll(null, other)).toBe(other);
    expect(jobToPoll(job('c', 'review2', 'succeeded'), other)).toBe(other);
  });

  it('tidak ada job berjalan: tidak ada polling', () => {
    expect(jobToPoll(null, null)).toBeNull();
    expect(jobToPoll(job('d', 'stage6', 'failed'), null)).toBeNull();
  });
});

describe('attemptNote', () => {
  it('belum ada percobaan yang gagal: tanpa keterangan', () => {
    expect(attemptNote([])).toBeNull();
  });

  it('percobaan pertama ditolak: menyebut percobaan ke berapa dan alasannya', () => {
    expect(
      attemptNote([
        {
          attempt: 1,
          status: 'failed',
          errors: ['T-029 done when tidak diakhiri `pnpm check` hijau', 'T-035 x', 'T-042 y'],
        },
      ]),
    ).toBe(
      'Percobaan 2 dari 2. Percobaan 1 ditolak: T-029 done when tidak diakhiri `pnpm check` hijau; T-035 x (+1 lainnya). Claude sedang memperbaikinya.',
    );
  });
});
