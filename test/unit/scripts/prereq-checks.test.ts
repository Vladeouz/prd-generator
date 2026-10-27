import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkClaudeProfiles,
  checkEnvFile,
  checkNode,
  checkPlaywrightBrowser,
  checkTemplateDir,
  FAIL,
  OK,
  readTemplateDir,
  WARN,
} from '../../../scripts/lib/prereq-checks.mjs';

let root: string;
let other: string;

function makeTemplate(dir: string) {
  mkdirSync(join(dir, 'docs'), { recursive: true });
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'conventions.md'), '# Konvensi\n');
  writeFileSync(join(dir, 'scripts', 'init-project.mjs'), '');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'prereq-root-'));
  other = mkdtempSync(join(tmpdir(), 'prereq-template-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(other, { recursive: true, force: true });
});

describe('checkNode', () => {
  it('membandingkan major version dengan .nvmrc', () => {
    writeFileSync(join(root, '.nvmrc'), '24\n');
    expect(checkNode(root, '24.1.0').status).toBe(OK);
    const result = checkNode(root, '22.9.0');
    expect(result.status).toBe(FAIL);
    expect(result.detail).toContain('dibutuhkan 24.x');
  });
});

describe('checkEnvFile', () => {
  it('gagal dengan saran menyalin .env.example bila .env belum ada', () => {
    const result = checkEnvFile(root);
    expect(result.status).toBe(FAIL);
    expect(result.fix).toContain('copy .env.example .env');
  });

  it('OK bila .env ada', () => {
    writeFileSync(join(root, '.env'), '');
    expect(checkEnvFile(root).status).toBe(OK);
  });
});

describe('readTemplateDir', () => {
  it('memakai variabel lingkungan sebelum .env', () => {
    writeFileSync(join(root, '.env'), 'TEMPLATE_DIR=/dari/env-file\n');
    expect(readTemplateDir(root, { TEMPLATE_DIR: '/dari/proses' }).value).toBe('/dari/proses');
    expect(readTemplateDir(root, {}).value).toBe('/dari/env-file');
  });
});

describe('checkTemplateDir', () => {
  it('gagal bila .env tidak ada dan variabel lingkungan kosong', () => {
    const result = checkTemplateDir(root, {});
    expect(result.status).toBe(FAIL);
    expect(result.detail).toContain('.env');
  });

  it('gagal bila TEMPLATE_DIR kosong di .env', () => {
    writeFileSync(join(root, '.env'), 'TEMPLATE_DIR=\n');
    const result = checkTemplateDir(root, {});
    expect(result.status).toBe(FAIL);
    expect(result.detail).toBe('kosong di .env');
  });

  it('gagal bila path relatif', () => {
    const result = checkTemplateDir(root, { TEMPLATE_DIR: 'profil-a-template' });
    expect(result.status).toBe(FAIL);
    expect(result.detail).toContain('bukan path absolut');
  });

  it('gagal bila folder tidak ada', () => {
    const result = checkTemplateDir(root, { TEMPLATE_DIR: join(other, 'tidak-ada') });
    expect(result.status).toBe(FAIL);
    expect(result.detail).toContain('tidak ditemukan');
  });

  it('gagal dan menyebut file yang hilang bila folder bukan repo template', () => {
    mkdirSync(join(other, 'docs'));
    writeFileSync(join(other, 'docs', 'conventions.md'), '');
    writeFileSync(join(root, '.env'), `TEMPLATE_DIR=${other}\n`);
    const result = checkTemplateDir(root, {});
    expect(result.status).toBe(FAIL);
    expect(result.detail).toContain('bukan repo template');
    expect(result.detail).toContain('scripts/init-project.mjs');
    expect(result.detail).not.toContain('docs/conventions.md');
  });

  it('OK bila folder berisi docs/conventions.md dan scripts/init-project.mjs', () => {
    makeTemplate(other);
    writeFileSync(join(root, '.env'), `TEMPLATE_DIR=${other}\n`);
    const result = checkTemplateDir(root, {});
    expect(result.status).toBe(OK);
    expect(result.detail).toContain(other);
  });
});

describe('checkPlaywrightBrowser', () => {
  it('OK bila file Chromium ada', () => {
    const browser = join(root, 'chrome.exe');
    writeFileSync(browser, '');
    expect(checkPlaywrightBrowser(root, browser).status).toBe(OK);
  });

  it('gagal dengan saran install bila Chromium belum ada atau path tidak terbaca', () => {
    for (const path of [join(root, 'tidak-ada.exe'), null]) {
      const result = checkPlaywrightBrowser(root, path);
      expect(result.status).toBe(FAIL);
      expect(result.fix).toContain('pnpm exec playwright install chromium');
    }
  });
});

describe('checkClaudeProfiles (T-041)', () => {
  it('OK bila profil kosong atau sama dengan .env', () => {
    expect(checkClaudeProfiles(root, {}).status).toBe(OK);
    writeFileSync(join(root, '.env'), 'CLAUDE_EFFORT=high\n');
    expect(checkClaudeProfiles(root, { CLAUDE_EFFORT: 'high' }).status).toBe(OK);
  });

  it('OK bila nilai env proses sama dengan bawaan', () => {
    expect(checkClaudeProfiles(root, { CLAUDE_MODEL: 'sonnet', CLAUDE_EFFORT: 'low' }).status).toBe(
      OK,
    );
  });

  it('PERINGATAN, bukan gagal, bila env proses berbeda dari bawaan dan dari .env', () => {
    writeFileSync(join(root, '.env'), 'CLAUDE_EFFORT=low\n');
    const result = checkClaudeProfiles(root, { CLAUDE_EFFORT: 'medium', CLAUDE_MODEL: 'opus' });
    expect(result.status).toBe(WARN);
    expect(result.detail).toBe('2 nilai dari variabel lingkungan proses');
    expect(result.fix).toContain('CLAUDE_MODEL=opus berasal dari variabel lingkungan proses');
    expect(result.fix).toContain('env -u CLAUDE_EFFORT pnpm start');
  });
});
