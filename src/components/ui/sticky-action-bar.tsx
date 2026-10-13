import type { ReactNode } from 'react';

type Props = {
  /** Ringkasan di kiri, misalnya "3 dari 4 dijawab". */
  summary: ReactNode;
  /** Nama tahap berikutnya, ditulis tepat di samping tombol utama. */
  next: string;
  /** Tombol utama (dan pesan statusnya). */
  children: ReactNode;
};

/** Bilah aksi di akhir setiap layar tahap: tetap terlihat di bawah layar saat menggulir. */
export function StickyActionBar({ summary, next, children }: Props) {
  return (
    <div
      className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3.5 rounded-panel border border-line bg-raised px-5 py-4"
      data-testid="sticky-action-bar"
    >
      <div className="text-sm text-ink-muted">{summary}</div>
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="text-sm text-ink-muted" data-testid="next-stage">
          Berikutnya: <span className="font-semibold text-ink">{next}</span>
        </span>
        {children}
      </div>
    </div>
  );
}
