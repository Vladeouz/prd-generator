import Link from 'next/link';

export type StepStatus = 'done' | 'current' | 'locked' | 'failed' | 'running';

export type Step = {
  number: number;
  label: string;
  status: StepStatus;
  /** Keterangan singkat, misalnya "4 pertanyaan" atau perkiraan durasi. */
  meta?: string;
  /** Token tahap ini, sudah diformat. */
  tokens?: string;
  /** Tautan ke layar tahap; tanpa tautan untuk tahap terkunci atau yang belum punya layar. */
  href?: string;
  /** Tahap yang sedang dibuka di layar. */
  selected?: boolean;
};

export const STEP_STATUS_TEXT: Record<StepStatus, string> = {
  done: 'Selesai',
  current: 'Aktif',
  locked: 'Terkunci',
  failed: 'Gagal',
  running: 'Berjalan',
};

const DOT: Record<StepStatus, string> = {
  done: 'border-accent bg-accent text-on-accent',
  current: 'border-accent text-accent',
  locked: 'border-line text-ink-faint',
  failed: 'border-high bg-high-soft text-high',
  running: 'border-accent text-accent animate-pulse',
};

function Mark({ step }: { step: Step }) {
  if (step.status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (step.status === 'failed') return <span aria-hidden="true">!</span>;
  return <span aria-hidden="true">{step.number}</span>;
}

/** Stepper 8 tahap vertikal: status selalu tertulis sebagai teks, tidak hanya warna. */
export function Stepper({ steps, label = 'Tahapan' }: { steps: Step[]; label?: string }) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      <span className="px-3 pb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
        {steps.length} tahap
      </span>
      <ol className="flex flex-col gap-1">
        {steps.map((step) => {
          const body = (
            <>
              <span
                className={`inline-flex size-7 flex-none items-center justify-center rounded-full border-[1.5px] font-mono text-xs font-semibold ${DOT[step.status]}`}
              >
                <Mark step={step} />
              </span>
              <span className="flex min-w-0 flex-auto flex-col">
                <span
                  className={`text-sm font-semibold ${step.status === 'locked' ? 'text-ink-faint' : 'text-ink'}`}
                >
                  <span className="sr-only">Tahap {step.number}: </span>
                  {step.label}
                </span>
                <span className="text-xs text-ink-muted" data-testid={`step-meta-${step.number}`}>
                  {[STEP_STATUS_TEXT[step.status], step.meta, step.tokens]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </>
          );
          const className = `flex items-center gap-3 rounded-control border px-3 py-2.5 ${step.selected ? 'border-accent-line bg-accent-soft' : 'border-transparent'}`;
          return (
            <li key={step.number} data-status={step.status}>
              {step.href ? (
                <Link
                  href={step.href}
                  className={`${className} hover:bg-accent-soft`}
                  aria-current={step.selected ? 'page' : undefined}
                >
                  {body}
                </Link>
              ) : (
                <div className={className}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
