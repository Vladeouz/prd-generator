import { describe, expect, it } from 'vitest';
import {
  CONVENTION_SECTIONS,
  missingSectionsMessage,
  sectionProblems,
  selectSections,
  stageSections,
} from '../../../src/template/sections.ts';
import {
  EXPECTED_SECTIONS,
  TEMPLATE_CONVENTIONS,
  TEMPLATE_SECTIONS,
} from '../../helpers/template-repo.ts';

const doc = [
  '# Konvensi',
  '',
  '## A',
  'isi A  ',
  '### A1',
  'isi A1',
  '#### A1a',
  'isi A1a',
  '',
  '## B',
  '```',
  '## bukan heading',
  '```',
  'isi B',
  '',
  '',
  '## C',
  'isi C',
].join('\n');

describe('selectSections', () => {
  it('heading beserta semua sub-heading-nya, sampai heading setingkat berikutnya', () => {
    expect(selectSections(doc, ['## A'])).toEqual({
      ok: true,
      text: ['## A', 'isi A  ', '### A1', 'isi A1', '#### A1a', 'isi A1a'].join('\n'),
    });
  });

  it('sub-heading sendiri berhenti di sub-heading atau heading yang lebih tinggi', () => {
    expect(selectSections(doc, ['### A1'])).toEqual({
      ok: true,
      text: ['### A1', 'isi A1', '#### A1a', 'isi A1a'].join('\n'),
    });
  });

  it('heading di dalam blok kode tidak dihitung, baris kosong di akhir bagian dibuang', () => {
    expect(selectSections(doc, ['## B'])).toEqual({
      ok: true,
      text: ['## B', '```', '## bukan heading', '```', 'isi B'].join('\n'),
    });
    expect(selectSections(doc, ['## bukan heading'])).toEqual({
      ok: false,
      missing: ['## bukan heading'],
    });
  });

  it('urutan mengikuti daftar heading, dipisah satu baris kosong; bagian terakhir dokumen ikut', () => {
    expect(selectSections(doc, ['## C', '## B'])).toEqual({
      ok: true,
      text: ['## C', 'isi C', '', '## B', '```', '## bukan heading', '```', 'isi B'].join('\n'),
    });
  });

  it('CRLF, Unicode, dan spasi di akhir dipertahankan apa adanya', () => {
    const crlf = '## Ä\r\nisi ✓  \r\n\r\n## B\r\nx\r\n';
    expect(selectSections(crlf, ['## Ä'])).toEqual({ ok: true, text: '## Ä\r\nisi ✓  \r' });
  });

  it('heading harus satu baris persis; semua yang hilang dilaporkan', () => {
    expect(selectSections(doc, ['## A ', '## D', '## a', '## E'])).toEqual({
      ok: false,
      missing: ['## A ', '## D', '## a', '## E'],
    });
    expect(selectSections('## A:\nisi', ['## A'])).toEqual({ ok: false, missing: ['## A'] });
  });
});

describe('bagian per tahap', () => {
  it('daftar heading dari spike T-022', () => {
    expect(CONVENTION_SECTIONS.stage6).toHaveLength(8);
    expect(CONVENTION_SECTIONS.review2).toEqual([
      '## Autentikasi',
      '## Pagination',
      '## Database',
      '## Format error',
      '## Clean Architecture API',
    ]);
  });

  it('template buatan test: bagian tahap 6 dan review kedua sesuai harapan, tanpa bagian lain', () => {
    expect(stageSections(TEMPLATE_CONVENTIONS, 'stage6')).toEqual({
      ok: true,
      text: EXPECTED_SECTIONS.stage6,
    });
    expect(stageSections(TEMPLATE_CONVENTIONS, 'review2')).toEqual({
      ok: true,
      text: EXPECTED_SECTIONS.review2,
    });
    expect(sectionProblems(TEMPLATE_CONVENTIONS)).toEqual([]);
  });

  it('masalah per tahap menyebut heading dan tahapnya', () => {
    const without = TEMPLATE_CONVENTIONS.replace(TEMPLATE_SECTIONS.job, '## Antrean');
    expect(sectionProblems(without)).toEqual([
      missingSectionsMessage('stage6', ['## Job (pg-boss)']),
    ]);
    expect(missingSectionsMessage('review2', ['## Database', '## Pagination'])).toBe(
      'Bagian `## Database`, `## Pagination` tidak ada di `docs/conventions.md` template, padahal dibutuhkan review kedua. Perbarui salinan template atau sesuaikan daftar heading di `src/template/sections.ts`.',
    );
  });
});
