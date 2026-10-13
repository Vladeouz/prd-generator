'use client';
// Tombol jalankan tahap + status job (FR-02): status dan waktu berjalan tampil lewat polling
// `GET /api/jobs/{id}`; halaman tetap bisa dipakai dan ditinggalkan selama job berjalan.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Job } from '../../../jobs/job-queue.ts';

const POLL_MS = 2000;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type Props = {
  projectId: string;
  stage: string;
  label: string;
  /** Job aktif di seluruh proyek ini (bisa tahap lain). */
  activeJob: Job | null;
  /** Job terakhir proyek ini, untuk menampilkan error tahap ini. */
  latestJob: Job | null;
  hasOutput: boolean;
  /** Contoh: "sekitar 20 detik". */
  estimate?: string;
};

export function StageRunner({
  projectId,
  stage,
  label,
  activeJob,
  latestJob,
  hasOutput,
  estimate,
}: Props) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(activeJob?.stage === stage ? activeJob : null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const running = job !== null && (job.status === 'queued' || job.status === 'running');

  useEffect(() => {
    if (!running || !job) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: 'no-store' });
        if (!response.ok) return;
        const latest = (await response.json()) as Job;
        if (latest.status !== 'queued' && latest.status !== 'running') {
          setJob(null);
          router.refresh();
        }
      } catch {
        // Server sedang tidak bisa dihubungi; coba lagi di polling berikutnya.
      }
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [running, job, router]);

  async function start() {
    setMessage('');
    const response = await fetch(`/api/projects/${projectId}/stages/${stage}/run`, {
      method: 'POST',
    });
    const body = await response.json();
    if (response.status === 202) {
      setJob(body as Job);
      setNow(Date.now());
    } else {
      setMessage(body.error?.message ?? 'Tahap gagal dimulai.');
    }
  }

  const failed =
    !running && latestJob?.stage === stage && ['failed', 'interrupted'].includes(latestJob.status)
      ? latestJob
      : null;
  const otherRunning = activeJob !== null && activeJob.stage !== stage;

  return (
    <div className="space-y-2" data-testid={`runner-${stage}`}>
      {running && job ? (
        <p className="text-sm text-slate-700" data-testid="job-status">
          {job.status === 'queued' ? 'Menunggu dimulai' : `${label} sedang berjalan`} ·{' '}
          {formatElapsed(now - Date.parse(job.startedAt ?? job.createdAt))}
          {estimate ? ` (perkiraan ${estimate})` : ''}. Kamu boleh meninggalkan halaman ini.
        </p>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={otherRunning}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {hasOutput ? `Jalankan ulang ${label.toLowerCase()}` : `Jalankan ${label.toLowerCase()}`}
        </button>
      )}
      {otherRunning && !running && (
        <p className="text-sm text-slate-500">Tahap lain sedang berjalan. Tunggu sampai selesai.</p>
      )}
      {failed && (
        <p className="text-sm text-red-700" data-testid="job-error">
          {failed.status === 'interrupted' ? 'Terhenti' : 'Gagal'}: {failed.error}
        </p>
      )}
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
