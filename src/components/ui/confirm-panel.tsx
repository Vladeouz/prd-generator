'use client';
// Konfirmasi di halaman (bukan dialog browser): fokus langsung ke tombol konfirmasi saat muncul, dan
// Escape sama dengan "Batal". Pemanggil mengembalikan fokus ke tombol pemicu lewat `onCancel`.
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { Button } from './button.tsx';

type Props = {
  children: ReactNode;
  confirmLabel: string;
  /** `submit`: tombol konfirmasi mengirim form tempat panel ini berada. */
  confirmType?: 'button' | 'submit';
  onConfirm?: () => void;
  onCancel: () => void;
  tone?: 'medium' | 'high';
  'data-testid'?: string;
};

const TONES = {
  medium: 'border-medium bg-medium-soft',
  high: 'border-high bg-high-soft',
};

export function ConfirmPanel({
  children,
  confirmLabel,
  confirmType = 'button',
  onConfirm,
  onCancel,
  tone = 'medium',
  'data-testid': testId,
}: Props) {
  const id = useId();
  const confirm = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirm.current?.focus();
  }, []);

  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className={`flex flex-col gap-3 rounded-panel border px-4.5 py-4 ${TONES[tone]}`}
      role="alertdialog"
      aria-labelledby={id}
      onKeyDown={cancelOnEscape}
      data-testid={testId}
    >
      <div id={id} className="text-sm text-ink">
        {children}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button ref={confirm} type={confirmType} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Batal
        </Button>
      </div>
    </div>
  );
}
