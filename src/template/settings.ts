// Data halaman pengaturan dan `GET /api/settings` (FR-11).
import { spawn } from 'node:child_process';
import { isRealClaudeCommand } from '../claude/cli-runner.ts';
import { readTemplate } from './template.ts';

export type ClaudeAvailability = { available: boolean; version: string | null };

export type Settings = {
  templateDir: string | null;
  templateCommit: string | null;
  claudeAvailable: boolean;
  claudeVersion: string | null;
  /** Masalah yang membuat tahap 6–7 tidak bisa dijalankan; kosong bila template valid. */
  problems: string[];
};

/** Menjalankan `<command> --version` (tidak memakai kuota). Test wajib memakai perintah palsu. */
export function checkClaude(command = 'claude', timeoutMs = 15_000): Promise<ClaudeAvailability> {
  if (process.env.NODE_ENV === 'test' && isRealClaudeCommand(command)) {
    throw new Error(
      'checkClaude() dengan perintah `claude` sungguhan dilarang saat NODE_ENV=test.',
    );
  }
  return new Promise((resolve) => {
    const child = spawn(`${command} --version`, {
      shell: true,
      windowsHide: true,
      timeout: timeoutMs,
    });
    let stdout = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', () => resolve({ available: false, version: null }));
    child.on('close', (code) => {
      const version = stdout.trim().split(/\r?\n/)[0] ?? '';
      resolve(
        code === 0 && version ? { available: true, version } : { available: false, version: null },
      );
    });
  });
}

export type SettingsDeps = {
  templateDir: string | undefined;
  checkClaude: () => Promise<ClaudeAvailability>;
};

export async function getSettings(
  deps: SettingsDeps = { templateDir: process.env.TEMPLATE_DIR, checkClaude: () => checkClaude() },
): Promise<Settings> {
  const [template, claude] = await Promise.all([
    readTemplate(deps.templateDir),
    deps.checkClaude(),
  ]);
  return {
    templateDir: deps.templateDir?.trim() || null,
    templateCommit: template.ok ? template.template.commit : null,
    claudeAvailable: claude.available,
    claudeVersion: claude.version,
    problems: template.ok ? [] : template.problems,
  };
}
