import { describe, expect, it } from 'vitest';
import {
  CLAUDE_EFFORTS,
  claudeProfile,
  isValidClaudeEffort,
  isValidClaudeModel,
  PROFILE_DEFAULTS,
  profileSources,
  profileSourceWarnings,
  STAGE_PROFILES,
} from '../../../src/core/config/claude.ts';
import { CLAUDE_PROFILE_VARS } from '../../helpers/claude-profile-env.ts';

describe('profil Claude dari shell tidak terbaca test (T-040)', () => {
  it('setupFiles menghapus keempat variabel, jadi claudeProfile() tanpa env memakai bawaan', () => {
    expect(CLAUDE_PROFILE_VARS).toEqual([
      'CLAUDE_MODEL',
      'CLAUDE_EFFORT',
      'CLAUDE_MODEL_REASONING',
      'CLAUDE_EFFORT_REASONING',
    ]);
    for (const name of CLAUDE_PROFILE_VARS) expect(process.env).not.toHaveProperty(name);
    expect(claudeProfile('standard')).toMatchObject(PROFILE_DEFAULTS.standard);
    expect(claudeProfile('reasoning')).toMatchObject(PROFILE_DEFAULTS.reasoning);
  });
});

describe('claudeProfile', () => {
  it('bawaan D-09 dan T-034 bila env kosong atau hanya spasi', () => {
    expect(PROFILE_DEFAULTS).toEqual({
      standard: { model: 'sonnet', effort: 'low' },
      reasoning: { model: 'opus', effort: 'medium' },
    });
    expect(claudeProfile('standard', {})).toEqual({
      profile: 'standard',
      model: 'sonnet',
      effort: 'low',
      problems: [],
    });
    expect(
      claudeProfile('reasoning', { CLAUDE_MODEL_REASONING: '  ', CLAUDE_EFFORT_REASONING: '' }),
    ).toEqual({ profile: 'reasoning', model: 'opus', effort: 'medium', problems: [] });
  });

  it('setiap profil membaca variabelnya sendiri, tanpa spasi di tepi', () => {
    const env = {
      CLAUDE_MODEL: ' claude-sonnet-5-5 ',
      CLAUDE_EFFORT: 'medium',
      CLAUDE_MODEL_REASONING: 'sonnet',
      CLAUDE_EFFORT_REASONING: ' high ',
    };
    expect(claudeProfile('standard', env)).toMatchObject({
      model: 'claude-sonnet-5-5',
      effort: 'medium',
    });
    expect(claudeProfile('reasoning', env)).toMatchObject({ model: 'sonnet', effort: 'high' });
  });

  it('effort atau model tidak valid menjadi masalah yang menyebut variabelnya', () => {
    const standard = claudeProfile('standard', { CLAUDE_EFFORT: 'sedang' });
    expect(standard.problems).toEqual([
      'CLAUDE_EFFORT tidak valid: "sedang". Pilih salah satu: low, medium, high, xhigh, max.',
    ]);
    const reasoning = claudeProfile('reasoning', {
      CLAUDE_MODEL_REASONING: 'opus & calc',
      CLAUDE_EFFORT_REASONING: 'LOW',
    });
    expect(reasoning.problems).toHaveLength(2);
    expect(reasoning.problems[0]).toContain('CLAUDE_MODEL_REASONING tidak valid: "opus & calc"');
    expect(reasoning.problems[1]).toContain('CLAUDE_EFFORT_REASONING tidak valid: "LOW"');
  });
});

describe('STAGE_PROFILES', () => {
  it('review kedua memakai reasoning, tahap lain termasuk tahap 5 standard (D-14, T-034)', () => {
    expect(STAGE_PROFILES).toEqual({
      stage2: 'standard',
      stage3: 'standard',
      stage4: 'standard',
      stage5: 'standard',
      stage6: 'standard',
      review2: 'reasoning',
      stage7a: 'standard',
      stage7b: 'standard',
    });
  });
});

describe('isValidClaudeEffort', () => {
  it.each(CLAUDE_EFFORTS)('%s → valid', (effort) => {
    expect(isValidClaudeEffort(effort)).toBe(true);
  });

  it.each(['', 'LOW', 'sedang', 'low ', 'minimal'])('%j → tidak valid', (effort) => {
    expect(isValidClaudeEffort(effort)).toBe(false);
  });
});

describe('isValidClaudeModel', () => {
  it.each(['sonnet', 'opus', 'claude-sonnet-5-5', 'claude-opus-5-5[1m]', 'us.anthropic.x:0'])(
    '%s → valid',
    (model) => {
      expect(isValidClaudeModel(model)).toBe(true);
    },
  );

  it.each(['', 'son net', 'sonnet & calc', '"sonnet"', 'sonnet|x', '-p', '%PATH%'])(
    '%s → tidak valid',
    (model) => {
      expect(isValidClaudeModel(model)).toBe(false);
    },
  );
});

describe('asal nilai profil (T-041)', () => {
  it('bawaan bila kosong, .env bila sama dengan isi .env, env proses bila tidak', () => {
    expect(profileSources('standard', {}, {})).toEqual({
      model: { name: 'CLAUDE_MODEL', value: 'sonnet', defaultValue: 'sonnet', source: 'default' },
      effort: { name: 'CLAUDE_EFFORT', value: 'low', defaultValue: 'low', source: 'default' },
    });
    const env = { CLAUDE_MODEL_REASONING: 'sonnet', CLAUDE_EFFORT_REASONING: ' high ' };
    const sources = profileSources('reasoning', env, { CLAUDE_EFFORT_REASONING: 'high' });
    expect(sources.model).toMatchObject({ value: 'sonnet', source: 'env' });
    expect(sources.effort).toMatchObject({ value: 'high', source: 'dotenv' });
    // .env dengan nilai lain: env proses yang menang dan yang dilaporkan.
    expect(
      profileSources('standard', { CLAUDE_EFFORT: 'medium' }, { CLAUDE_EFFORT: 'low' }).effort,
    ).toMatchObject({ value: 'medium', source: 'env' });
  });

  it('peringatan hanya untuk env proses yang berbeda dari bawaan', () => {
    expect(profileSourceWarnings('standard', {}, {})).toEqual([]);
    expect(profileSourceWarnings('standard', { CLAUDE_EFFORT: 'low' }, {})).toEqual([]);
    expect(
      profileSourceWarnings('standard', { CLAUDE_EFFORT: 'medium' }, { CLAUDE_EFFORT: 'medium' }),
    ).toEqual([]);
    expect(profileSourceWarnings('standard', { CLAUDE_EFFORT: 'medium' }, {})).toEqual([
      'CLAUDE_EFFORT=medium berasal dari variabel lingkungan proses, bukan dari .env, dan berbeda dari bawaan (low). Bila server dijalankan dari shell Claude Code, nilai ini milik sesi Claude Code: jalankan server dari terminal biasa, atau hapus variabelnya dulu (env -u CLAUDE_EFFORT pnpm start).',
    ]);
    expect(
      profileSourceWarnings('reasoning', { CLAUDE_MODEL_REASONING: 'sonnet' }, {}),
    ).toHaveLength(1);
  });
});
