import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  CLAUDE_ARGS,
  CliClaudeRunner,
  isRealClaudeCommand,
  spawnSpec,
} from '../../../src/claude/cli-runner.ts';
import { ClaudeRunError } from '../../../src/claude/types.ts';

describe('spawnSpec', () => {
  it('Windows: satu string dengan shell, tanpa array argumen', () => {
    expect(spawnSpec('claude', 'win32')).toEqual({
      file: 'claude -p --output-format json --max-turns 1',
      args: [],
      shell: true,
    });
  });

  it.each(['linux', 'darwin'] as const)('%s: array argumen tanpa shell', (platform) => {
    expect(spawnSpec('claude', platform)).toEqual({
      file: 'claude',
      args: ['-p', '--output-format', 'json', '--max-turns', '1'],
      shell: false,
    });
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
      child.stdout.end(
        JSON.stringify({
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
    expect(calls[0]?.file).toBe(`fake-claude ${CLAUDE_ARGS.join(' ')}`);
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
    expect(calls[0]?.argsOrOptions).toEqual([...CLAUDE_ARGS]);
    expect(calls[0]?.options).toMatchObject({ shell: false });
    expect(stdin.join('')).toBe('prompt rahasia');
    expect(JSON.stringify(calls)).not.toContain('prompt rahasia');
  });
});
