import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { prdDigest } from '../../../src/projects/prd-digest.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import { buildFeatureDraft } from '../../../src/stages/stage-4/features.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import { stage7aContext } from '../../../src/stages/stage-7a/definition.ts';
import {
  type Stage7aOutput,
  type Stage7aTask,
  validateStage7a,
} from '../../../src/stages/stage-7a/validate.ts';
import { MAX_TASKS } from '../../../src/stages/task-rules.ts';

const stage4 = JSON.parse(loadClaudeFixture('stage4').result) as Stage4Output;
const prd = loadClaudeFixture('derived/stage6-gym').result;
/** PRD gym + struktur fitur gym dengan R-01 diterima. */
const context = stage7aContext(prdDigest(prd, buildFeatureDraft(stage4, ['R-01'])));
/** Daftar task turunan dari docs/reference/e2e-output/TASKS.md. */
const fixture = () => JSON.parse(loadClaudeFixture('derived/stage7a-gym').result) as Stage7aOutput;

const errorsOf = (output: unknown) => validateStage7a(output, context).errors;
/** Fixture dengan satu task diubah. */
function patch(id: string, change: Partial<Stage7aTask>): Stage7aOutput {
  const output = fixture();
  output.tasks = output.tasks.map((t) => (t.id === id ? { ...t, ...change } : t));
  return output;
}

