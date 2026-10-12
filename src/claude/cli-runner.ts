// Runner yang memanggil Claude Code sungguhan (PRD bagian 3, Pemanggilan Claude Code):
// - `claude -p --output-format json --max-turns 1`, prompt lewat stdin, tidak pernah lewat argumen;
// - Windows: satu string dengan `shell: true` (menghindari DEP0190); platform lain: array argumen;
// - dijalankan di folder sementara kosong yang dihapus setelahnya;
// - batas waktu bawaan 15 menit.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parseEnvelope } from './envelope.ts';
import {
  type ClaudeResult,
  ClaudeRunError,
  type ClaudeRunner,
  type ClaudeRunOptions,
} from './types.ts';

export const CLAUDE_COMMAND = 'claude';
export const CLAUDE_ARGS = ['-p', '--output-format', 'json', '--max-turns', '1'] as const;
export const DEFAULT_TIMEOUT_MS = 15 * 60_000;

export type SpawnSpec = {
  file: string;
  args: string[];
  shell: boolean;
};

/** Bentuk pemanggilan per platform (PRD bagian 3). */
export function spawnSpec(command: string, platform: NodeJS.Platform): SpawnSpec {
  return platform === 'win32'
    ? { file: `${command} ${CLAUDE_ARGS.join(' ')}`, args: [], shell: true }
    : { file: command, args: [...CLAUDE_ARGS], shell: false };
}

/** True bila perintah menunjuk `claude` sungguhan (`claude`, `claude.cmd`, path ke sana, dst.). */
export function isRealClaudeCommand(command: string): boolean {
  const program = command.trim().match(/^"([^"]+)"|^(\S+)/);
  const path = program?.[1] ?? program?.[2] ?? '';
  return /^claude(\.(cmd|exe|ps1|bat))?$/i.test(basename(path.replaceAll('\\', '/')));
}

export type CliRunnerOptions = {
  /** Program yang dipanggil; bawaan `claude`. Test memakai script Node palsu. */
  command?: string;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
  /** Variabel lingkungan tambahan untuk proses anak. */
  env?: Record<string, string>;
  spawnFn?: typeof spawn;
};

/**
 * Menghentikan proses beserta turunannya. Di Windows dengan `shell: true`, `child.kill()` hanya
 * mematikan `cmd.exe` dan membiarkan `claude` tetap berjalan (temuan spike T-002).
 */
function killTree(child: ChildProcess, platform: NodeJS.Platform) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  } else {
    child.kill('SIGKILL');
  }
}

const excerpt = (text: string, max = 300) => {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
};

export class CliClaudeRunner implements ClaudeRunner {
  private readonly command: string;
  private readonly timeoutMs: number;
  private readonly platform: NodeJS.Platform;
  private readonly env: Record<string, string>;
  private readonly spawnFn: typeof spawn;

  constructor(options: CliRunnerOptions = {}) {
    this.command = options.command ?? CLAUDE_COMMAND;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.platform = options.platform ?? process.platform;
    this.env = options.env ?? {};
    this.spawnFn = options.spawnFn ?? spawn;
  }

  async run(prompt: string, options: ClaudeRunOptions = {}): Promise<ClaudeResult> {
    // NFR-02: test tidak boleh memakai kuota langganan.
    if (process.env.NODE_ENV === 'test' && isRealClaudeCommand(this.command)) {
      throw new ClaudeRunError(
        'FORBIDDEN_IN_TEST',
        'Runner CLI dipanggil dengan perintah `claude` sungguhan saat NODE_ENV=test. ' +
          'Test harus memakai FakeClaudeRunner atau script palsu.',
      );
    }
    const cwd = mkdtempSync(join(tmpdir(), 'prd-generator-claude-'));
    try {
      return await this.runIn(cwd, prompt, options.timeoutMs ?? this.timeoutMs);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }

  private runIn(cwd: string, prompt: string, timeoutMs: number): Promise<ClaudeResult> {
    const spec = spawnSpec(this.command, this.platform);
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        action();
      };

      const spawnOptions = {
        cwd,
        shell: spec.shell,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.env },
      };
      // Dengan shell, perintah dikirim sebagai satu string tanpa array argumen (DEP0190).
      const child = spec.shell
        ? this.spawnFn(spec.file, spawnOptions)
        : this.spawnFn(spec.file, spec.args, spawnOptions);

      let stdout = '';
      let stderr = '';
      child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });

      const timer = setTimeout(() => {
        killTree(child, this.platform);
        const minutes = Math.round((timeoutMs / 60_000) * 10) / 10;
        settle(() =>
          reject(
            new ClaudeRunError(
              'TIMEOUT',
              `Claude Code tidak selesai dalam batas waktu ${minutes} menit; proses dihentikan.`,
              { stderr, durationMs: elapsed() },
            ),
          ),
        );
      }, timeoutMs);

      child.on('error', (error) =>
        settle(() =>
          reject(
            new ClaudeRunError('SPAWN_FAILED', `Claude Code gagal dijalankan: ${error.message}`, {
              durationMs: elapsed(),
            }),
          ),
        ),
      );

      child.on('close', (exitCode) =>
        settle(() => {
          const durationMs = elapsed();
          if (exitCode !== 0) {
            reject(
              new ClaudeRunError(
                'EXIT_CODE',
                `Claude Code keluar dengan kode ${exitCode}: ${excerpt(stderr || stdout) || '(tanpa pesan)'}`,
                { exitCode, stderr, stdout, durationMs },
              ),
            );
            return;
          }
          try {
            resolve(parseEnvelope(stdout, durationMs));
          } catch (error) {
            reject(error);
          }
        }),
      );

      // Proses yang keluar sebelum membaca stdin memicu EPIPE; hasilnya tetap dilaporkan lewat
      // `close` (exit code bukan 0), jadi error tulis diabaikan di sini.
      child.stdin?.on('error', () => {});
      child.stdin?.end(prompt, 'utf8');
    });
  }
}
