'use client';
// Tombol jalankan tahap + status job (FR-02): status dan waktu berjalan tampil lewat polling
// `GET /api/jobs/{id}`; halaman tetap bisa dipakai dan ditinggalkan selama job berjalan.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { ProgressBar } from '../../../components/ui/progress-bar.tsx';
import type { Job } from '../../../jobs/job-queue.ts';

const POLL_MS = 2000;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const isActive = (job: Job | null): job is Job =>
  job !== null && (job.status === 'queued' || job.status === 'running');

/**
 * Job tahap ini yang dipantau. Job aktif dari server (props, setelah `router.refresh()`) menggantikan
 * state lama bila id-nya berbeda, misalnya job tahap 6 yang dimulai dari keputusan review kedua
 * setelah layar sudah tampil.
 */
export function trackedJob(current: Job | null, activeJob: Job | null, stage: string): Job | null {
  return activeJob?.stage === stage && activeJob.id !== current?.id ? activeJob : current;
}

/**
 * Job yang di-polling: job tahap ini bila berjalan; bila tidak, job tahap lain yang berjalan di
 * proyek ini, agar halaman dimuat ulang (dan tahap berikutnya terbuka) saat job itu selesai.
 */
export function jobToPoll(job: Job | null, activeJob: Job | null): Job | null {
  if (isActive(job)) return job;
  return isActive(activeJob) ? activeJob : null;
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
  const running = isActive(job);
  const polled = jobToPoll(job, activeJob);
  const polledId = polled?.id;

  useEffect(() => {
    setJob((current) => trackedJob(current, activeJob, stage));
  }, [activeJob, stage]);

  useEffect(() => {
    if (!polledId) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${polledId}`, { cache: 'no-store' });
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
  }, [polledId, router]);

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
    <div className="flex flex-col gap-2.5" data-testid={`runner-${stage}`}>
      {running && job ? (
        <div className="flex flex-col gap-3 rounded-panel border border-accent-line bg-accent-soft px-4.5 py-4">
          <p className="text-sm text-ink" aria-live="polite" data-testid="job-status">
            {job.status === 'queued' ? 'Menunggu dimulai' : `${label} sedang berjalan`} ·{' '}
            {formatElapsed(now - Date.parse(job.startedAt ?? job.createdAt))}
            {estimate ? ` (perkiraan ${estimate})` : ''}. Kamu boleh meninggalkan halaman ini.
          </p>
          <ProgressBar label={`Progres ${label.toLowerCase()}`} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={hasOutput ? 'secondary' : 'primary'}
            onClick={start}
            disabled={otherRunning}
          >
            {hasOutput
              ? `Jalankan ulang ${label.toLowerCase()}`
              : `Jalankan ${label.toLowerCase()}`}
          </Button>
          {estimate && !hasOutput && (
            <span className="text-[13px] text-ink-muted">Perkiraan {estimate}</span>
          )}
        </div>
      )}
      {otherRunning && !running && (
        <p className="text-sm text-ink-muted">Tahap lain sedang berjalan. Tunggu sampai selesai.</p>
      )}
      {failed && (
        <p
          className="rounded-control border border-high bg-high-soft px-3.5 py-2.5 text-sm text-high"
          data-testid="job-error"
          role="alert"
        >
          {failed.status === 'interrupted' ? 'Terhenti' : 'Gagal'}: {failed.error}
        </p>
      )}
      {message && (
        <p className="text-sm text-high" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
