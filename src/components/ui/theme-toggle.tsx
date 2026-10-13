'use client';
import { useEffect, useState } from 'react';
import { applyTheme, nextTheme, resolveTheme, type Theme, themeToggleLabel } from './theme.ts';

/** Tombol ikon gelap/terang. Ikonnya dipilih lewat CSS (`light:`), jadi benar sejak render pertama. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(resolveTheme(document.documentElement.dataset.theme ?? null, false));
  }, []);

  function toggle() {
    const current = resolveTheme(document.documentElement.dataset.theme ?? null, false);
    const next = nextTheme(current);
    applyTheme(next, { storage: window.localStorage, root: document.documentElement });
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme ? themeToggleLabel(theme) : 'Ganti tema gelap atau terang'}
      className="inline-flex size-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-ink hover:border-accent-line"
      data-testid="theme-toggle"
    >
      {/* Mode gelap: ikon bulan; mode terang: ikon matahari. */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="light:hidden"
      >
        <path
          d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="hidden light:block"
      >
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
