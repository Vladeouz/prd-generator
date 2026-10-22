// Runner CLI dengan proses sungguhan, tetapi perintahnya script Node palsu
// (test/helpers/fake-claude-cli.mjs), bukan `claude`.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { CliClaudeRunner, claudeArgs } from '../../../src/claude/cli-runner.ts';
import type { ClaudeProgress } from '../../../src/claude/types.ts';
import { ClaudeRunError } from '../../../src/claude/types.ts';

const FAKE_CLI = resolve('test/helpers/fake-claude-cli.mjs');
// Windows: satu string untuk cmd.exe; platform lain: script langsung (shebang) dengan array argumen.
const COMMAND = process.platform === 'win32' ? `"${process.execPath}" "${FAKE_CLI}"` : FAKE_CLI;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runner(
  mode: string,
  extra: Record<string, string> = {},
  timeoutMs?: number,
  model?: string,
) {
  return new CliClaudeRunner({
    command: COMMAND,
    env: { FAKE_CLAUDE_MODE: mode, ...extra },
    timeoutMs,
    model,
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

    // Di Windows, ini juga membuktikan tanda kutip string cmd.exe: `--tools ""` sampai sebagai
    // argumen kosong dan system prompt berspasi sebagai satu argumen.
    expect(received.argv).toEqual(claudeArgs({ model: 'sonnet', effort: 'low' }));
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

  it('model dari opsi runner sampai ke argumen', async () => {
    const result = await runner('ok', {}, undefined, 'claude-opus-5-5').run('x');
    expect((JSON.parse(result.result) as Received).argv).toEqual(
      claudeArgs({ model: 'claude-opus-5-5', effort: 'low' }),
    );
  });

  it('model dan effort per pemanggilan sampai ke argumen proses', async () => {
    const result = await runner('ok').run('x', { model: 'opus', effort: 'medium' });
    expect((JSON.parse(result.result) as Received).argv).toEqual(
      claudeArgs({ model: 'opus', effort: 'medium' }),
    );
    // Event `init` CLI palsu menyebut model dari `--model` (verifikasi manual T-035 memakai log ini).
    expect(result.initModel).toBe('opus-palsu');
  });

  it('stream: potongan teks diteruskan bertahap sebelum selesai, hasil dari event result', async () => {
    const fixture = resolve('test/fixtures/claude/stage2.json');
    const expected = JSON.parse(readFileSync(fixture, 'utf8')) as { result: string };
    const progress: { at: number; item: ClaudeProgress }[] = [];
    const started = performance.now();
    const result = await runner('fixture', {
      FAKE_CLAUDE_FIXTURE: fixture,
      FAKE_CLAUDE_CHUNK_SIZE: '500',
      FAKE_CLAUDE_CHUNK_DELAY_MS: '50',
    }).run('x', { onProgress: (item) => progress.push({ at: performance.now() - started, item }) });

    const texts = progress.flatMap(({ item }) => (item.kind === 'text' ? [item] : []));
    expect(texts.length).toBe(Math.ceil(expected.result.length / 500));
    expect(texts.map((t) => t.text).join('')).toBe(expected.result);
    expect(texts.at(-1)?.chars).toBe(expected.result.length);
    expect(progress[0]?.item).toEqual({ kind: 'thinking', estimatedTokens: 50 });
    // Potongan pertama datang jauh sebelum pemanggilan selesai.
    expect(progress.find(({ item }) => item.kind === 'text')?.at).toBeLessThan(
      result.durationMs - 100,
    );
    expect(result.result).toBe(expected.result);
    expect(result).toMatchObject({ inputTokens: 2 + 8112 + 16023, outputTokens: 1521 });
    expect(result.costUsd).toBeCloseTo(0.0985, 4);
  });

  it('stream tanpa event result → INVALID_ENVELOPE', async () => {
    const error = await failure(runner('no-result').run('x'));
    expect(error.code).toBe('INVALID_ENVELOPE');
    expect(error.message).toContain('tidak berisi event result');
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
