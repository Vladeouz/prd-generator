// Data halaman pengaturan dan `GET /api/settings` (FR-11).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { isRealClaudeCommand } from '../claude/cli-runner.ts';
import {
  CLAUDE_PROFILES,
  type ClaudeProfile,
  type ClaudeProfileConfig,
  claudeProfile,
  PROFILE_ENV,
  type ProfileValueSource,
  profileSources,
  profileSourceWarnings,
  STAGE_PROFILES,
} from '../core/config/claude.ts';
import { STAGE_LABELS } from '../projects/stage-labels.ts';
import { sectionProblems } from './sections.ts';
import { readTemplate } from './template.ts';

export type ClaudeAvailability = { available: boolean; version: string | null };

/** Model dan effort satu profil (D-14) untuk halaman pengaturan (FR-11). */
export type ProfileSetting = ClaudeProfileConfig & {
  modelVar: string;
  effortVar: string;
  /** Nama tahap yang memakai profil ini, urut alur. */
  stages: string[];
  /** Asal nilai model dan effort (T-041). */
  sources: { model: ProfileValueSource; effort: ProfileValueSource };
  /** Peringatan nilai dari env proses yang berbeda dari bawaan; tahap tetap bisa dijalankan. */
  warnings: string[];
};

/** Env proses dan isi `.env` untuk menentukan asal nilai profil (T-041). */
export type ProfileEnv = {
  env: Record<string, string | undefined>;
  dotenv: Record<string, string | undefined>;
};

/** Isi `.env` di `root` (bawaan: folder kerja server), atau kosong bila file tidak ada. */
export function readDotenv(root = process.cwd()): Record<string, string | undefined> {
  const file = join(root, '.env');
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

/** Nama tahap per run di `STAGE_PROFILES`: 7a dan 7b dibedakan. */
const RUN_STAGE_LABELS: Record<keyof typeof STAGE_PROFILES, string> = {
  stage2: STAGE_LABELS.stage2,
  stage3: STAGE_LABELS.stage3,
  stage4: STAGE_LABELS.stage4,
  stage5: STAGE_LABELS.stage5,
  stage6: STAGE_LABELS.stage6,
  review2: STAGE_LABELS.review2,
  stage7a: `${STAGE_LABELS.stage7} (daftar task)`,
  stage7b: `${STAGE_LABELS.stage7} (detail per fase)`,
};

export function profileSettings(
  profiles: (profile: ClaudeProfile) => ClaudeProfileConfig = claudeProfile,
  profileEnv: ProfileEnv = { env: process.env, dotenv: {} },
): ProfileSetting[] {
  return CLAUDE_PROFILES.map((profile) => {
    const sources = profileSources(profile, profileEnv.env, profileEnv.dotenv);
    return {
      ...profiles(profile),
      modelVar: PROFILE_ENV[profile].model,
      effortVar: PROFILE_ENV[profile].effort,
      stages: (Object.keys(STAGE_PROFILES) as (keyof typeof STAGE_PROFILES)[])
        .filter((stage) => STAGE_PROFILES[stage] === profile)
        .map((stage) => RUN_STAGE_LABELS[stage]),
      sources: { model: sources.model.source, effort: sources.effort.source },
      warnings: profileSourceWarnings(profile, profileEnv.env, profileEnv.dotenv),
    };
  });
}

export type Settings = {
  templateDir: string | null;
  templateCommit: string | null;
  claudeAvailable: boolean;
  claudeVersion: string | null;
  /**
   * Masalah yang membuat tahap 6–7 tidak bisa dijalankan: template tidak valid, atau heading
   * `docs/conventions.md` yang dibutuhkan suatu tahap tidak ada (D-10). Kosong bila tidak ada.
   */
  problems: string[];
  /** Model dan effort per profil beserta tahapnya; masalah env ada di `problems` tiap profil. */
  claudeProfiles: ProfileSetting[];
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
  /** Bawaan: `claudeProfile` dengan env dari `profileEnv`. */
  profiles?: (profile: ClaudeProfile) => ClaudeProfileConfig;
  /** Bawaan: env proses dan `.env` di folder kerja server. */
  profileEnv?: ProfileEnv;
};

export async function getSettings(
  deps: SettingsDeps = { templateDir: process.env.TEMPLATE_DIR, checkClaude: () => checkClaude() },
): Promise<Settings> {
  const profileEnv = deps.profileEnv ?? { env: process.env, dotenv: readDotenv() };
  const [template, claude] = await Promise.all([
    readTemplate(deps.templateDir),
    deps.checkClaude(),
  ]);
  return {
    templateDir: deps.templateDir?.trim() || null,
    templateCommit: template.ok ? template.template.commit : null,
    claudeAvailable: claude.available,
    claudeVersion: claude.version,
    problems: template.ok ? sectionProblems(template.template.conventions) : template.problems,
    claudeProfiles: profileSettings(
      deps.profiles ?? ((profile) => claudeProfile(profile, profileEnv.env)),
      profileEnv,
    ),
  };
}
