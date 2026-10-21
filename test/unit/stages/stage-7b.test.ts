import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import {
  composeTasks,
  MANUAL_FLUTTER_WEB,
  MANUAL_PREPARATION,
} from '../../../src/projects/compose-tasks.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import { prdInfo } from '../../../src/stages/stage-6/validate.ts';
import type { Stage7aOutput, Stage7aTask } from '../../../src/stages/stage-7a/validate.ts';
import { phaseTasks } from '../../../src/stages/stage-7b/definition.ts';
import { prdExcerpt } from '../../../src/stages/stage-7b/prd-excerpt.ts';
import { nfrIds, parseTasks, validateTasks } from '../../../src/stages/stage-7b/tasks-markdown.ts';
import {
  type Stage7bOutput,
  type TaskDetail,
  validateStage7b,
} from '../../../src/stages/stage-7b/validate.ts';

const list = () => JSON.parse(loadClaudeFixture('derived/stage7a-gym').result) as Stage7aOutput;
const detail = (phase: number) =>
  JSON.parse(loadClaudeFixture(`derived/stage7b-gym-fase-${phase}`).result) as Stage7bOutput;
const stage4 = JSON.parse(loadClaudeFixture('stage4').result) as Stage4Output;
const prd = loadClaudeFixture('derived/stage6-gym').result;
const PRD = { ...prdInfo(prd), nfrIds: nfrIds(prd) };

function allDetails() {
  return new Map([0, 1, 2, 3].flatMap((p) => detail(p).tasks.map((d) => [d.id, d] as const)));
}
const compose = (details = allDetails(), tasks = list().tasks) =>
  composeTasks({ productName: stage4.product_name, phases: stage4.phases, tasks, details });

describe('validateStage7b', () => {
  it('menerima detail keempat fase (turunan TASKS uji end-to-end)', () => {
    for (const phase of [0, 1, 2, 3]) {
      expect(validateStage7b(detail(phase), phaseTasks(list(), phase))).toEqual({
        errors: [],
        warnings: [],
      });
    }
  });

  it('setiap task fase itu tepat sekali, tanpa task fase lain', () => {
    const tasks = phaseTasks(list(), 1);
    const output = detail(1);
    const [first, second] = output.tasks as [TaskDetail, TaskDetail];
    expect(validateStage7b({ tasks: output.tasks.slice(1) }, tasks).errors).toEqual([
      `${first.id} tidak ada di output`,
    ]);
    expect(validateStage7b({ tasks: [...output.tasks, second] }, tasks).errors).toEqual([
      `${second.id} muncul lebih dari sekali`,
    ]);
    const foreign = detail(0).tasks[0] as TaskDetail;
    expect(validateStage7b({ tasks: [...output.tasks, foreign] }, tasks).errors).toEqual([
      `${foreign.id} bukan task fase ini`,
    ]);
    expect(validateStage7b({}, tasks).errors).toEqual(['tasks bukan array']);
  });

  it('files dan done_when wajib; file setup template dan `pnpm check` ditolak', () => {
    const tasks = phaseTasks(list(), 2);
    const edit = (change: Partial<TaskDetail>) => {
      const output = detail(2);
      output.tasks[0] = { ...(output.tasks[0] as TaskDetail), ...change };
      return validateStage7b(output, tasks).errors;
    };
    const id = (detail(2).tasks[0] as TaskDetail).id;
    expect(edit({ files: [] })).toEqual([`${id} tanpa files`]);
    expect(edit({ files: ['docker-compose.yml'] })).toEqual([
      `${id} menyentuh file setup yang sudah disediakan template (Docker Compose)`,
    ]);
    expect(edit({ done_when: [] })).toEqual([`${id} tanpa done_when`]);
    expect(edit({ done_when: ['test lulus', '`pnpm check` hijau'] })).toEqual([
      `${id} done_when menyebut \`pnpm check\`; aplikasi menambahkannya sendiri`,
    ]);
  });

  it('manual berisi criterion dan steps tanpa langkah persiapan baku', () => {
    const tasks = phaseTasks(list(), 0);
    const output = detail(0);
    const manualTask = output.tasks.find((t) => t.manual) as TaskDetail;
    expect(manualTask.manual?.criterion).toBe('pendaftaran di web sesuai langkah di bawah');
    const edit = (manual: unknown) => {
      const copy = detail(0);
      const index = copy.tasks.findIndex((t) => t.id === manualTask.id);
      copy.tasks[index] = { ...manualTask, manual: manual as TaskDetail['manual'] };
      return validateStage7b(copy, tasks).errors;
    };
    expect(edit({ criterion: 'x' })).toEqual([
      `${manualTask.id} manual harus berisi criterion dan steps`,
    ]);
    expect(edit({ criterion: 'x', steps: ['`docker compose up -d`, lalu buka web'] })).toEqual([
      `${manualTask.id} manual.steps memuat langkah persiapan (.env, Docker, flutter run); aplikasi menambahkannya sendiri`,
    ]);
    expect(edit(null)).toEqual([]);
  });
});

