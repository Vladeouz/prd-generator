import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SettingsView } from '../../../src/app/settings/settings-view.tsx';
import { claudeProfile } from '../../../src/core/config/claude.ts';
import { missingSectionsMessage } from '../../../src/template/sections.ts';
import { profileSettings, type Settings } from '../../../src/template/settings.ts';

const PROFILES = profileSettings((profile) => claudeProfile(profile, {}));

const COMMIT = '0416d60c04bf650c3d517eb0197adc494ce1a8eb';

const render = (settings: Settings) => renderToStaticMarkup(<SettingsView settings={settings} />);

describe('SettingsView', () => {
  it('template valid: menampilkan TEMPLATE_DIR, commit, dan claude tanpa peringatan', () => {
    const html = render({
      templateDir: 'D:\\dev\\profil-a-template',
      templateCommit: COMMIT,
      claudeAvailable: true,
      claudeVersion: '2.1.296 (Claude Code)',
      claudeProfiles: PROFILES,
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
      claudeProfiles: PROFILES,
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
      claudeProfiles: PROFILES,
      problems: [problem],
    });
    expect(html).toContain(COMMIT);
    expect(html).toContain('Bermasalah');
    expect(html).toContain('Bagian `## Pagination` tidak ada di `docs/conventions.md` template');
    expect(html).toContain('Tahap 6 (PRD) dan 7 (TASKS) tidak bisa dijalankan');
  });

  /** HTML satu profil: dari penandanya sampai profil berikutnya (atau akhir). */
  const profileHtml = (html: string, profile: string) => {
    const start = html.indexOf(`data-testid="profile-${profile}"`);
    const next = html.indexOf('data-testid="profile-', start + 1);
    return html.slice(start, next === -1 ? undefined : next);
  };
  const row = (name: string, value: string) =>
    `${name}</dt><dd class="text-[13px] break-all"><span class="font-mono">${value}</span>`;

  it('model dan effort setiap profil beserta tahap yang memakainya (D-14)', () => {
    const html = render({
      templateDir: null,
      templateCommit: COMMIT,
      claudeAvailable: true,
      claudeVersion: '2.1.302 (Claude Code)',
      claudeProfiles: PROFILES,
      problems: [],
    });
    const standard = profileHtml(html, 'standard');
    const reasoning = profileHtml(html, 'reasoning');
    expect(standard).toContain(row('CLAUDE_MODEL', 'sonnet'));
    expect(standard).toContain(row('CLAUDE_EFFORT', 'low'));
    expect(standard).toContain(
      'Klarifikasi produk, Klarifikasi teknis, Struktur fitur, Review kritis, PRD, TASKS (daftar task), TASKS (detail per fase)',
    );
    expect(reasoning).toContain(row('CLAUDE_MODEL_REASONING', 'opus'));
    expect(reasoning).toContain(row('CLAUDE_EFFORT_REASONING', 'medium'));
    expect(reasoning).toContain('Dipakai tahap</dt><dd>Review kedua</dd>');
    expect(html).not.toContain('Tahap yang memakai profil ini tidak bisa dijalankan');
  });

  it('effort tidak valid: masalahnya tampil di profilnya, dan tahapnya tidak bisa dijalankan', () => {
    const profiles = profileSettings((profile) =>
      claudeProfile(profile, { CLAUDE_EFFORT_REASONING: 'sedang' }),
    );
    const html = render({
      templateDir: null,
      templateCommit: COMMIT,
      claudeAvailable: true,
      claudeVersion: '2.1.302 (Claude Code)',
      claudeProfiles: profiles,
      problems: [],
    });
    const reasoning = profileHtml(html, 'reasoning');
    expect(reasoning).toContain('Bermasalah');
    expect(reasoning).toContain('CLAUDE_EFFORT_REASONING tidak valid: &quot;sedang&quot;');
    expect(reasoning).toContain('Tahap yang memakai profil ini tidak bisa dijalankan');
    expect(profileHtml(html, 'standard')).not.toContain('Bermasalah');
  });

  it('nilai dari env proses yang berbeda dari bawaan: sumber dan peringatan tampil (T-041)', () => {
    const env = { CLAUDE_EFFORT: 'medium', CLAUDE_MODEL_REASONING: 'opus' };
    const profiles = profileSettings((profile) => claudeProfile(profile, env), {
      env,
      dotenv: { CLAUDE_MODEL_REASONING: 'opus' },
    });
    const html = render({
      templateDir: null,
      templateCommit: COMMIT,
      claudeAvailable: true,
      claudeVersion: '2.1.311 (Claude Code)',
      claudeProfiles: profiles,
      problems: [],
    });
    const standard = profileHtml(html, 'standard');
    expect(standard).toContain('Periksa');
    expect(standard).toContain(row('CLAUDE_EFFORT', 'medium'));
    expect(standard).toContain(
      'data-testid="source-CLAUDE_EFFORT">(variabel lingkungan proses)</span>',
    );
    expect(standard).toContain('data-testid="source-CLAUDE_MODEL">(bawaan)</span>');
    expect(standard).toContain('data-testid="warnings-standard"');
    expect(standard).toContain('CLAUDE_EFFORT=medium berasal dari variabel lingkungan proses');
    expect(standard).toContain('env -u CLAUDE_EFFORT pnpm start');
    expect(standard).not.toContain('role="alert"');
    // Sama dengan .env: tidak diperingatkan.
    const reasoning = profileHtml(html, 'reasoning');
    expect(reasoning).toContain('data-testid="source-CLAUDE_MODEL_REASONING">(.env)</span>');
    expect(reasoning).toContain('Valid');
    expect(reasoning).not.toContain('warnings-reasoning');
  });
});
