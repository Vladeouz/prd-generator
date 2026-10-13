import type { HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'article' | 'aside';
  /** `panel`: radius 16 px (panel samping); `main`: radius 20 px (kartu utama, komposer). */
  size?: 'panel' | 'main';
  /** Garis tepi berwarna untuk kartu yang butuh perhatian. */
  tone?: 'default' | 'medium' | 'high';
};

const TONES = {
  default: 'border-line-subtle',
  medium: 'border-medium',
  high: 'border-high',
};

export function Card({
  as: Tag = 'div',
  size = 'panel',
  tone = 'default',
  className,
  ...rest
}: Props) {
  return (
    <Tag
      className={[
        'border bg-surface',
        size === 'main' ? 'rounded-card p-5.5' : 'rounded-panel p-4.5',
        TONES[tone],
        className ?? '',
      ].join(' ')}
      {...rest}
    />
  );
}
