// Runner palsu mode `flow` (dipakai verifikasi manual T-021 dan end-to-end): setiap prompt tahap
// dikenali dan dijawab dengan fixture gym yang sama dengan GYM_FIXTURES.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CliClaudeRunner } from '../../../src/claude/cli-runner.ts';
import { FLOW_FIXTURES, flowFixture } from '../../helpers/fake-claude-flow.mjs';

const FAKE_CLI = resolve('test/helpers/fake-claude-cli.mjs');
const COMMAND = process.platform === 'win32' ? `"${process.execPath}" "${FAKE_CLI}"` : FAKE_CLI;
const PROMPTS = readdirSync('prompts').filter((file) => file.endsWith('.md'));

const runner = () => new CliClaudeRunner({ command: COMMAND, env: { FAKE_CLAUDE_MODE: 'flow' } });

describe('runner palsu mode flow', () => {
  it.each(PROMPTS)('mengenali prompt %s dan fixture-nya ada', (file) => {
    const fixture = flowFixture(readFileSync(`prompts/${file}`, 'utf8'));
    expect(fixture).not.toBeNull();
    expect(existsSync(fileURLToPath(fixture as URL))).toBe(true);
  });

  it('setiap fixture flow dipakai oleh tepat satu prompt', () => {
    const used = PROMPTS.map((file) => flowFixture(readFileSync(`prompts/${file}`, 'utf8'))?.href);
    expect(new Set(used).size).toBe(Object.keys(FLOW_FIXTURES).length);
  });

  it('mencetak envelope fixture tahap itu lewat runner CLI', async () => {
    const prompt = readFileSync('prompts/stage-5.md', 'utf8');
    const result = await runner().run(prompt);
    const expected = JSON.parse(readFileSync('test/fixtures/claude/stage5.json', 'utf8'));
    expect(result.result).toBe(expected.result);
  });

  it('FAKE_CLAUDE_INVALID_ONCE: pemanggilan pertama tahap itu memakai fixture tidak valid, sekali saja', async () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'prd-generator-flow-'));
    try {
      const once = new CliClaudeRunner({
        command: COMMAND,
        env: {
          FAKE_CLAUDE_MODE: 'flow',
          FAKE_CLAUDE_INVALID_ONCE: 'Klarifikasi Teknis',
          FAKE_CLAUDE_INVALID_FIXTURE: resolve('test/fixtures/claude/stage3.json'),
          FAKE_CLAUDE_STATE_DIR: stateDir,
        },
      });
      const fixture = (file: string) =>
        JSON.parse(readFileSync(`test/fixtures/claude/${file}`, 'utf8')).result;
      const stage3 = readFileSync('prompts/stage-3.md', 'utf8');
      const stage4 = readFileSync('prompts/stage-4.md', 'utf8');
      expect((await once.run(stage4)).result).toBe(fixture('stage4.json'));
      expect((await once.run(stage3)).result).toBe(fixture('stage3.json'));
      expect((await once.run(stage3)).result).toBe(fixture('derived/stage3-gym.json'));
      expect((await once.run(stage3)).result).toBe(fixture('derived/stage3-gym.json'));
    } finally {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it('gagal dengan pesan bila tahap tidak dikenali', async () => {
    await expect(runner().run('prompt tanpa nama tahap')).rejects.toThrow(/keluar dengan kode 4/);
  });
});
