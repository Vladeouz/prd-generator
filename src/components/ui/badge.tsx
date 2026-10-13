import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'high' | 'medium' | 'low';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border border-line text-ink-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  high: 'bg-high-soft text-high',
  medium: 'bg-medium-soft text-medium',
  low: 'bg-low-soft text-low',
};

const SIZES = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-[13px]' };

type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'className'> & {
  tone?: BadgeTone;
  size?: keyof typeof SIZES;
  /** Titik warna di depan teks. Status tetap terbaca dari teksnya, bukan dari warna saja. */
  dot?: boolean;
};

/** Label status atau keparahan: warna sebagai teks di atas latar warna yang sama (alfa 14%). */
export function Badge({ tone = 'neutral', size = 'md', dot = false, children, ...rest }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-semibold ${SIZES[size]} ${TONES[tone]}`}
      {...rest}
    >
      {dot && <span className="size-2 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
