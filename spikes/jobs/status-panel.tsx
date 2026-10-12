'use client';
// Spike T-002: panel status yang mem-polling /api/spike/jobs setiap detik.
import { useEffect, useState } from 'react';
import type { SpikeJob } from './job-store.ts';

type ListResponse = { serverPid: number; moduleId: string; jobs: SpikeJob[] };

export function StatusPanel({ canStart }: { canStart: boolean }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const poll = async () => {
      const response = await fetch('/api/spike/jobs', { cache: 'no-store' });
      if (active) setData(await response.json());
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const start = async () => {
    const response = await fetch('/api/spike/jobs', { method: 'POST' });
    const body = await response.json();
    setMessage(
      response.ok ? `Job ${body.job.id} dimulai` : `${response.status}: ${body.error.message}`,
    );
  };

  return (
    <section className="mt-6 space-y-3">
      {canStart && (
        <button
          type="button"
          onClick={start}
          className="rounded bg-slate-900 px-4 py-2 text-white"
          id="start-job"
        >
          Mulai job 3 menit
        </button>
      )}
      {message && <p id="message">{message}</p>}
      <p className="text-sm text-slate-500">
        server pid {data?.serverPid ?? '-'} · modul {data?.moduleId ?? '-'}
      </p>
      <ul id="jobs" className="space-y-1 font-mono text-sm">
        {data?.jobs.map((job) => (
          <li key={job.id}>
            {job.id} {job.status} {job.elapsed}/{job.total} dtk
          </li>
        ))}
      </ul>
    </section>
  );
}
