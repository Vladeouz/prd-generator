import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const css = read('src/app/globals.css');
const design = read('docs/design/design.md');

/** Isi blok CSS pertama yang diawali `selector {`. */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`blok ${selector} tidak ada`);
  return css.slice(start, css.indexOf('}', start));
}

const designTokens = [...design.matchAll(/^\| `(--[a-z-]+)` \|/gm)].map(
  (match) => match[1] as string,
);
// `--accent-soft` dan `--accent-line` diturunkan dari `--accent` dengan alfa, jadi ikut tema.
const derived = new Set(['--accent-soft', '--accent-line']);

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

describe('token desain', () => {
  it('semua token warna design.md didefinisikan untuk mode gelap dan terang', () => {
    expect(designTokens.length).toBeGreaterThanOrEqual(17);
    const dark = block(':root');
    const light = block('[data-theme="light"]');
    for (const token of designTokens) {
      if (derived.has(token)) {
        expect(css, token).toMatch(new RegExp(`${token}: color-mix\\(in srgb, var\\(--accent\\)`));
        continue;
      }
      expect(dark, token).toMatch(new RegExp(`${token}: #[0-9a-f]{6};`));
      expect(light, token).toMatch(new RegExp(`${token}: #[0-9a-f]{6};`));
    }
  });

  it('nilai mode gelap sama dengan tabel design.md', () => {
    const dark = block(':root');
    for (const [, token, value] of design.matchAll(/^\| `(--[a-z-]+)` \| `(#[0-9A-F]{6})` \|/gm)) {
      expect(dark, token).toContain(`${token}: ${value?.toLowerCase()};`);
    }
  });

  it('tipografi, radius, dan jarak tersedia sebagai custom property', () => {
    for (const token of [
      '--font-sans: var(--font-jakarta)',
      '--font-mono: var(--font-jetbrains)',
      '--radius-control: 12px',
      '--radius-panel: 16px',
      '--radius-card: 20px',
      '--spacing: 4px',
    ]) {
      expect(css).toContain(token);
    }
  });

  it('tidak ada nilai warna mentah di src/components dan src/app selain globals.css', () => {
    const hits = [...files('src/components'), ...files('src/app')]
      .filter((file) => /#[0-9a-fA-F]{3,6}/.test(read(file)))
      .map((file) => relative('.', file).split(sep).join('/'));
    expect(hits).toEqual(['src/app/globals.css']);
  });
});
