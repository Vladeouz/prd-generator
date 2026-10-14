import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { extractMarkdown } from '../../../src/stages/parse.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import { prdInfo } from '../../../src/stages/stage-6/validate.ts';
import { nfrIds, parseTasks, validateTasks } from '../../../src/stages/stage-7/validate.ts';

const prdMd = loadClaudeFixture('derived/stage6-gym').result;
const PRD = { ...prdInfo(prdMd), nfrIds: nfrIds(prdMd) };
/** TASKS nyata gym apa adanya (uji end-to-end). */
const original = () => extractMarkdown(loadClaudeFixture('stage7').result);
/** TASKS gym yang disesuaikan dengan FR-08 (fixture turunan). */
const tasks = () => extractMarkdown(loadClaudeFixture('derived/stage7-gym').result);
const errorsOf = (md: string) => validateTasks(md, PRD).errors;

/** Mengganti satu blok task (dari baris judulnya sampai baris kosong berikutnya). */
function editTask(md: string, id: string, change: (block: string) => string) {
  const start = md.indexOf(`- [ ] ${id} `);
  const end = md.indexOf('\n\n', start);
  return md.slice(0, start) + change(md.slice(start, end)) + md.slice(end);
}

describe('validateTasks', () => {
  it('menolak TASKS nyata karena berisi task setup yang sudah disediakan template', () => {
    const errors = errorsOf(original());
    expect(errors).toContain(
      'T-001 adalah setup yang sudah disediakan template (monorepo, Docker Compose, emulator)',
    );
    expect(errors).toContain(
      'T-007 adalah setup yang sudah disediakan template (pipeline kontrak)',
    );
    expect(errors).toContain('harus ada tepat satu task penghapusan fitur contoh notes, ada 0');
    expect(errors).toContain('T-002 done when tidak diakhiri `pnpm check` hijau');
  });

  it('menerima fixture yang memenuhi FR-08', () => {
    expect(validateTasks(tasks(), PRD)).toEqual({ errors: [], warnings: [] });
    const parsed = parseTasks(tasks());
    expect(parsed).toHaveLength(42);
    expect(parsed.find((t) => t.id === 'T-044')).toMatchObject({
      title: 'Hapus fitur contoh notes',
      phase: 'Fase 0 — Fondasi',
      dependsOn: ['T-016'],
      refs: [],
    });
  });

  it('setiap task punya layer, refs, files, dan done when', () => {
    const md = editTask(tasks(), 'T-003', (b) =>
      b.replace(/ {2}- files: .*\n/, '').replace('layer: db', 'layer: database'),
    );
    expect(errorsOf(md)).toEqual(['T-003 layer tidak dikenal: database', 'T-003 tanpa files']);
    expect(errorsOf(editTask(tasks(), 'T-003', (b) => b.replace(/ · refs: [^\n]+/, '')))).toContain(
      'T-003 tanpa refs',
    );
  });

  it('depends_on hanya merujuk task sebelumnya, refs harus ada di PRD, dan setiap FR dirujuk', () => {
    expect(
      errorsOf(
        editTask(tasks(), 'T-003', (b) => b.replace('depends_on: T-002', 'depends_on: T-004')),
      ),
    ).toEqual(['T-003 depends_on T-004 yang belum muncul sebelumnya']);
    expect(
      errorsOf(editTask(tasks(), 'T-002', (b) => b.replace('refs: NFR-09', 'refs: NFR-99, FR-77'))),
    ).toEqual([
      'T-002 merujuk NFR-99 yang tidak ada di PRD',
      'T-002 merujuk FR-77 yang tidak ada di PRD',
    ]);
    const withoutFr17 = tasks().replaceAll('FR-17', 'FR-16');
    expect(errorsOf(withoutFr17)).toEqual(['FR-17 tidak dirujuk task mana pun']);
  });

  it('judul dan id task tidak boleh duplikat', () => {
    const title = parseTasks(tasks())[1]?.title as string;
    expect(
      errorsOf(
        editTask(tasks(), 'T-004', (b) => b.replace(/^- \[ \] T-004 .+$/m, `- [ ] T-004 ${title}`)),
      ),
    ).toEqual([`judul task duplikat: ${title}`]);
  });

  it('setiap done when diakhiri `pnpm check` hijau', () => {
    expect(
      errorsOf(editTask(tasks(), 'T-004', (b) => b.replace('; `pnpm check` hijau', ''))),
    ).toEqual(['T-004 done when tidak diakhiri `pnpm check` hijau']);
  });

  it('tepat satu task hapus notes, setelah task fitur pertama', () => {
    const second = tasks().replace(
      '## Fase 1',
      '- [ ] T-045 Menghapus sisa notes\n  - layer: app · depends_on: - · refs: -\n  - files: `x`\n  - done when: tidak ada sisa rujukan notes di repo; `pnpm check` hijau\n\n## Fase 1',
    );
    expect(errorsOf(second)).toEqual([
      'harus ada tepat satu task penghapusan fitur contoh notes, ada 2',
    ]);
    const removal =
      '- [ ] T-044 Hapus fitur contoh notes\n  - layer: app · depends_on: - · refs: -\n  - files: `x`\n  - done when: langkah penghapusan notes selesai; `pnpm check` hijau';
    const withoutRemoval = tasks()
      .replace(/- \[ \] T-044 [\s\S]*?(?=\n\n)/, '')
      .replace(/\n\n\n+/g, '\n\n');
    const early = withoutRemoval.replace(
      '## Fase 0 — Fondasi\n',
      `## Fase 0 — Fondasi\n\n${removal}\n`,
    );
    expect(errorsOf(early)).toEqual([
      'T-044 (hapus fitur contoh notes) harus setelah task fitur pertama',
    ]);
  });

  it('task manual menyebut .env, layanan Docker, dan Flutter web dengan flag incognito', () => {
    const strip = (pattern: string | RegExp) =>
      errorsOf(editTask(tasks(), 'T-015', (b) => b.replace(pattern, '')));
    expect(strip('`.env` ada di root (salin dari `.env.example`), ')).toEqual([
      'T-015 manual tanpa persiapan `.env`',
    ]);
    expect(strip('`docker compose up -d --wait`, ')).toEqual([
      'T-015 manual tanpa menyalakan layanan Docker (`docker compose up`)',
    ]);
    expect(strip(' --web-browser-flag=--incognito')).toEqual([
      'T-015 perintah Flutter web tanpa --web-browser-flag=--incognito',
    ]);
    expect(strip(/\n {4}2\. .+/)).toEqual([
      'T-015 manual tanpa perintah Flutter web (`flutter run -d chrome …`)',
    ]);
  });

  it('perintah Flutter web hanya wajib untuk task manual yang menyentuh apps/app', () => {
    const apiOnly = (layer: string, files: string) =>
      [
        '# TASKS — Uji',
        '',
        '## Fase 0 — Fondasi',
        '',
        '- [ ] T-001 Fitur',
        '  - layer: api · depends_on: - · refs: FR-01',
        '  - files: `apps/api/src/x.ts`',
        '  - done when: `pnpm --filter api test` lulus; `pnpm check` hijau',
        '',
        '- [ ] T-002 Hapus fitur contoh notes',
        '  - layer: app · depends_on: T-001 · refs: -',
        '  - files: `apps/app/lib/features/notes/`',
        '  - done when: langkah hapus notes selesai; `pnpm check` hijau',
        '',
        '- [ ] T-003 Uji kinerja',
        `  - layer: ${layer} · depends_on: T-002 · refs: FR-01`,
        `  - files: ${files}`,
        '  - done when: skrip ukur lulus; **(manual)** angka di bawah batas; `pnpm check` hijau',
        '    1. `.env` ada di root, lalu `docker compose up -d --wait`.',
        '    2. `pnpm --filter api perf:measure` keluar dengan kode 0.',
      ].join('\n');
    const prd = { frIds: ['FR-01'], endpoints: [], nfrIds: [] };
    expect(validateTasks(apiOnly('test', '`apps/api/scripts/perf.ts`'), prd).errors).toEqual([]);
    const flutter = 'T-003 manual tanpa perintah Flutter web (`flutter run -d chrome …`)';
    expect(validateTasks(apiOnly('app', '`apps/api/scripts/perf.ts`'), prd).errors).toEqual([
      flutter,
    ]);
    expect(
      validateTasks(apiOnly('test', '`apps/app/integration_test/perf.dart`'), prd).errors,
    ).toEqual([flutter]);
  });

  it('done when multi-baris: sub-butir dan paragraf setelah baris kosong, tanpa langkah bernomor', () => {
    const md = editTask(tasks(), 'T-003', (b) =>
      b.replace(
        /- done when: .+$/m,
        [
          '- done when: migrasi di-commit dengan:',
          '    - unique dan CHECK sesuai PRD;',
          '    - FK sesuai PRD.',
          '',
          '    Integration test schema lulus; `pnpm check` hijau',
        ].join('\n'),
      ),
    );
    const parsed = parseTasks(md).find((t) => t.id === 'T-003');
    expect(parsed?.doneWhen).toBe(
      'migrasi di-commit dengan:\n- unique dan CHECK sesuai PRD;\n- FK sesuai PRD.\nIntegration test schema lulus; `pnpm check` hijau',
    );
    expect(validateTasks(md, PRD)).toEqual({ errors: [], warnings: [] });
    expect(parseTasks(tasks()).find((t) => t.id === 'T-015')?.doneWhen).not.toContain(
      'flutter run',
    );
  });
});

