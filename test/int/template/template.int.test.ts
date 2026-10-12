import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkClaude, getSettings } from '../../../src/template/settings.ts';
import { readTemplate } from '../../../src/template/template.ts';

// Isi konvensi dengan CRLF, Unicode, dan spasi di akhir untuk membuktikan dibaca apa adanya.
const CONVENTIONS = '# Konvensi Proyek\r\n\r\n- Teks UI dalam Bahasa Indonesia ✓  \r\n- é\n';
const FAKE_CLAUDE = `"${process.execPath}" "${resolve('test/helpers/fake-claude-cli.mjs')}"`;

let dir: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd: dir,
    encoding: 'utf8',
  }).trim();

/** Folder template buatan: repo Git dengan kedua file penanda, sudah di-commit. */
function makeTemplate() {
  mkdirSync(join(dir, 'docs'));
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'docs', 'conventions.md'), CONVENTIONS);
  writeFileSync(join(dir, 'scripts', 'init-project.mjs'), '// init\n');
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('add', '.');
  git('commit', '-q', '-m', 'awal');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'prd-generator-template-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('readTemplate', () => {
  it('membaca docs/conventions.md apa adanya dan commit Git saat ini', async () => {
    makeTemplate();
    const result = await readTemplate(dir);
    expect(result).toEqual({
      ok: true,
      template: { dir, conventions: CONVENTIONS, commit: git('rev-parse', 'HEAD') },
    });
  });

  it('commit mengikuti HEAD terbaru', async () => {
    makeTemplate();
    const first = git('rev-parse', 'HEAD');
    writeFileSync(join(dir, 'docs', 'conventions.md'), `${CONVENTIONS}- aturan baru\n`);
    git('commit', '-q', '-am', 'kedua');
    const result = await readTemplate(dir);
    expect(result.ok && result.template.commit).toBe(git('rev-parse', 'HEAD'));
    expect(result.ok && result.template.commit).not.toBe(first);
  });

  it.each([
    ['docs/conventions.md', ['docs', 'conventions.md']],
    ['scripts/init-project.mjs', ['scripts', 'init-project.mjs']],
  ])('menolak folder tanpa %s', async (marker, path) => {
    makeTemplate();
    unlinkSync(join(dir, ...path));
    const result = await readTemplate(dir);
    expect(result).toEqual({
      ok: false,
      problems: [`\`${marker}\` tidak ada di ${dir}; folder ini bukan repo template.`],
    });
  });

  it('menolak folder tanpa kedua file penanda (folder proyek biasa)', async () => {
    writeFileSync(join(dir, 'README.md'), '# proyek lain\n');
    git('init', '-q');
    const result = await readTemplate(dir);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join('\n')).toMatch(/conventions\.md[\s\S]*init-project/);
  });

  it('menolak folder yang bukan repo Git', async () => {
    mkdirSync(join(dir, 'docs'));
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'docs', 'conventions.md'), CONVENTIONS);
    writeFileSync(join(dir, 'scripts', 'init-project.mjs'), '');
    const result = await readTemplate(dir);
    expect(!result.ok && result.problems[0]).toMatch(/Commit Git .* tidak terbaca/);
  });

  it.each([
    [undefined, /belum diisi/],
    ['   ', /belum diisi/],
    ['profil-a-template', /bukan path absolut/],
  ])('menolak TEMPLATE_DIR %j', async (value, pattern) => {
    const result = await readTemplate(value);
    expect(!result.ok && result.problems[0]).toMatch(pattern);
  });

  it('menolak folder yang tidak ada', async () => {
    const result = await readTemplate(join(dir, 'tidak-ada'));
    expect(!result.ok && result.problems[0]).toMatch(/tidak ditemukan/);
  });
});

describe('getSettings', () => {
  it('template valid: commit terisi, tanpa masalah', async () => {
    makeTemplate();
    const settings = await getSettings({
      templateDir: dir,
      checkClaude: () => checkClaude(FAKE_CLAUDE),
    });
    expect(settings).toEqual({
      templateDir: dir,
      templateCommit: git('rev-parse', 'HEAD'),
      claudeAvailable: true,
      claudeVersion: '9.9.9 (Claude Code palsu)',
      problems: [],
    });
  });

  it('template tidak valid dan claude tidak ada: masalah dilaporkan', async () => {
    const settings = await getSettings({
      templateDir: dir,
      checkClaude: () => checkClaude('perintah-claude-yang-tidak-ada'),
    });
    expect(settings).toMatchObject({
      templateDir: dir,
      templateCommit: null,
      claudeAvailable: false,
      claudeVersion: null,
    });
    expect(settings.problems.length).toBeGreaterThan(0);
  });

  it('checkClaude menolak perintah `claude` sungguhan saat NODE_ENV=test', () => {
    expect(() => checkClaude()).toThrow(/NODE_ENV=test/);
  });
});
