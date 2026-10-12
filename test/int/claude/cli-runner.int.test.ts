// Runner CLI dengan proses sungguhan, tetapi perintahnya script Node palsu
// (test/helpers/fake-claude-cli.mjs), bukan `claude`.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { CLAUDE_ARGS, CliClaudeRunner } from '../../../src/claude/cli-runner.ts';
import { ClaudeRunError } from '../../../src/claude/types.ts';

const FAKE_CLI = resolve('test/helpers/fake-claude-cli.mjs');
// Windows: satu string untuk cmd.exe; platform lain: script langsung (shebang) dengan array argumen.
const COMMAND = process.platform === 'win32' ? `"${process.execPath}" "${FAKE_CLI}"` : FAKE_CLI;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runner(mode: string, extra: Record<string, string> = {}, timeoutMs?: number) {
  return new CliClaudeRunner({
    command: COMMAND,
    env: { FAKE_CLAUDE_MODE: mode, ...extra },
    timeoutMs,
  });
}

async function failure(promise: Promise<unknown>): Promise<ClaudeRunError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ClaudeRunError) return error;
    throw error;
  }
  throw new Error('tidak gagal');
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

type Received = { argv: string[]; stdin: string; cwd: string; cwdEntries: string[] };

describe('CliClaudeRunner dengan perintah palsu', () => {
  it('mengirim prompt lewat stdin dengan argumen PRD, di folder sementara kosong yang lalu dihapus', async () => {
    // Karakter khusus shell dan teks multi-baris: hanya aman bila tidak lewat argumen.
    const prompt = 'Halo "dunia" & <tes> | %PATH% $HOME `x`\nbaris kedua ✓ é';
    const result = await runner('ok').run(prompt);
    const received = JSON.parse(result.result) as Received;

    expect(received.argv).toEqual([...CLAUDE_ARGS]);
    expect(received.stdin).toBe(prompt);
    expect(received.argv.join(' ')).not.toContain('Halo');
    expect(dirname(received.cwd)).toBe(tmpdir());
    expect(basename(received.cwd)).toMatch(/^prd-generator-claude-/);
    expect(received.cwdEntries).toEqual([]);
    expect(existsSync(received.cwd)).toBe(false);
  });

  it('membaca result, token, biaya, dan durasi dari envelope', async () => {
    const result = await runner('ok').run('x');
    expect(result).toMatchObject({ inputTokens: 1103, outputTokens: 42, costUsd: 0.0123 });
    expect(result.durationMs).toBeGreaterThan(0);
    expect(JSON.parse(result.rawEnvelope).session_id).toBe('fake');
  });

  it('prompt besar (±300 KB) terkirim utuh', async () => {
    const prompt = 'PRD '.repeat(75_000);
    const received = JSON.parse((await runner('ok').run(prompt)).result) as Received;
    expect(received.stdin).toBe(prompt);
  });

  it('exit code bukan 0 → EXIT_CODE dengan kode dan stderr', async () => {
    const error = await failure(runner('exit').run('x'));
    expect(error.code).toBe('EXIT_CODE');
    expect(error.details.exitCode).toBe(3);
    expect(error.message).toBe('Claude Code keluar dengan kode 3: Error: kuota habis (palsu)');
  });

  it.each(['bad-json', 'bad-envelope'])('%s → INVALID_ENVELOPE', async (mode) => {
    expect((await failure(runner(mode).run('x'))).code).toBe('INVALID_ENVELOPE');
  });

  it('is_error → IS_ERROR dengan pesan dari Claude Code', async () => {
    const error = await failure(runner('is-error').run('x'));
    expect(error.code).toBe('IS_ERROR');
    expect(error.message).toContain('Please run /login');
  });

  it('melewati batas waktu → TIMEOUT, proses (termasuk turunan shell) dihentikan, folder dihapus', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prd-generator-pid-'));
    dirs.push(dir);
    const pidFile = join(dir, 'pid');

    const error = await failure(runner('hang', { FAKE_CLAUDE_PID_FILE: pidFile }, 1500).run('x'));

    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toContain('batas waktu');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    for (let i = 0; i < 20 && isAlive(pid); i++) await sleep(100);
    expect(isAlive(pid)).toBe(false);
  });

  it('perintah yang tidak ada → gagal dengan pesan, bukan menggantung', async () => {
    const error = await failure(
      new CliClaudeRunner({ command: 'perintah-yang-tidak-ada-xyz' }).run('x'),
    );
    expect(['EXIT_CODE', 'SPAWN_FAILED']).toContain(error.code);
  });
});
