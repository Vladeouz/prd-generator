'use client';
// Menu samping untuk layar sempit: tautan navigasi, token, dan status template pindah ke sini agar
// header di HP cukup berisi logo, tombol tema, dan tombol menu.
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

type Props = {
  children: ReactNode;
  /** Keadaan awal; bawaan tertutup. */
  defaultOpen?: boolean;
};

export function MobileMenu({ children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // Fokus pindah ke menu saat dibuka, agar Escape dan Tab langsung bekerja di dalamnya.
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [open]);

  function close() {
    setOpen(false);
    toggle.current?.focus();
  }

  // Tautan di dalam menu menutup menu setelah dipilih (klik, atau Enter yang memicu klik).
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  return (
    <>
      <button
        ref={toggle}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-ink md:hidden"
        data-testid="mobile-menu-button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 7h16M4 12h16M4 17h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 cursor-default bg-canvas/70"
          />
          <div
            ref={panel}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={closeOnLink}
            onKeyDown={closeOnEscape}
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-2 border-l border-line bg-surface p-5"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">
                Menu
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Tutup menu"
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control text-ink-muted hover:text-ink"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