describe('regresi verifikasi manual T-014 (output nyata)', () => {
  const prd = readFileSync('test/fixtures/claude/verification/t014-prd.md', 'utf8');
  const info = { ...prdInfo(prd), nfrIds: nfrIds(prd) };
  const attempt = (n: number) =>
    extractMarkdown(loadClaudeFixture(`verification/t014-stage7-attempt${n}`).result);

  it('percobaan 1 (task manual khusus API tanpa Flutter web) sekarang diterima', () => {
    expect(validateTasks(attempt(1), info)).toEqual({
      errors: [],
      warnings: ['81 task, lebih dari 60 (target MVP 20–45 task)'],
    });
    expect(parseTasks(attempt(1)).find((t) => t.id === 'T-081')).toMatchObject({ layer: 'test' });
  });

  it('percobaan 2 (done when multi-baris) sekarang diterima', () => {
    expect(validateTasks(attempt(2), info)).toEqual({
      errors: [],
      warnings: ['86 task, lebih dari 60 (target MVP 20–45 task)'],
    });
    expect(parseTasks(attempt(2)).find((t) => t.id === 'T-029')?.doneWhen).toMatch(
      /^migrasi sudah di-commit dengan semua constraint PRD:\n[\s\S]+`pnpm check` hijau$/,
    );
  });
});

describe('prompts/stage-7.md', () => {
  it('punya versi, placeholder, dan aturan FR-08', () => {
    const prompt = loadPrompt('stage-7');
    expect(prompt.version).toBe('2');
    expect(prompt.body).toContain('Target 20 sampai 45 task untuk MVP.');
    expect(prompt.body).toContain('Satu task setara SATU sesi agent yang bermakna');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual([
      'layers',
      'conventions',
      'prd',
    ]);
    expect(prompt.body).toContain('JANGAN membuat task untuk ini');
    expect(prompt.body).toContain('Tepat SATU task "Hapus fitur contoh notes"');
    expect(prompt.body).toContain('SETIAP "done when" diakhiri dengan `pnpm check` hijau.');
    expect(prompt.body).toContain('--web-browser-flag=--incognito');
  });
});
