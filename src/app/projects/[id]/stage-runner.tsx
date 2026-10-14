'use client';
// Tombol jalankan tahap + status job (FR-02): status dan waktu berjalan tampil lewat polling
// `GET /api/jobs/{id}`; halaman tetap bisa dipakai dan ditinggalkan selama job berjalan.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { ConfirmPanel } from '../../../components/ui/confirm-panel.tsx';
import { ProgressBar } from '../../../components/ui/progress-bar.tsx';
import type { Job, JobAttempt } from '../../../jobs/job-queue.ts';
import { MAX_ATTEMPTS } from '../../../stages/attempts.ts';

const POLL_MS = 2000;
/** Polling yang gagal berturut-turut sebelum pesan koneksi terputus tampil. */
const POLL_FAILURES_SHOWN = 2;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Progres terhadap perkiraan durasi: 0–0,95 selama masih di bawah perkiraan (tidak pernah 100%
 * sebelum selesai), lalu `null` (progres tidak tentu) setelah melewatinya atau tanpa perkiraan.
 */
export function jobProgress(elapsedMs: number, estimateMs: number | undefined): number | null {
  if (!estimateMs || elapsedMs > estimateMs) return null;
  return Math.min(0.95, Math.max(0, elapsedMs / estimateMs));
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

/**
 * Keterangan selama job berjalan setelah percobaan sebelumnya ditolak (usulan 3 log T-014), agar
 * percobaan ulang tidak tampak seperti job yang macet. Null bila belum ada percobaan yang gagal.
 */
export function attemptNote(attempts: JobAttempt[], max = MAX_ATTEMPTS): string | null {
  const failed = attempts.filter((a) => a.status === 'failed');
  const last = failed.at(-1);
  if (!last) return null;
  const shown = last.errors.slice(0, 2).join('; ');
  const more = last.errors.length > 2 ? ` (+${last.errors.length - 2} lainnya)` : '';
  return `Percobaan ${Math.min(failed.length + 1, max)} dari ${max}. Percobaan ${last.attempt} ditolak: ${shown}${more}. Claude sedang memperbaikinya.`;
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
  /** Perkiraan durasi dalam ms untuk bilah progres; tanpa nilai, progres tidak tentu. */
  estimateMs?: number;
  /** Perkiraan token di banner, contoh "±33 rb token". */
  estimateTokens?: string;
  /** Bila ada, tombol jalankan meminta konfirmasi dulu dengan teks ini (tahap 6–7, FR-10). */
  confirmation?: string;
};

export function StageRunner({
  projectId,
  stage,
  label,
  activeJob,
  latestJob,
  hasOutput,
  estimate,
  estimateMs,
  estimateTokens,
  confirmation,
}: Props) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(activeJob?.stage === stage ? activeJob : null);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [attempts, setAttempts] = useState<JobAttempt[]>([]);
  const [starting, setStarting] = useState(false);
  const [pollFailures, setPollFailures] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
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
        if (!response.ok) {
          setPollFailures((n) => n + 1);
          return;
        }
        setPollFailures(0);
        const latest = (await response.json()) as Job & { attempts?: JobAttempt[] };
        setAttempts(latest.attempts ?? []);
        if (latest.status !== 'queued' && latest.status !== 'running') {
          setAttempts([]);
          setJob(null);
          router.refresh();
        }
      } catch {
        // Server sedang tidak bisa dihubungi; coba lagi di polling berikutnya.
        setPollFailures((n) => n + 1);
      }
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [polledId, router]);

  async function start() {
    setConfirming(false);
    setMessage('');
    setStarting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/stages/${stage}/run`, {
        method: 'POST',
      });
      const body = await response.json();
      if (response.status === 202) {
        setJob(body as Job);
        setNow(Date.now());
        setPollFailures(0);
      } else {
        setMessage(body.error?.message ?? 'Tahap gagal dimulai.');
      }
    } catch {
      setMessage('Gagal menghubungi server. Pastikan server masih berjalan, lalu coba lagi.');
    }
    setStarting(false);
  }

  function cancel() {
    setConfirming(false);
    // Panel konfirmasi hilang; fokus kembali ke tombol yang membukanya.
    requestAnimationFrame(() => trigger.current?.focus());
  }

  const failed =
    !running && latestJob?.stage === stage && ['failed', 'interrupted'].includes(latestJob.status)
      ? latestJob
      : null;
  const otherRunning = activeJob !== null && activeJob.stage !== stage;

  return (
    <div className="flex flex-col gap-2.5" data-testid={`runner-${stage}`}>
      {running && job ? (
        <RunningBanner
          job={job}
          label={label}
          elapsedMs={now - Date.parse(job.startedAt ?? job.createdAt)}
          estimate={estimate}
          estimateMs={estimateMs}
          estimateTokens={estimateTokens}
          note={attemptNote(attempts)}
          disconnected={pollFailures >= POLL_FAILURES_SHOWN}
        />
      ) : confirming && confirmation ? (
        <ConfirmPanel
          confirmLabel="Ya, jalankan"
          onConfirm={start}
          onCancel={cancel}
          data-testid="run-confirmation"
        >
          {confirmation}
        </ConfirmPanel>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            ref={trigger}
            variant={hasOutput ? 'secondary' : 'primary'}
            onClick={confirmation ? () => setConfirming(true) : start}
            disabled={otherRunning || starting}
          >
            {starting
              ? 'Memulai…'
              : hasOutput
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

type BannerProps = {
  job: Job;
  label: string;
  elapsedMs: number;
  estimate?: string;
  estimateMs?: number;
  estimateTokens?: string;
  note: string | null;
  disconnected: boolean;
};

/**
 * Banner job berjalan (mockup Prd.dc.html): status, waktu berjalan, perkiraan, dan bilah progres.
 * Hanya baris status yang diumumkan pembaca layar; waktu yang berganti setiap detik tidak.
 */
function RunningBanner({
  job,
  label,
  elapsedMs,
  estimate,
  estimateMs,
  estimateTokens,
  note,
  disconnected,
}: BannerProps) {
  const progress = jobProgress(elapsedMs, estimateMs);
  const over = estimateMs !== undefined && progress === null;
  const plan = [estimate, estimateTokens].filter(Boolean).join(' dan ');
  return (
    <section
      aria-label="Job berjalan"
      className="flex flex-col gap-3 rounded-panel border border-accent-line bg-surface px-5 py-4"
      data-testid="job-banner"
    >
      <p className="font-bold" role="status" data-testid="job-status">
        {job.status === 'queued' ? `${label}: menunggu dimulai` : `${label} sedang berjalan`}
      </p>
      <p className="text-sm text-ink-muted" data-testid="job-elapsed">
        Berjalan <span className="font-mono text-ink">{formatElapsed(elapsedMs)}</span>
        {plan && ` · perkiraan ${plan}`}
        {over && ' · melewati perkiraan, masih berjalan'} · boleh meninggalkan halaman ini
      </p>
      {note && (
        <p className="text-[13px] text-ink-secondary" data-testid="attempt-note">
          {note}
        </p>
      )}
      <ProgressBar
        label={
          progress === null
            ? `Progres ${label.toLowerCase()}`
            : `Sekitar ${Math.round(progress * 100)} persen dari perkiraan waktu`
        }
        value={progress ?? undefined}
      />
      {disconnected && (
        <p className="text-sm text-high" role="status" data-testid="poll-disconnected">
          Koneksi ke server terputus. Mencoba lagi…
        </p>
      )}
    </section>
  );
}
