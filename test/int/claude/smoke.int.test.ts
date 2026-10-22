// `pnpm claude:smoke` (src/claude/smoke.ts) dengan script Node palsu sebagai perintah `claude`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const FAKE_CLI = resolve('test/helpers/fake-claude-cli.mjs');
const COMMAND = process.platform === 'win32' ? `"${process.execPath}" "${FAKE_CLI}"` : FAKE_CLI;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function smoke(envelope: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'prd-generator-smoke-'));
  dirs.push(dir);
  const fixture = join(dir, 'envelope.json');
  writeFileSync(fixture, JSON.stringify(envelope));
  return spawnSync(process.execPath, ['src/claude/smoke.ts', '--command', COMMAND], {
    encoding: 'utf8',
    env: { ...process.env, FAKE_CLAUDE_MODE: 'fixture', FAKE_CLAUDE_FIXTURE: fixture },
  });
}

describe('pnpm claude:smoke memakai profil standard (D-14)', () => {
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['src/claude/smoke.ts', '--command', COMMAND], {
      encoding: 'utf8',
      env: { ...process.env, FAKE_CLAUDE_MODE: 'ok', ...env },
    });

  it('model dan effort dari CLAUDE_MODEL dan CLAUDE_EFFORT, bukan profil reasoning', () => {
    const result = run({
      CLAUDE_MODEL: 'claude-sonnet-5-5',
      CLAUDE_EFFORT: 'medium',
      CLAUDE_MODEL_REASONING: 'opus',
      CLAUDE_EFFORT_REASONING: 'high',
    });
    expect(result.stdout).toContain('profil standard: model claude-sonnet-5-5, effort medium');
    // Mode `ok` CLI palsu membalas argumen yang diterimanya.
    expect(result.stdout).toContain('"--model","claude-sonnet-5-5","--effort","medium"');
  });

  it('effort tidak valid: gagal sebelum memanggil claude, dengan nama variabelnya', () => {
    const result = run({ CLAUDE_EFFORT: 'sedang' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLAUDE_EFFORT tidak valid: "sedang"');
    expect(result.stdout).not.toContain('Menunggu Claude Code');
  });
});

describe('pnpm claude:smoke saat gagal', () => {
  it('menampilkan result dari envelope secara utuh, bukan hanya cuplikan', () => {
    const result = `Invalid API key · Please run /login\n${'detail '.repeat(100)}akhir pesan`;
    const run = smoke({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('GAGAL [IS_ERROR]');
    expect(run.stderr).toContain(`result (utuh dari envelope):\n${result}`);
  });

  it('tanpa baris result bila stdout bukan envelope', () => {
    const run = spawnSync(process.execPath, ['src/claude/smoke.ts', '--command', COMMAND], {
      encoding: 'utf8',
      env: { ...process.env, FAKE_CLAUDE_MODE: 'bad-json' },
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('GAGAL [INVALID_ENVELOPE]');
    expect(run.stderr).not.toContain('result (utuh dari envelope)');
  });
});
