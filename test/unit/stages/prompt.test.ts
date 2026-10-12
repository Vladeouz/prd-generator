import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractJson } from '../../../src/stages/parse.ts';
import { loadPrompt, renderPrompt } from '../../../src/stages/prompt.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'prd-generator-prompts-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('loadPrompt', () => {
  it('membaca version dan isi, juga dengan baris CRLF', () => {
    writeFileSync(join(dir, 'x.md'), '---\r\nversion: 3\r\n---\r\nHalo {{nama}}\r\n');
    expect(loadPrompt('x', dir)).toEqual({ name: 'x', version: '3', body: 'Halo {{nama}}' });
  });

  it('error bila front matter atau version tidak ada', () => {
    writeFileSync(join(dir, 'a.md'), 'Halo');
    writeFileSync(join(dir, 'b.md'), '---\njudul: x\n---\nHalo');
    expect(() => loadPrompt('a', dir)).toThrow(/front matter/);
    expect(() => loadPrompt('b', dir)).toThrow(/version/);
  });
});

describe('renderPrompt', () => {
  const template = { name: 't', version: '1', body: 'Ide: {{idea}} ({{idea}})' };

  it('mengisi placeholder; nilai tidak dipindai ulang', () => {
    expect(renderPrompt(template, { idea: 'a {{idea}} b' })).toBe(
      'Ide: a {{idea}} b (a {{idea}} b)',
    );
  });

  it('error untuk placeholder tanpa nilai dan nilai yang tidak dipakai', () => {
    expect(() => renderPrompt(template, {})).toThrow(/\{\{idea\}\} tidak punya nilai/);
    expect(() => renderPrompt(template, { idea: 'x', lain: 'y' })).toThrow(/tidak dipakai: lain/);
  });
});

describe('extractJson', () => {
  it('membuang code fence dan teks di sekitar objek', () => {
    expect(extractJson('Ini hasilnya:\n```json\n{"a": {"b": 1}}\n```\nSelesai')).toEqual({
      a: { b: 1 },
    });
  });

  it('error bila tidak ada objek', () => {
    expect(() => extractJson('maaf')).toThrow('tidak ada objek JSON');
  });
});
