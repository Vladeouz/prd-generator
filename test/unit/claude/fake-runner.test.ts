import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FakeClaudeRunner, loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { ClaudeRunError } from '../../../src/claude/types.ts';

const reference = (file: string) => readFileSync(`docs/reference/e2e-output/${file}`, 'utf8');

describe('fixture dari docs/reference/e2e-output', () => {
  it.each([
    ['stage2', 'stage-2.json'],
    ['stage3', 'stage-3.json'],
    ['stage4', 'stage-4.json'],
    ['stage5', 'stage-5.json'],
  ])('%s berisi output nyata %s', (name, file) => {
    expect(JSON.parse(loadClaudeFixture(name).result)).toEqual(JSON.parse(reference(file)));
  });

  it.each([
    ['stage6', 'PRD.md'],
    ['stage7', 'TASKS.md'],
  ])('%s berisi %s apa adanya', (name, file) => {
    expect(loadClaudeFixture(name).result).toBe(reference(file));
  });

  it('token, biaya, dan durasi diambil dari report.json', () => {
    const fixture = loadClaudeFixture('stage2');
    expect(fixture).toMatchObject({
      inputTokens: 2 + 8112 + 16023,
      outputTokens: 1521,
      durationMs: 18959,
    });
    expect(fixture.costUsd).toBeCloseTo(0.0985, 4);
  });
});

describe('FakeClaudeRunner', () => {
  it('mengembalikan respons berurutan dan mencatat prompt', async () => {
    const first = loadClaudeFixture('stage2');
    const runner = new FakeClaudeRunner([
      first,
      (prompt) => ({ ...first, result: `gema: ${prompt}` }),
    ]);
    expect(await runner.run('satu')).toBe(first);
    expect((await runner.run('dua')).result).toBe('gema: dua');
    expect(runner.prompts).toEqual(['satu', 'dua']);
  });

  it('melempar ClaudeRunError dari antrean', async () => {
    const runner = new FakeClaudeRunner([new ClaudeRunError('TIMEOUT', 'habis waktu')]);
    await expect(runner.run('x')).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('gagal jelas bila antrean habis', async () => {
    const runner = new FakeClaudeRunner([]);
    await expect(runner.run('x')).rejects.toThrow(/tidak ada respons untuk pemanggilan ke-1/);
  });
});
