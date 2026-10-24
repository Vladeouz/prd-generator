import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_SYSTEM_PROMPT,
  CliClaudeRunner,
  claudeArgs,
  isRealClaudeCommand,
  spawnSpec,
} from '../../../src/claude/cli-runner.ts';
import type { ClaudeProgress } from '../../../src/claude/types.ts';
import { ClaudeRunError } from '../../../src/claude/types.ts';

// Bentuk perintah final dari spike T-022 (docs/logs/T-022.md, Rekomendasi akhir).
const EXPECTED_ARGS = [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--max-turns',
  '1',
  '--model',
  'sonnet',
  '--effort',
  'low',
  '--system-prompt',
  CLAUDE_SYSTEM_PROMPT,
  '--tools',
  '',
  '--strict-mcp-config',
  '--setting-sources',
  'project',
  '--disable-slash-commands',
  '--no-session-persistence',
];
const SONNET_LOW = { model: 'sonnet', effort: 'low' };

describe('claudeArgs', () => {
  it('model, effort, pengurang overhead, dan stream-json; tanpa flag yang tidak berpengaruh', () => {
    expect(claudeArgs(SONNET_LOW)).toEqual(EXPECTED_ARGS);
    expect(claudeArgs({ model: 'claude-opus-5-5', effort: 'medium' })).toEqual(
      EXPECTED_ARGS.with(8, 'claude-opus-5-5').with(10, 'medium'),
    );
    for (const unused of ['--safe-mode', '--settings', '--bare', '--output-format=json']) {
      expect(claudeArgs(SONNET_LOW)).not.toContain(unused);
    }
  });

  it('system prompt aman untuk string cmd.exe', () => {
    expect(CLAUDE_SYSTEM_PROMPT).not.toMatch(/["%!^&|<>\r\n]/);
  });
});

describe('spawnSpec', () => {
  it('Windows: satu string dengan shell; argumen kosong dan berspasi diberi tanda kutip', () => {
    expect(spawnSpec('claude', 'win32', SONNET_LOW)).toEqual({
      file:
        'claude -p --output-format stream-json --verbose --include-partial-messages --max-turns 1 ' +
        `--model sonnet --effort low --system-prompt "${CLAUDE_SYSTEM_PROMPT}" --tools "" ` +
        '--strict-mcp-config --setting-sources project --disable-slash-commands --no-session-persistence',
      args: [],
      shell: true,
    });
  });

  it.each(['linux', 'darwin'] as const)('%s: array argumen tanpa shell', (platform) => {
    expect(spawnSpec('claude', platform, SONNET_LOW)).toEqual({
      file: 'claude',
      args: EXPECTED_ARGS,
      shell: false,
    });
  });

  it('Windows: model dan effort profil reasoning disusun ke string perintah', () => {
    expect(spawnSpec('claude', 'win32', { model: 'opus', effort: 'medium' }).file).toContain(
      ' --model opus --effort medium --system-prompt ',
    );
  });

  it('non-Windows: model dan effort profil reasoning disusun ke array argumen', () => {
    expect(spawnSpec('claude', 'linux', { model: 'opus', effort: 'medium' }).args).toEqual(
      EXPECTED_ARGS.with(8, 'opus').with(10, 'medium'),
    );
  });
});

describe('isRealClaudeCommand', () => {
  it.each([
    'claude',
    'CLAUDE',
    'claude.cmd',
    'claude.exe',
    'C:\\Users\\x\\AppData\\Roaming\\npm\\claude.cmd',
    '"C:\\Program Files\\Claude\\claude.exe"',
    '/usr/local/bin/claude',
    'claude --verbose',
  ])('%s → ya', (command) => {
    expect(isRealClaudeCommand(command)).toBe(true);
  });

  it.each([
    'node test/helpers/fake-claude-cli.mjs',
    '"C:\\Program Files\\nodejs\\node.exe" "D:\\x\\fake-claude-cli.mjs"',
    'fake-claude',
    'claude-palsu',
  ])('%s → tidak', (command) => {
    expect(isRealClaudeCommand(command)).toBe(false);
  });
});

type SpawnCall = { file: string; argsOrOptions: unknown; options: unknown };

/** spawn palsu: mencatat pemanggilan dan mengembalikan proses yang langsung menulis envelope. */
function fakeSpawn(calls: SpawnCall[], stdinChunks: string[]) {
  return ((file: string, argsOrOptions: unknown, options?: unknown) => {
    calls.push({ file, argsOrOptions, options });
    const child = Object.assign(new EventEmitter(), {
      pid: 123,
      exitCode: null,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    child.stdin.on('data', (chunk) => stdinChunks.push(String(chunk)));
    child.stdin.on('finish', () => {
      const delta = (text: string) =>
        JSON.stringify({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
        });
      child.stdout.write(`${delta('o')}\n`);
      child.stdout.write(`${delta('k')}\n`);
      child.stdout.end(
        JSON.stringify({
          type: 'result',
          is_error: false,
          result: 'ok',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
      child.stdout.on('end', () => child.emit('close', 0));
      child.stdout.resume();
    });
    return child;
  }) as unknown as typeof spawn;
}

describe('CliClaudeRunner', () => {
  it('menolak perintah `claude` sungguhan saat NODE_ENV=test tanpa menjalankan proses', async () => {
    const calls: SpawnCall[] = [];
    const runner = new CliClaudeRunner({ spawnFn: fakeSpawn(calls, []) });
    await expect(runner.run('halo')).rejects.toMatchObject({
      code: 'FORBIDDEN_IN_TEST',
      constructor: ClaudeRunError,
    });
    expect(calls).toHaveLength(0);
  });

  it('Windows: spawn(string, options) dengan shell, prompt lewat stdin', async () => {
    const calls: SpawnCall[] = [];
    const stdin: string[] = [];
    const runner = new CliClaudeRunner({
      command: 'fake-claude',
      platform: 'win32',
      spawnFn: fakeSpawn(calls, stdin),
    });
    await runner.run('prompt rahasia');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe(spawnSpec('fake-claude', 'win32', SONNET_LOW).file);
    expect(calls[0]?.argsOrOptions).toMatchObject({ shell: true, windowsHide: true });
    expect(calls[0]?.options).toBeUndefined();
    expect(stdin.join('')).toBe('prompt rahasia');
    expect(JSON.stringify(calls)).not.toContain('prompt rahasia');
  });

  it('non-Windows: spawn(command, args, options) tanpa shell, prompt lewat stdin', async () => {
    const calls: SpawnCall[] = [];
    const stdin: string[] = [];
    const runner = new CliClaudeRunner({
      command: 'fake-claude',
      platform: 'linux',
      spawnFn: fakeSpawn(calls, stdin),
    });
    await runner.run('prompt rahasia');
    expect(calls[0]?.file).toBe('fake-claude');
    expect(calls[0]?.argsOrOptions).toEqual(EXPECTED_ARGS);
    expect(calls[0]?.options).toMatchObject({ shell: false });
    expect(stdin.join('')).toBe('prompt rahasia');
    expect(JSON.stringify(calls)).not.toContain('prompt rahasia');
  });

  it('meneruskan potongan teks stream ke onProgress', async () => {
    const progress: ClaudeProgress[] = [];
    const runner = new CliClaudeRunner({
      command: 'fake-claude',
      platform: 'linux',
      spawnFn: fakeSpawn([], []),
    });
    const result = await runner.run('x', { onProgress: (p) => progress.push(p) });
    expect(result.result).toBe('ok');
    expect(progress).toEqual([
      { kind: 'text', text: 'o', chars: 1 },
      { kind: 'text', text: 'k', chars: 2 },
    ]);
  });

  it('tanpa model dan effort per pemanggilan: bawaan profil standard', async () => {
    const calls: SpawnCall[] = [];
    const runner = new CliClaudeRunner({
      command: 'fake-claude',
      platform: 'linux',
      spawnFn: fakeSpawn(calls, []),
    });
    await runner.run('x');
    expect(calls[0]?.argsOrOptions).toEqual(EXPECTED_ARGS);
  });

  it.each(['win32', 'linux'] as const)(
    '%s: model dan effort per pemanggilan menggantikan bawaan runner',
    async (platform) => {
      const calls: SpawnCall[] = [];
      const runner = new CliClaudeRunner({
        command: 'fake-claude',
        model: 'sonnet',
        effort: 'low',
        platform,
        spawnFn: fakeSpawn(calls, []),
      });
      await runner.run('x', { model: 'opus', effort: 'medium' });
      await runner.run('y');
      const reasoning = spawnSpec('fake-claude', platform, { model: 'opus', effort: 'medium' });
      const standard = spawnSpec('fake-claude', platform, SONNET_LOW);
      expect(calls.map((call) => (platform === 'win32' ? call.file : call.argsOrOptions))).toEqual(
        platform === 'win32' ? [reasoning.file, standard.file] : [reasoning.args, standard.args],
      );
    },
  );

  it.each([
    { model: 'son net' },
    { model: 'sonnet & calc' },
    { model: '' },
    { effort: 'sedang' },
    { effort: 'low & calc' },
  ])(
    'model atau effort tidak valid (%j) → INVALID_CONFIG tanpa menjalankan proses',
    async (call) => {
      const calls: SpawnCall[] = [];
      const runner = new CliClaudeRunner({
        command: 'fake-claude',
        platform: 'win32',
        spawnFn: fakeSpawn(calls, []),
      });
      await expect(runner.run('x', call)).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
      expect(calls).toHaveLength(0);
    },
  );
});
