// Pemeriksaan prasyarat lingkungan (PRD bagian 3, Prasyarat lingkungan), dipakai scripts/prereq.mjs.
// Dipisah dari script agar bisa di-unit-test dengan folder sementara. Semua fungsi hanya membaca;
// tidak ada yang membuat atau mengubah file.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parseEnv } from 'node:util';

export const OK = 'OK';
export const FAIL = 'GAGAL';

/** File yang menandai salinan lokal repo template (PRD bagian 3). */
export const TEMPLATE_MARKERS = ['docs/conventions.md', 'scripts/init-project.mjs'];

/** Menjalankan perintah lewat shell agar `.cmd` (pnpm, claude) ikut ditemukan di Windows. */
export function run(command, cwd, timeoutMs = 30_000) {
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    cwd,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { ok: result.status === 0 && !result.error, output };
}

export function firstLine(text) {
  return text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
}

export function checkNode(root, version = process.versions.node) {
  const expected = readFileSync(join(root, '.nvmrc'), 'utf8').trim();
  if (version.split('.')[0] === expected) {
    return { status: OK, detail: `v${version}` };
  }
  return {
    status: FAIL,
    detail: `v${version}, dibutuhkan ${expected}.x`,
    fix: `Pasang Node.js ${expected} LTS (misalnya \`nvm install ${expected}\` lalu \`nvm use ${expected}\`).`,
  };
}

export function checkPnpm(root) {
  const { packageManager } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const expected = packageManager.replace(/^pnpm@/, '').split('+')[0];
  const fix = `Jalankan \`corepack enable\` lalu \`corepack prepare pnpm@${expected} --activate\`.`;
  const result = run('pnpm --version', root);
  if (!result.ok) {
    return { status: FAIL, detail: 'pnpm tidak ditemukan', fix };
  }
  const actual = firstLine(result.output);
  if (actual !== expected) {
    return { status: FAIL, detail: `${actual}, dibutuhkan ${expected}`, fix };
  }
  return { status: OK, detail: actual };
}

export function checkGit(root) {
  const result = run('git --version', root);
  if (!result.ok) {
    return {
      status: FAIL,
      detail: 'git tidak ditemukan',
      fix: 'Pasang Git dari https://git-scm.com.',
    };
  }
  return { status: OK, detail: firstLine(result.output).replace(/^git version /, '') };
}

/** Hanya memeriksa perintah `claude` ada; login tidak bisa diperiksa tanpa memakai kuota. */
export function checkClaude(root) {
  const result = run('claude --version', root);
  if (!result.ok) {
    return {
      status: FAIL,
      detail: 'perintah `claude` tidak ditemukan',
      fix: 'Pasang Claude Code (https://docs.claude.com/en/docs/claude-code), lalu login dengan `claude`.',
    };
  }
  return { status: OK, detail: firstLine(result.output) };
}

export function checkEnvFile(root) {
  if (existsSync(join(root, '.env'))) {
    return { status: OK, detail: 'ada' };
  }
  return {
    status: FAIL,
    detail: 'tidak ada',
    fix:
      'Buat sendiri dengan `copy .env.example .env` (CMD/PowerShell) atau `cp .env.example .env` ' +
      '(Git Bash), lalu isi `TEMPLATE_DIR`.',
  };
}

/**
 * Nilai `TEMPLATE_DIR`: variabel lingkungan proses lebih dulu, lalu `.env`, sama dengan urutan
 * Next.js memuat env.
 *
 * @param {string} root
 * @param {Record<string, string | undefined>} env
 */
export function readTemplateDir(root, env = process.env) {
  if (env.TEMPLATE_DIR) {
    return { value: env.TEMPLATE_DIR, source: 'variabel lingkungan' };
  }
  const envFile = join(root, '.env');
  if (!existsSync(envFile)) {
    return { value: '', source: null };
  }
  const value = parseEnv(readFileSync(envFile, 'utf8')).TEMPLATE_DIR ?? '';
  return { value: value.trim(), source: '.env' };
}

const isDirectory = (path) => existsSync(path) && statSync(path).isDirectory();

/**
 * @param {string} root
 * @param {Record<string, string | undefined>} env
 */
export function checkTemplateDir(root, env = process.env) {
  const { value, source } = readTemplateDir(root, env);
  const example = 'misalnya `TEMPLATE_DIR=D:\\dev\\profil-a-template`';
  if (!value) {
    return {
      status: FAIL,
      detail: source ? `kosong di ${source}` : 'belum diisi (`.env` tidak ada)',
      fix: `Isi \`TEMPLATE_DIR\` di \`.env\` dengan path absolut salinan lokal repo template, ${example}.`,
    };
  }
  if (!isAbsolute(value)) {
    return {
      status: FAIL,
      detail: `${value} bukan path absolut`,
      fix: `Pakai path absolut, ${example}.`,
    };
  }
  if (!isDirectory(value)) {
    return {
      status: FAIL,
      detail: `${value} tidak ditemukan`,
      fix:
        'Clone template dengan `git clone https://github.com/Vladeouz/profil-a-template.git`, ' +
        'lalu arahkan `TEMPLATE_DIR` ke folder itu.',
    };
  }
  const missing = TEMPLATE_MARKERS.filter((marker) => !existsSync(join(value, marker)));
  if (missing.length > 0) {
    return {
      status: FAIL,
      detail: `${value} bukan repo template (tidak ada ${missing.join(', ')})`,
      fix: `Arahkan \`TEMPLATE_DIR\` ke salinan lokal profil-a-template, ${example}.`,
    };
  }
  const commit = run('git rev-parse --short HEAD', value);
  const at = commit.ok ? `commit ${firstLine(commit.output)}` : 'commit tidak terbaca';
  return { status: OK, detail: `${value} (${at})` };
}

/** Path Chromium yang dipakai `@playwright/test` di proyek ini, atau null bila tidak terbaca. */
export function playwrightChromiumPath(root) {
  const code =
    "const { chromium } = await import('@playwright/test'); console.log(chromium.executablePath());";
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  return result.status === 0 ? firstLine(result.stdout ?? '').trim() || null : null;
}

/** Browser untuk test end-to-end (`pnpm test:e2e`, bagian dari `pnpm check`). */
export function checkPlaywrightBrowser(root, executablePath = playwrightChromiumPath(root)) {
  if (executablePath && existsSync(executablePath)) {
    return { status: OK, detail: 'Chromium terpasang' };
  }
  return {
    status: FAIL,
    detail: 'Chromium untuk Playwright belum terpasang',
    fix: 'Jalankan `pnpm exec playwright install chromium` (sekali per mesin, setelah `pnpm install`).',
  };
}

export function prereqChecks(root) {
  return [
    { name: 'Node.js', run: () => checkNode(root) },
    { name: 'pnpm', run: () => checkPnpm(root) },
    { name: 'Git', run: () => checkGit(root) },
    { name: 'Claude Code', run: () => checkClaude(root) },
    { name: 'File .env', run: () => checkEnvFile(root) },
    { name: 'TEMPLATE_DIR', run: () => checkTemplateDir(root) },
    { name: 'Browser Playwright', run: () => checkPlaywrightBrowser(root) },
  ];
}
