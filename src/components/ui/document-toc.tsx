import type { OutlineItem } from './markdown-outline.ts';

type Props = {
  /** Label bagian, contoh "PRD · versi 2". */
  title: string;
  /** Nama landmark untuk pembaca layar, contoh "Daftar isi PRD". */
  label: string;
  items: OutlineItem[];
};

/** Daftar isi pembaca dokumen (mockup Prd.dc.html): tautan ke heading `##` di dokumen. */
export function DocumentToc({ title, label, items }: Props) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5" data-testid="document-toc">
      <span className="px-2.5 pb-2.5 text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">
        {title}
      </span>
      <ol className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="flex min-h-9 items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-sm text-ink-muted hover:bg-accent-soft hover:text-ink"
            >
              <span className="min-w-4.5 font-mono text-ink-muted" aria-hidden="true">
                {item.no}
              </span>
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