describe('composeTasks', () => {
  it('susunan dari 7a + 7b lolos aturan FR-08 (validateTasks)', () => {
    const md = compose();
    expect(validateTasks(md, PRD)).toEqual({ errors: [], warnings: [] });
    expect(parseTasks(md).map((t) => t.id)).toEqual(list().tasks.map((t) => t.id));
    expect(
      md.startsWith('# TASKS — Aplikasi Membership Gym\n\n## Fase 0 — Fondasi\n\n- [ ] T-001 '),
    ).toBe(true);
    expect(md.match(/^## Fase \d+ — .+$/gm)).toEqual([
      '## Fase 0 — Fondasi',
      '## Fase 1 — Data Member',
      '## Fase 2 — Status dan Perpanjangan',
      '## Fase 3 — Notifikasi',
    ]);
  });

  it('setiap done when diakhiri `pnpm check` hijau oleh aplikasi', () => {
    const tasks = parseTasks(compose());
    expect(tasks.every((t) => t.doneWhen?.endsWith('`pnpm check` hijau'))).toBe(true);
  });

  it('task manual mendapat penanda (manual) dan langkah persiapan dari kode, Flutter web hanya untuk app', () => {
    const details = allDetails();
    const apiTask = list().tasks.find((t) => t.layer === 'api') as Stage7aTask;
    details.set(apiTask.id, {
      ...(details.get(apiTask.id) as TaskDetail),
      manual: { criterion: 'cek respons di Bruno', steps: ['Panggil `GET /health`: 200.'] },
    });
    const md = compose(details);
    expect(validateTasks(md, PRD).errors).toEqual([]);
    const block = (id: string) => parseTasks(md).find((t) => t.id === id)?.block ?? '';

    const appTask = list().tasks.find(
      (t) => details.get(t.id)?.manual && t.layer === 'app',
    ) as Stage7aTask;
    expect(block(appTask.id)).toContain(
      '; **(manual)** pendaftaran di web sesuai langkah di bawah; `pnpm check` hijau',
    );
    expect(block(appTask.id)).toContain(`1. ${MANUAL_PREPARATION}`);
    expect(block(appTask.id)).toContain(`2. ${MANUAL_FLUTTER_WEB}`);
    expect(block(appTask.id)).toContain('3. Daftar dengan email baru');

    expect(block(apiTask.id)).toContain(`1. ${MANUAL_PREPARATION}`);
    expect(block(apiTask.id)).toContain('2. Panggil `GET /health`: 200.');
    expect(block(apiTask.id)).not.toContain('flutter run');
  });

  it('task tanpa detail → error yang menyebut id-nya', () => {
    const details = allDetails();
    details.delete('T-005');
    expect(() => compose(details)).toThrow('Detail T-005 tidak ada.');
  });
});

describe('prdExcerpt', () => {
  it('hanya FR dan NFR yang dirujuk task fase itu, plus Data Model bila ada task db', () => {
    const phase1 = phaseTasks(list(), 1);
    const excerpt = prdExcerpt(prd, phase1);
    const refs = new Set(phase1.flatMap((t) => t.refs));
    for (const id of prdInfo(prd).frIds) {
      if (refs.has(id)) expect(excerpt).toContain(`### ${id}: `);
      else expect(excerpt).not.toContain(`### ${id}: `);
    }
    // Butir NFR yang dirujuk ikut; bagian NFR hanya berisi butir yang dirujuk.
    const nfrPart = excerpt.split('## Non-Functional Requirements yang dirujuk')[1] ?? '';
    for (const id of nfrIds(prd)) expect(nfrPart.includes(id)).toBe(refs.has(id));
    expect(excerpt.includes('erDiagram')).toBe(phase1.some((t) => t.layer === 'db'));
    expect(excerpt).not.toContain('## 5. API Contract');
    expect(excerpt.length).toBeLessThan(prd.length / 2);
  });

  it('fase dengan task db membawa bagian 4 (Data Model)', () => {
    const phase0 = phaseTasks(list(), 0);
    expect(phase0.some((t) => t.layer === 'db')).toBe(true);
    expect(prdExcerpt(prd, phase0)).toContain('## 4. Data Model');
  });
});

describe('prompts/stage-7b.md', () => {
  it('versi 1; konvensi di awal (awalan sama antarfase), task fase, dan bagian PRD yang dirujuk', () => {
    const prompt = loadPrompt('stage-7b');
    expect(prompt.version).toBe('1');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual([
      'conventions',
      'phase',
      'phaseName',
      'phase',
      'tasks',
      'prd',
    ]);
    expect(prompt.body.startsWith('KONVENSI PROYEK')).toBe(true);
    expect(prompt.body).toContain('JANGAN menulis `pnpm check`');
    expect(prompt.body).toContain('JANGAN menulis langkah persiapan');
  });
});
