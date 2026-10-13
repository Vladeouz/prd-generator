import type { InputHTMLAttributes, ReactNode } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & {
  /** `single`: radio (satu pilihan per grup); `multi`: checkbox. */
  kind: 'single' | 'multi';
  /** `outline`: chip "+ Lainnya" (garis putus-putus) atau "Lewati". */
  look?: 'option' | 'dashed' | 'outline';
  children: ReactNode;
};

const LOOKS = {
  option:
    'border-line bg-canvas text-ink-secondary has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink',
  dashed:
    'border-dashed border-line text-ink-muted has-checked:border-solid has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink',
  outline:
    'border-line text-ink-muted has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink',
};

/**
 * Pilihan jawaban berbentuk chip. Isinya input radio atau checkbox asli (tersembunyi secara visual),
 * jadi status terpilih, navigasi keyboard, dan pembaca layar mengikuti perilaku bawaan form.
 */
export function Chip({ kind, look = 'option', className, children, ...input }: Props) {
  return (
    <label
      className={[
        'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border-[1.5px] px-4 py-2 text-left text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-50',
        LOOKS[look],
        className ?? '',
      ].join(' ')}
    >
      <input type={kind === 'multi' ? 'checkbox' : 'radio'} className="sr-only" {...input} />
      {children}
    </label>
  );
}
