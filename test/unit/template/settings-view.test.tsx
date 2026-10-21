import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsView } from '../../../src/app/settings/settings-view.tsx';
import { missingSectionsMessage } from '../../../src/template/sections.ts';
import type { Settings } from '../../../src/template/settings.ts';

const COMMIT = '0416d60c04bf650c3d517eb0197adc494ce1a8eb';

const render = (settings: Settings) => renderToStaticMarkup(<SettingsView settings={settings} />);

describe('SettingsView', () => {
  it('template valid: menampilkan TEMPLATE_DIR, commit, dan claude tanpa peringatan', () => {
    const html = render({
      templateDir: 'D:\\dev\\profil-a-template',
      templateCommit: COMMIT,
      claudeAvailable: true,
      claudeVersion: '2.1.296 (Claude Code)',
      problems: [],
    });
    expect(html).toContain('D:\\dev\\profil-a-template');
    expect(html).toContain(COMMIT);
    expect(html).toContain('Valid');
    expect(html).toContain('Tersedia (2.1.296 (Claude Code))');
    expect(html).not.toContain('id="template-problems"');
  });

  it('template bermasalah: menampilkan masalah dan bahwa tahap 6–7 tidak bisa dijalankan', () => {
    const html = render({
      templateDir: null,
      templateCommit: null,
      claudeAvailable: false,
      claudeVersion: null,
      problems: ['`TEMPLATE_DIR` belum diisi di `.env`.'],
    });
    expect(html).toContain('belum diisi');
    expect(html).toContain('Bermasalah');
    expect(html).toContain('`TEMPLATE_DIR` belum diisi di `.env`.');
    expect(html).toContain('Tahap 6 (PRD) dan 7 (TASKS) tidak bisa dijalankan');
    expect(html).toContain('Tidak tersedia: perintah `claude` tidak ditemukan.');
  });

  it('heading konvensi yang dibutuhkan tidak ada: masalahnya tampil, commit tetap terlihat', () => {
    const problem = missingSectionsMessage('stage6', ['## Pagination']);
    const html = render({
      templateDir: 'D:\\dev\\profil-a-template',
      templateCommit: COMMIT,
      claudeAvailable: true,
      claudeVersion: '2.1.302 (Claude Code)',
      problems: [problem],
    });
    expect(html).toContain(COMMIT);
    expect(html).toContain('Bermasalah');
    expect(html).toContain('Bagian `## Pagination` tidak ada di `docs/conventions.md` template');
    expect(html).toContain('Tahap 6 (PRD) dan 7 (TASKS) tidak bisa dijalankan');
  });
});
