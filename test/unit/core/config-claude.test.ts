import { describe, expect, it } from 'vitest';
import {
  claudeModel,
  DEFAULT_CLAUDE_MODEL,
  isValidClaudeModel,
} from '../../../src/core/config/claude.ts';

describe('claudeModel', () => {
  it('bawaan sonnet bila CLAUDE_MODEL kosong atau tidak ada', () => {
    expect(DEFAULT_CLAUDE_MODEL).toBe('sonnet');
    expect(claudeModel({})).toBe('sonnet');
    expect(claudeModel({ CLAUDE_MODEL: '  ' })).toBe('sonnet');
  });

  it('memakai CLAUDE_MODEL tanpa spasi di tepi', () => {
    expect(claudeModel({ CLAUDE_MODEL: ' opus ' })).toBe('opus');
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
