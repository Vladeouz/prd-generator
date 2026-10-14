// Runner palsu mode `flow` (dipakai verifikasi manual T-021 dan end-to-end): setiap prompt tahap
// dikenali dan dijawab dengan fixture gym yang sama dengan GYM_FIXTURES.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('gagal dengan pesan bila tahap tidak dikenali', async () => {
    await expect(runner().run('prompt tanpa nama tahap')).rejects.toThrow(/keluar dengan kode 4/);
  });
});
