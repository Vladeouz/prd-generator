import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  nextTheme,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  themeToggleLabel,
} from '../../../src/components/ui/theme.ts';

/** Peramban tiruan: localStorage, preferensi sistem, dan <html>. */
function fakeBrowser(prefersLight = false) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  const window = {
    matchMedia: (query: string) => ({ matches: prefersLight && /light/.test(query) }),
  };
  const root = { dataset: {} as Record<string, string> };
  /** Memuat ulang halaman: <html> baru, localStorage tetap. */
  const load = () => {
    root.dataset = {};
    new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(storage, window, {
      documentElement: root,
    });
    return root.dataset.theme;
  };
  return { store, storage, root, load };
}

describe('tema', () => {
  it('bawaan mengikuti prefers-color-scheme; pilihan tersimpan menang', () => {
    expect(resolveTheme(null, false)).toBe('dark');
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('ungu', true)).toBe('light');
  });

  it('tombol berganti antara gelap dan terang, labelnya menyebut tujuan', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(themeToggleLabel('dark')).toBe('Ganti ke mode terang');
    expect(themeToggleLabel('light')).toBe('Ganti ke mode gelap');
  });

  it('script awal memakai preferensi sistem bila belum ada pilihan', () => {
    expect(fakeBrowser(false).load()).toBe('dark');
    expect(fakeBrowser(true).load()).toBe('light');
  });

  it('pilihan bertahan setelah halaman dimuat ulang', () => {
    const browser = fakeBrowser(false);
    expect(browser.load()).toBe('dark');

    applyTheme(nextTheme('dark'), browser);
    expect(browser.root.dataset.theme).toBe('light');
    expect(browser.store.get(THEME_STORAGE_KEY)).toBe('light');
    expect(browser.load()).toBe('light');

    applyTheme(nextTheme('light'), browser);
    expect(browser.load()).toBe('dark');
  });

  it('localStorage diblokir: tema tetap terpasang, script awal jatuh ke gelap', () => {
    const root = { dataset: {} as Record<string, string> };
    const blocked = {
      getItem: () => {
        throw new Error('diblokir');
      },
      setItem: () => {
        throw new Error('diblokir');
      },
    };
    applyTheme('light', { storage: blocked, root });
    expect(root.dataset.theme).toBe('light');
    new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(
      blocked,
      {},
      {
        documentElement: root,
      },
    );
    expect(root.dataset.theme).toBe('dark');
  });
});
