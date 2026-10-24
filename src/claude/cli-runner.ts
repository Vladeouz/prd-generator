// Runner yang memanggil Claude Code sungguhan (PRD bagian 3, Pemanggilan Claude Code; bentuk perintah
// dari spike T-022, lihat docs/logs/T-022.md):
// - `claude -p --output-format stream-json …` (`claudeArgs`), prompt lewat stdin, tidak pernah lewat
//   argumen; stdout dibaca baris demi baris (`StreamReader`) dan potongan teks diteruskan ke
//   `onProgress`;
// - `--model` dan `--effort` per pemanggilan dari profil tahap (D-09, D-14, `ClaudeRunOptions`), tanpa
//   tool, server MCP, pengaturan user, skill, dan sesi tersimpan, dengan system prompt pendek sendiri;
// - Windows: satu string dengan `shell: true` (menghindari DEP0190); platform lain: array argumen;
// - dijalankan di folder sementara kosong yang dihapus setelahnya; gagal hapus hanya dicatat, tidak
//   menimpa hasil atau error pemanggilan (T-038);
// - batas waktu bawaan 15 menit.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  type ClaudeCallConfig,
  isValidClaudeEffort,
  isValidClaudeModel,
  PROFILE_DEFAULTS,
} from '../core/config/claude.ts';
import { StreamReader } from './stream.ts';
import {
  type ClaudeResult,
  ClaudeRunError,
  type ClaudeRunner,
  type ClaudeRunOptions,
} from './types.ts';

export const CLAUDE_COMMAND = 'claude';
export const DEFAULT_TIMEOUT_MS = 15 * 60_000;

/**
 * System prompt pengganti bawaan Claude Code (yang membawa ±25k token instruksi dan daftar tool).
 * Tanpa tanda kutip atau karakter khusus cmd.exe, karena di Windows ikut string perintah.
 */
export const CLAUDE_SYSTEM_PROMPT =
  'Kamu adalah generator dokumen non-interaktif. Ikuti instruksi di pesan user persis. ' +
  'Jangan memakai tool. Balas hanya dengan output yang diminta.';

/** Argumen `claude` (spike T-022). Prompt tidak pernah ada di sini. */
export function claudeArgs({ model, effort }: ClaudeCallConfig): string[] {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--max-turns',
    '1',
    '--model',
    model,
    '--effort',
    effort,
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
}

export type SpawnSpec = {
  file: string;
  args: string[];
  shell: boolean;
};

/** Argumen untuk string perintah cmd.exe: kosong atau berspasi diberi tanda kutip. */
function quoteForCmd(arg: string): string {
  if (/["%!^&|<>\r\n]/.test(arg)) {
    throw new Error(`Argumen tidak aman untuk string perintah Windows: ${arg}`);
  }
  return arg === '' || /\s/.test(arg) ? `"${arg}"` : arg;
}

/** Bentuk pemanggilan per platform (PRD bagian 3). */
export function spawnSpec(
  command: string,
  platform: NodeJS.Platform,
  config: ClaudeCallConfig,
): SpawnSpec {
  const args = claudeArgs(config);
  return platform === 'win32'
    ? { file: [command, ...args.map(quoteForCmd)].join(' '), args: [], shell: true }
    : { file: command, args, shell: false };
}

/** True bila perintah menunjuk `claude` sungguhan (`claude`, `claude.cmd`, path ke sana, dst.). */
export function isRealClaudeCommand(command: string): boolean {
  const program = command.trim().match(/^"([^"]+)"|^(\S+)/);
  const path = program?.[1] ?? program?.[2] ?? '';
  return /^claude(\.(cmd|exe|ps1|bat))?$/i.test(basename(path.replaceAll('\\', '/')));
}

/**
 * Percobaan ulang `rmSync` untuk EPERM/EBUSY: di Windows, proses yang baru dimatikan `taskkill`
 * kadang masih memegang folder kerjanya sesaat (temuan T-037). Jeda naik linear: 100, 200, … ms.
 */
