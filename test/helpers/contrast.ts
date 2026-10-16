// Pemeriksa kontras WCAG 2.x untuk token warna di `src/app/globals.css` (T-021, design.md bagian
// Aksesibilitas). Warna dengan alfa (`--*-soft`, `--accent-line`) dicampur dulu dengan latar di
// bawahnya, sama seperti `color-mix(in srgb, X p%, transparent)` yang digambar di atas latar itu.
import { readFileSync } from 'node:fs';

export type Theme = 'dark' | 'light';
type Rgb = [number, number, number];

const CSS_PATH = new URL('../../src/app/globals.css', import.meta.url);

function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Blok ${selector} tidak ditemukan`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
}

/** Nilai heksadesimal token per tema; tema terang mewarisi token gelap yang tidak ditimpa. */
export function themeTokens(
  css = readFileSync(CSS_PATH, 'utf8'),
): Record<Theme, Record<string, string>> {
  const dark = block(css, ':root');
  return { dark, light: { ...dark, ...block(css, '[data-theme="light"]') } };
}

const hex = (value: string): Rgb =>
  [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16)) as Rgb;

/** Warna `top` dengan alfa `alpha` di atas `bottom` yang buram. */
export const mix = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  top.map((c, i) => Math.round(c * alpha + (bottom[i] ?? 0) * (1 - alpha))) as Rgb;

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Latar dengan alfa. Bisa tampil di atas surface (kartu) atau bg (halaman, misalnya baris stepper
 * terpilih), jadi keduanya diperiksa dan rasio terkecil yang dipakai.
 */
const SOFT: Record<string, [token: string, alpha: number]> = {
  'accent-soft': ['accent', 0.12],
  'success-soft': ['success', 0.14],
  'high-soft': ['severity-high', 0.14],
  'medium-soft': ['severity-medium', 0.14],
  'low-soft': ['severity-low', 0.14],
};

/**
 * Pasangan teks dan latar yang benar-benar dipakai UI. Semuanya teks biasa (di bawah 24 px), jadi
 * batasnya 4.5:1. Teks tombol nonaktif (opacity 50%) dikecualikan WCAG dan tidak diperiksa.
 */
export const PAIRS: { text: string; on: string; where: string }[] = [
  ...['text', 'text-secondary', 'text-muted'].flatMap((text) =>
    ['bg', 'surface', 'surface-raised'].map((on) => ({ text, on, where: 'teks umum' })),
  ),
  // text-faint hanya di atas bg dan surface (placeholder, tahap terkunci, catatan kaki); di atas
  // surface-raised (bilah aksi) rasionya 4,44 di mode gelap, jadi jangan dipakai di sana.
  { text: 'text-faint', on: 'bg', where: 'placeholder, tahap terkunci' },
  { text: 'text-faint', on: 'surface', where: 'catatan kaki kartu' },
  ...['bg', 'surface', 'surface-raised'].map((on) => ({ text: 'accent', on, where: 'ID, tautan' })),
  { text: 'text', on: 'accent-soft', where: 'chip dan opsi terpilih' },
  { text: 'text-muted', on: 'accent-soft', where: 'konsekuensi opsi terpilih' },
  { text: 'accent', on: 'accent-soft', where: 'badge aksen, label tahap aktif' },
  { text: 'on-accent', on: 'accent', where: 'tombol utama' },
  { text: 'success', on: 'surface', where: 'pesan berhasil' },
  { text: 'success', on: 'success-soft', where: 'badge selesai' },
  { text: 'severity-high', on: 'surface', where: 'pesan error' },
  { text: 'severity-high', on: 'high-soft', where: 'badge tinggi, kotak error' },
  { text: 'severity-medium', on: 'medium-soft', where: 'badge sedang, tebakan' },
  { text: 'severity-low', on: 'low-soft', where: 'badge rendah' },
  { text: 'text', on: 'medium-soft', where: 'panel konfirmasi' },
  { text: 'text', on: 'high-soft', where: 'daftar masalah template' },
  { text: 'text-muted', on: 'high-soft', where: 'kode error di layar error' },
  { text: 'text-muted', on: 'medium-soft', where: 'catatan di panel konfirmasi' },
];

function solid(tokens: Record<string, string>, name: string): Rgb {
  const value = tokens[name];
  if (!value) throw new Error(`Token --${name} tidak ada`);
  return hex(value);
}

/** Semua kemungkinan warna latar untuk token itu (dua untuk latar dengan alfa). */
export function backgrounds(tokens: Record<string, string>, name: string): Rgb[] {
  const soft = SOFT[name];
  if (!soft) return [solid(tokens, name)];
  const color = solid(tokens, soft[0]);
  return ['surface', 'bg'].map((under) => mix(color, soft[1], solid(tokens, under)));
}

export type ContrastRow = { theme: Theme; text: string; on: string; where: string; ratio: number };

export function contrastReport(css?: string): ContrastRow[] {
  const all = themeTokens(css);
  return (['dark', 'light'] as const).flatMap((theme) =>
    PAIRS.map(({ text, on, where }) => ({
      theme,
      text,
      on,
      where,
      ratio:
        Math.floor(
          Math.min(...backgrounds(all[theme], on).map((bg) => ratio(solid(all[theme], text), bg))) *
            100,
        ) / 100,
    })),
  );
}
