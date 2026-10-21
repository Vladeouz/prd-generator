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

describe('claudeArgs', () => {
  it('model, effort low, pengurang overhead, dan stream-json; tanpa flag yang tidak berpengaruh', () => {
    expect(claudeArgs('sonnet')).toEqual(EXPECTED_ARGS);
    expect(claudeArgs('claude-opus-5-5')).toContain('claude-opus-5-5');
    for (const unused of ['--safe-mode', '--settings', '--bare', '--output-format=json']) {
      expect(claudeArgs('sonnet')).not.toContain(unused);
    }
  });

  it('system prompt aman untuk string cmd.exe', () => {
    expect(CLAUDE_SYSTEM_PROMPT).not.toMatch(/["%!^&|<>\r\n]/);
  });
});

describe('spawnSpec', () => {
  it('Windows: satu string dengan shell; argumen kosong dan berspasi diberi tanda kutip', () => {
    expect(spawnSpec('claude', 'win32', 'sonnet')).toEqual({
      file:
        'claude -p --output-format stream-json --verbose --include-partial-messages --max-turns 1 ' +
        `--model sonnet --effort low --system-prompt "${CLAUDE_SYSTEM_PROMPT}" --tools "" ` +
        '--strict-mcp-config --setting-sources project --disable-slash-commands --no-session-persistence',
      args: [],
      shell: true,
    });
  });

  it.each(['linux', 'darwin'] as const)('%s: array argumen tanpa shell', (platform) => {
    expect(spawnSpec('claude', platform, 'sonnet')).toEqual({
      file: 'claude',
      args: EXPECTED_ARGS,
      shell: false,
    });
  });

  it('model bawaan sonnet', () => {
    expect(spawnSpec('claude', 'linux').args).toEqual(EXPECTED_ARGS);
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
    expect(calls[0]?.file).toBe(spawnSpec('fake-claude', 'win32').file);
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

  it('model dipakai di argumen', async () => {
    const calls: SpawnCall[] = [];
    const runner = new CliClaudeRunner({
      command: 'fake-claude',
      model: 'claude-opus-5-5',
      platform: 'linux',
      spawnFn: fakeSpawn(calls, []),
    });
    await runner.run('x');
    expect(calls[0]?.argsOrOptions).toEqual(claudeArgs('claude-opus-5-5'));
  });

  it.each(['son net', 'sonnet & calc', ''])(
    'CLAUDE_MODEL tidak valid (%j) → INVALID_CONFIG tanpa menjalankan proses',
    async (model) => {
      const calls: SpawnCall[] = [];
      const runner = new CliClaudeRunner({
        command: 'fake-claude',
        model,
        platform: 'win32',
        spawnFn: fakeSpawn(calls, []),
      });
      await expect(runner.run('x')).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
      expect(calls).toHaveLength(0);
    },
  );
});
