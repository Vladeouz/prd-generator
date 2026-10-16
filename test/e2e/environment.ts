// Lingkungan test end-to-end: satu folder sementara per `pnpm test:e2e`, berisi database, repo
// template buatan, folder proyek turunan template sebagai tujuan export, penanda runner palsu, dan
// shim `claude` yang gagal keras (NFR-02). Dibuat sekali di proses utama Playwright
// (playwright.config.ts); proses worker membaca path-nya dari `PRD_E2E_DIR`.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PREFIX = 'prd-generator-e2e-';
// Sama dengan PLACEHOLDER_MARKER di src/projects/export.ts. Tidak diimpor: kode aplikasi (class dengan
// static field) tidak bisa dimuat transform TypeScript Playwright saat membaca config.
const PLACEHOLDER_MARKER = '> Placeholder dari `pnpm init-project`.';

export type E2eEnvironment = {
  dir: string;
  databasePath: string;
  templateDir: string;
  /** Folder proyek turunan template (sudah `pnpm init-project`), repo Git yang bersih. */
  targetDir: string;
  stateDir: string;
  /** Berisi `claude` dan `claude.cmd` yang gagal keras; diletakkan paling depan di PATH server. */
  binDir: string;
};

export function e2eEnvironment(dir: string): E2eEnvironment {
  return {
    dir,
    databasePath: join(dir, 'prd-generator.db'),
    templateDir: join(dir, 'template'),
    targetDir: join(dir, 'proyek'),
    stateDir: join(dir, 'state'),
    binDir: join(dir, 'bin'),
  };
}

function gitRepo(dir: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
      cwd: dir,
      stdio: 'ignore',
    });
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  git('add', '.');
  git('commit', '-q', '-m', 'awal');
}

const REFUSE = 'claude sungguhan dilarang di test end-to-end (NFR-02); pakai CLAUDE_COMMAND palsu.';

/** Membuat folder lingkungan baru; folder sisa run sebelumnya dihapus bila bisa. */
export function prepareE2eEnvironment(): E2eEnvironment {
  for (const name of readdirSync(tmpdir())) {
    if (name.startsWith(PREFIX)) removeDir(join(tmpdir(), name));
  }
  const env = e2eEnvironment(mkdtempSync(join(tmpdir(), PREFIX)));
  mkdirSync(env.stateDir);
  mkdirSync(env.binDir);
  writeFileSync(join(env.binDir, 'claude.cmd'), `@echo ${REFUSE} 1>&2\r\n@exit /b 97\r\n`);
  writeFileSync(join(env.binDir, 'claude'), `#!/bin/sh\necho "${REFUSE}" >&2\nexit 97\n`);
  chmodSync(join(env.binDir, 'claude'), 0o755);
  gitRepo(env.templateDir, {
    'docs/conventions.md': '# Konvensi Proyek\n\n- Clean Architecture per fitur\n',
    'scripts/init-project.mjs': '// init\n',
  });
  gitRepo(env.targetDir, {
    'scripts/init-project.mjs': '// init\n',
    '.firebaserc': '{ "projects": { "default": "uji-e2e" } }\n',
    'docs/PRD.md': `# PRD\n\n${PLACEHOLDER_MARKER}\n`,
    'docs/TASKS.md': `# TASKS\n\n${PLACEHOLDER_MARKER}\n`,
  });
  return env;
}

/** Best effort: di Windows file database bisa masih dipegang server yang belum berhenti. */
export function removeDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {}
}
