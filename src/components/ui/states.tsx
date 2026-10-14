import type { ReactNode } from 'react';

type EmptyProps = {
  children: ReactNode;
  /** Judul singkat di atas keterangan, misalnya "Belum ada proyek". */
  title?: string;
  'data-testid'?: string;
};

/** Keadaan kosong atau belum siap: kotak bergaris putus-putus dengan keterangan langkah berikutnya. */
export function EmptyState({ children, title, 'data-testid': testId }: EmptyProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-panel border border-dashed border-line px-4.5 py-4 text-sm text-ink-muted"
      data-testid={testId}
    >
      {title && <p className="font-semibold text-ink">{title}</p>}
      <p>{children}</p>
    </div>
  );
}

/**
 * Keadaan memuat: teks untuk pembaca layar dan kerangka abu-abu yang berdenyut. Dipakai `loading.tsx`
 * selama halaman server membaca database.
 */
export function LoadingState({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div role="status" className="flex flex-col gap-3" data-testid="loading-state">
      <p className="text-sm text-ink-muted">{label}</p>
      <div className="flex flex-col gap-3" aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: kerangka statis tanpa identitas.
            key={i}
            className="h-24 animate-pulse rounded-panel border border-line-subtle bg-surface"
          />
        ))}
      </div>
    </div>
  );
}

type ErrorProps = {
  title: string;
  children: ReactNode;
  /** Tombol atau tautan pemulihan, misalnya "Coba lagi". */
  actions?: ReactNode;
};

/** Keadaan error satu layar: judul, penjelasan, dan aksi pemulihan. */
export function ErrorState({ title, children, actions }: ErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-panel border border-high bg-high-soft px-5 py-4.5"
      data-testid="error-state"
    >
      <h1 className="text-lg font-bold">{title}</h1>
      <div className="text-sm text-ink">{children}</div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}