describe('validateStage7a', () => {
  it('menerima daftar task turunan TASKS uji end-to-end', () => {
    expect(validateStage7a(fixture(), context)).toEqual({ errors: [], warnings: [] });
    expect(fixture().tasks).toHaveLength(42);
  });

  it('menolak task setup yang sudah disediakan template (judul dari TASKS rujukan asli)', () => {
    // T-001 dan T-007 TASKS rujukan asli: setup monorepo/Docker Compose dan pipeline kontrak.
    const original = readFileSync('docs/reference/e2e-output/TASKS.md', 'utf8');
    const setupTitles = [...original.matchAll(/^- \[ \] T-00[17] (.+)$/gm)].map((m) => m[1]);
    expect(setupTitles).toEqual([
      'Setup monorepo dan Docker Compose',
      'Pipeline kontrak OpenAPI dan generate client Dart',
    ]);
    const errors = errorsOf(patch('T-001', { title: setupTitles[0] }));
    expect(errors).toEqual([
      'T-001 adalah setup yang sudah disediakan template (monorepo, Docker Compose)',
    ]);
    expect(errorsOf(patch('T-002', { title: setupTitles[1] }))).toEqual([
      'T-002 adalah setup yang sudah disediakan template (pipeline kontrak)',
    ]);
  });

  it('menuntut tepat satu task penghapusan notes, setelah task fitur pertama', () => {
    const removal = fixture().tasks.find((t) => t.feature === null) as Stage7aTask;
    const without = fixture();
    without.tasks = without.tasks.filter((t) => t.id !== removal.id);
    expect(errorsOf(without)).toContain(
      'harus ada tepat satu task penghapusan fitur contoh notes, ada 0',
    );
    const twice = fixture();
    twice.tasks.push({ ...removal, id: 'T-099', title: 'Hapus sisa notes', depends_on: [] });
    expect(errorsOf(twice)).toContain(
      'harus ada tepat satu task penghapusan fitur contoh notes, ada 2',
    );
    const first = fixture();
    const rest = first.tasks.filter((t) => t.id !== removal.id);
    first.tasks = [{ ...removal, depends_on: [] }, ...rest];
    expect(errorsOf(first)).toContain(
      `${removal.id} (hapus fitur contoh notes) harus setelah task fitur pertama`,
    );
  });

  it('refs harus ada di PRD dan setiap FR dirujuk', () => {
    expect(errorsOf(patch('T-002', { refs: ['FR-99', 'NFR-77'] }))).toEqual(
      expect.arrayContaining([
        'T-002 merujuk FR-99 yang tidak ada di PRD',
        'T-002 merujuk NFR-77 yang tidak ada di PRD',
      ]),
    );
    const output = fixture();
    output.tasks = output.tasks.map((t) => ({ ...t, refs: t.refs.filter((r) => r !== 'FR-17') }));
    expect(errorsOf(output)).toContain('FR-17 tidak dirujuk task mana pun');
    expect(errorsOf(patch('T-002', { refs: [] }))).toContain('T-002 tanpa refs');
  });

  it('depends_on hanya ke task sebelumnya; judul unik; id berformat T-xxx', () => {
    expect(errorsOf(patch('T-002', { depends_on: ['T-010'] }))).toEqual([
      'T-002 depends_on T-010 yang belum muncul sebelumnya',
    ]);
    const title = fixture().tasks[0]?.title as string;
    expect(errorsOf(patch('T-002', { title: title.toUpperCase() }))).toContain(
      `judul task duplikat: ${title.toUpperCase()}`,
    );
    expect(errorsOf(patch('T-002', { id: 'tugas-2' }))).toContain(
      'tasks[1]: id harus berformat T-001',
    );
  });

  it('fase harus ada di struktur fitur, berurutan, dan tidak sebelum fase fiturnya', () => {
    expect(errorsOf(patch('T-002', { phase: 9 }))).toContain(
      'T-002 fase 9 tidak ada di struktur fitur',
    );
    const last = fixture().tasks.at(-1) as Stage7aTask;
    expect(errorsOf(patch(last.id, { phase: 0 }))).toContain(
      `${last.id} fase 0 setelah task fase 3`,
    );
    // F-07 ada di fase 3; task fase 0 untuk F-07 berarti fitur dikerjakan sebelum fasenya.
    expect(errorsOf(patch('T-002', { feature: 'F-07' }))).toContain(
      'T-002 di fase 0, sebelum fase fitur F-07 (3)',
    );
  });

  it('fitur harus ada di tahap 4 (MVP atau rekomendasi yang diterima); null hanya untuk hapus notes', () => {
    expect(errorsOf(patch('T-002', { feature: 'R-01' }))).toEqual([]);
    expect(errorsOf(patch('T-002', { feature: 'R-02' }))).toEqual([
      'T-002 merujuk fitur R-02 yang tidak ada di struktur fitur',
    ]);
    expect(errorsOf(patch('T-002', { feature: null }))).toEqual(['T-002 tanpa fitur tahap 4']);
  });

  it('layer harus dikenal; output bukan daftar task ditolak; terlalu banyak task hanya peringatan', () => {
    expect(errorsOf(patch('T-002', { layer: 'frontend' }))).toEqual([
      'T-002 layer tidak dikenal: frontend',
    ]);
    expect(errorsOf({})).toEqual(['tasks kosong atau bukan array']);
    expect(errorsOf({ tasks: [] })).toEqual(['tasks kosong atau bukan array']);
    const many = fixture();
    const last = many.tasks.at(-1) as Stage7aTask;
    for (let i = many.tasks.length; i <= MAX_TASKS; i++) {
      many.tasks.push({
        ...last,
        id: `T-${String(i + 1).padStart(3, '0')}`,
        title: `Tambahan ${i}`,
        depends_on: [],
      });
    }
    const result = validateStage7a(many, context);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      `${MAX_TASKS + 1} task, lebih dari ${MAX_TASKS} (target MVP 20–45 task)`,
    ]);
  });
});

describe('prompts/stage-7a.md', () => {
  it('versi 1 dengan ringkasan PRD (bukan PRD utuh), konvensi terpilih, dan daftar layer', () => {
    const prompt = loadPrompt('stage-7a');
    expect(prompt.version).toBe('1');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual([
      'digest',
      'conventions',
      'layers',
    ]);
    expect(prompt.body).toContain('Kamu adalah tahap "Daftar Task"');
    expect(prompt.body).toContain('"Hapus fitur contoh notes"');
    expect(prompt.body).not.toContain('{{prd}}');
  });
});
