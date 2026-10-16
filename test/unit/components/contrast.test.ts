import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastReport, mix, PAIRS, ratio } from '../../helpers/contrast.ts';

const CSS = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8');

describe('pemeriksa kontras', () => {
  it('menghitung rasio WCAG yang sudah dikenal', () => {
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(ratio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(mix([255, 255, 255], 0.5, [0, 0, 0])).toEqual([128, 128, 128]);
  });

  it('membaca token kedua tema dan memeriksa setiap pasangan di keduanya', () => {
    const rows = contrastReport(CSS);
    expect(rows).toHaveLength(PAIRS.length * 2);
    expect(rows.filter((r) => r.theme === 'light').length).toBe(PAIRS.length);
  });
});

describe('kontras teks (design.md: minimal 4.5:1 di kedua tema)', () => {
  it.each(contrastReport(CSS).map((row) => [row.theme, row.text, row.on, row]))(
    '%s: --%s di atas --%s',
    (_theme, _text, _on, row) => {
      expect(row.ratio).toBeGreaterThanOrEqual(4.5);
    },
  );
});
