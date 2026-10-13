import type { ReactNode } from 'react';
import { Card } from '../../../components/ui/card.tsx';
import type { StageUsage } from '../../../projects/projects.ts';
import { formatDuration, formatTokens } from '../format.ts';

type Props = {
  id: string;
  number: number;
  title: string;
  description: string;
  /** Tombol jalankan dan status job. */
  runner: ReactNode;
  /** Panel samping: asumsi, catatan, pemakaian. */
  aside?: ReactNode;
  children?: ReactNode;
};

/**
 * Kerangka satu layar tahap. `section` memakai `display: contents`, jadi konten dan panel samping
 * menjadi kolom di grid halaman proyek (lihat project-view.tsx).
 */
export function StageLayout({ id, number, title, description, runner, aside, children }: Props) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="contents">
      <div className="order-1 flex min-w-0 flex-col gap-5 lg:col-start-2 lg:row-start-1">
        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-[13px] text-accent">TAHAP {number} / 8</span>
          <h1
            id={`${id}-title`}
            className="text-[28px] font-extrabold tracking-[-0.02em] sm:text-[34px]"
          >
            {title}
          </h1>
          <p className="text-sm text-ink-muted">{description}</p>
        </div>
        {runner}
        {children}
      </div>
      {aside && (
        <aside
          aria-label="Catatan tahap"
          className="order-3 flex flex-col gap-4 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1"
        >
          {aside}
        </aside>
      )}
    </section>
  );
}

type NotesProps = {
  title: string;
  items: string[];
  empty?: string;
  testId?: string;
};

export function NotesCard({ title, items, empty, testId }: NotesProps) {
  if (items.length === 0 && !empty) return null;
  return (
    <Card as="section" className="flex flex-col gap-2.5">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {items.length > 0 ? (
        <ul
          className="flex list-disc flex-col gap-1.5 pl-4.5 text-sm text-ink-muted"
          data-testid={testId}
        >
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">{empty}</p>
      )}
    </Card>
  );
}

export function UsageCard({ usage }: { usage: StageUsage | undefined }) {
  return (
    <Card as="section" className="flex flex-col gap-2">
      <h2 className="text-[15px] font-bold">Pemakaian tahap ini</h2>
      <span className="font-mono text-[13px] text-ink-muted" data-testid="stage-usage">
        {usage
          ? [formatTokens(usage), usage.durationMs !== null ? formatDuration(usage.durationMs) : '']
              .filter(Boolean)
              .join(' · ')
          : 'Belum ada'}
      </span>
    </Card>
  );
}
