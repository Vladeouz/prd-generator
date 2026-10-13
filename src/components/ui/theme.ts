// Tema gelap/terang (docs/design/design.md): pilihan disimpan di localStorage; bawaannya
// mengikuti `prefers-color-scheme`. Tema dipasang sebagai `data-theme` di <html>.

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = 'prd-generator-theme';

const isTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme);

/** Tema yang dipakai: pilihan tersimpan bila ada, selain itu preferensi sistem. */
export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (isTheme(stored)) return stored;
  return prefersLight ? 'light' : 'dark';
}

export const nextTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark');

export const themeToggleLabel = (theme: Theme) =>
  theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap';

type ThemeTarget = {
  storage: Pick<Storage, 'setItem'>;
  root: { dataset: DOMStringMap };
};

/** Memasang tema dan menyimpannya agar bertahan setelah halaman dimuat ulang. */
export function applyTheme(theme: Theme, { storage, root }: ThemeTarget): void {
  root.dataset.theme = theme;
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Penyimpanan diblokir (misalnya mode privat): tema tetap berlaku sampai halaman dimuat ulang.
  }
}

/**
 * Script sebelum render pertama (di <head>), agar halaman tidak berkedip dengan tema yang salah.
 * Logikanya sama dengan `resolveTheme`; ditulis sebagai string karena dijalankan apa adanya.
 */
export const THEME_INIT_SCRIPT = `(function(){var t;try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});t=s==='dark'||s==='light'?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');}catch(e){t='dark';}document.documentElement.dataset.theme=t;})();`;