export const TEMP_DIR_REMOVE_OPTIONS = {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
} as const;

/** Menghapus folder sementara pemanggilan. */
export function removeTempDir(path: string) {
  rmSync(path, TEMP_DIR_REMOVE_OPTIONS);
}

export type RunnerLogger = { warn: (message: string) => void };

export type CliRunnerOptions = {
  /** Program yang dipanggil; bawaan `claude`. Test memakai script Node palsu. */
  command?: string;
  /**
   * Model dan effort bila pemanggilan tidak menyebutnya (bawaan profil `standard`). Aplikasi selalu
   * mengirim keduanya per pemanggilan dari profil tahap (`runStage`).
   */
  model?: string;
  effort?: string;
  timeoutMs?: number;
  platform?: NodeJS.Platform;
  /** Variabel lingkungan tambahan untuk proses anak. */
  env?: Record<string, string>;
  spawnFn?: typeof spawn;
  /** Penghapus folder sementara; bawaan `removeTempDir`. Test memakai fungsi yang dibuat gagal. */
  removeDir?: (path: string) => void;
  /** Tujuan catatan gagal hapus folder sementara; bawaan `console`. */
  logger?: RunnerLogger;
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
  private readonly model: string;
  private readonly effort: string;
  private readonly timeoutMs: number;
  private readonly platform: NodeJS.Platform;
  private readonly env: Record<string, string>;
  private readonly spawnFn: typeof spawn;
  private readonly removeDir: (path: string) => void;
  private readonly logger: RunnerLogger;

  constructor(options: CliRunnerOptions = {}) {
    this.command = options.command ?? CLAUDE_COMMAND;
    this.model = options.model ?? PROFILE_DEFAULTS.standard.model;
    this.effort = options.effort ?? PROFILE_DEFAULTS.standard.effort;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.platform = options.platform ?? process.platform;
    this.env = options.env ?? {};
    this.spawnFn = options.spawnFn ?? spawn;
    this.removeDir = options.removeDir ?? removeTempDir;
    this.logger = options.logger ?? console;
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
    const config = { model: options.model ?? this.model, effort: options.effort ?? this.effort };
    // Pengaman terakhir: nilai dari env sudah diperiksa `claudeProfile` sebelum runner dipanggil.
    if (!isValidClaudeModel(config.model)) {
      throw new ClaudeRunError(
        'INVALID_CONFIG',
        `Model Claude Code tidak valid: "${config.model}". Isi dengan alias (misalnya sonnet) atau nama model lengkap, tanpa spasi.`,
      );
    }
    if (!isValidClaudeEffort(config.effort)) {
      throw new ClaudeRunError(
        'INVALID_CONFIG',
        `Effort Claude Code tidak valid: "${config.effort}".`,
      );
    }
    const cwd = mkdtempSync(join(tmpdir(), 'prd-generator-claude-'));
    try {
      return await this.runIn(
        cwd,
        prompt,
        config,
        options.timeoutMs ?? this.timeoutMs,
        options.onProgress,
      );
    } finally {
      this.cleanup(cwd);
    }
  }

  /** Error di `finally` akan menimpa hasil atau error pemanggilan, jadi gagal hapus hanya dicatat. */
  private cleanup(cwd: string) {
    try {
      this.removeDir(cwd);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Folder sementara Claude Code tidak bisa dihapus: ${cwd} (${reason})`);
    }
  }

  private runIn(
    cwd: string,
    prompt: string,
    config: ClaudeCallConfig,
    timeoutMs: number,
    onProgress: ClaudeRunOptions['onProgress'],
  ): Promise<ClaudeResult> {
    const spec = spawnSpec(this.command, this.platform, config);
    const stream = new StreamReader(onProgress);
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
        stream.push(chunk);
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
            resolve(stream.finish(stdout, durationMs));
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
