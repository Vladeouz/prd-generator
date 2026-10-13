import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text';
export type ButtonSize = 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent font-bold text-on-accent hover:brightness-110',
  secondary: 'border border-line bg-surface font-semibold text-ink hover:border-accent-line',
  text: 'font-semibold text-ink-muted hover:text-ink',
};

// Target sentuh minimal 44 px; `lg` (48 px) untuk tombol utama layar.
const SIZES: Record<ButtonSize, string> = { md: 'min-h-11 px-4', lg: 'min-h-12 px-5.5' };

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-control text-[15px] disabled:cursor-not-allowed disabled:opacity-50';

/** Kelas tombol, juga untuk tautan yang tampil sebagai tombol. */
export const buttonClass = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md') =>
  [BASE, VARIANTS[variant], SIZES[size]].join(' ');

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant = 'primary', size = 'md', type = 'button', ...rest }: Props) {
  return <button type={type} className={buttonClass(variant, size)} {...rest} />;
}
