import { readFileSync } from 'node:fs';
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
import { apiContractSection, prdExcerpt } from '../../../src/stages/stage-7b/prd-excerpt.ts';
import { nfrIds, parseTasks, validateTasks } from '../../../src/stages/stage-7b/tasks-markdown.ts';
import {
  type Stage7bOutput,
  type TaskDetail,
  validateStage7b,
} from '../../../src/stages/stage-7b/validate.ts';
import { TEMPLATE_MIGRATIONS, TEMPLATE_TABLES } from '../../helpers/template-repo.ts';

/** Daftar file template nyata (fixture verifikasi T-036, hasil `templateFiles()`). */
const TEMPLATE_FILES = (
  JSON.parse(
    readFileSync('test/fixtures/claude/verification/t036-template-files.json', 'utf8'),
  ) as {
    files: string[];
  }
).files;
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
    expect(edit({ files: ['docker-compose.yml'], file_notes: null })).toEqual([
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
  it('path dalam backtick, keterangan file_notes di luarnya (bisa disalin apa adanya)', () => {
    const md = compose();
    // T-020 gym: keterangan berisi backtick dan koma, dari TASKS rujukan.
    expect(md).toContain(
      '`apps/api/src/features/members/http/schemas.ts` (objek `Member`, `Period`)',
    );
    const filesLines = md.split('\n').filter((l) => l.startsWith('  - files: '));
    for (const line of filesLines) {
      const paths = [...line.matchAll(/`([^`]+)`(?: \(|,|$)/g)].map((m) => m[1] as string);
      expect(paths.every((p) => !/\s/.test(p))).toBe(true);
    }
  });

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

  it('API Contract dibawa utuh oleh apiContractSection, bukan oleh cuplikan per fase (T-042)', () => {
    const contract = apiContractSection(prd);
    expect(contract.startsWith('## 5. API Contract')).toBe(true);
    expect(contract).not.toContain('## 6. Functional Requirements');
    for (const phase of [0, 1, 2, 3]) {
      expect(prdExcerpt(prd, phaseTasks(list(), phase))).not.toContain('## 5. API Contract');
    }
    expect(apiContractSection('# PRD\n\n## 6. Functional Requirements\n')).toBe(
      '(PRD tidak punya bagian API Contract)',
    );
  });

  it('fase dengan task db membawa bagian 4 (Data Model)', () => {
    const phase0 = phaseTasks(list(), 0);
    expect(phase0.some((t) => t.layer === 'db')).toBe(true);
    expect(prdExcerpt(prd, phase0)).toContain('## 4. Data Model');
  });
});

describe('validateStage7b: aturan dari uji nyata T-018', () => {
  const tasks = () => phaseTasks(list(), 2);
  const first = () => detail(2).tasks[0] as TaskDetail;
  const edit = (change: Partial<TaskDetail>) => {
    const output = detail(2);
    output.tasks[0] = { ...first(), file_notes: null, ...change };
    return validateStage7b(output, tasks()).errors;
  };

  it('files berisi path saja; keterangan di file_notes untuk path yang ada di files', () => {
    const { id } = first();
    expect(edit({ files: ['apps/api/src/app.ts'] })).toEqual([]);
    expect(
      edit({
        files: ['apps/api/src/app.ts'],
        file_notes: { 'apps/api/src/app.ts': 'rakit route' },
      }),
    ).toEqual([]);
    expect(edit({ files: ['apps/api/src/app.ts (rakit route)'] })).toEqual([
      `${id} files "apps/api/src/app.ts (rakit route)" bukan path; tulis keterangannya di file_notes`,
    ]);
    expect(edit({ files: ['`apps/api/src/app.ts`'] })).toEqual([
      `${id} files "\`apps/api/src/app.ts\`" bukan path; tulis keterangannya di file_notes`,
    ]);
    expect(
      edit({ files: ['apps/api/src/app.ts'], file_notes: { 'apps/api/src/lain.ts': 'x' } }),
    ).toEqual([`${id} file_notes menyebut apps/api/src/lain.ts yang tidak ada di files`]);
  });

  it('path skema mengikuti konvensi Database template', () => {
    const { id } = first();
    expect(edit({ files: ['apps/api/src/db/schema/reservations.ts'] })).toEqual([]);
    expect(edit({ files: ['apps/api/src/db/schema.ts'] })).toEqual([
      `${id} files apps/api/src/db/schema.ts bertentangan dengan konvensi template: satu file per tabel di apps/api/src/db/schema/<tabel>.ts (konvensi Database)`,
    ]);
  });

  it('perintah test dengan `--` sebelum filter ditolak', () => {
    const { id } = first();
    const dash = `${id} done_when memakai \`--\` sebelum filter test; tulis \`pnpm --filter api test:int <filter>\` (dengan \`--\` filternya tidak berlaku)`;
    expect(edit({ done_when: ['`pnpm --filter api test:int reservations` lulus'] })).toEqual([]);
    expect(edit({ done_when: ['`pnpm --filter api test:int -- reservations` lulus'] })).toEqual([
      dash,
    ]);
    expect(edit({ done_when: ['`pnpm --filter api test -- require-role` lulus'] })).toEqual([dash]);
  });

  it('`pnpm check` hanya dalam kalimat larangan diterima; perintah menjalankannya tetap ditolak', () => {
    const { id } = first();
    const check = `${id} done_when menyebut \`pnpm check\`; aplikasi menambahkannya sendiri`;
    for (const allowed of [
      'pnpm check lain tidak dipakai; jalankan flutter test test/features/reservations',
      'Jangan jalankan `pnpm check` di sini, cukup `pnpm --filter api test:int seed-admin`',
      'Test unit lulus tanpa pnpm check (aplikasi menambahkannya)',
      '`pnpm check` bukan bagian kriteria ini. Test unit cancel-reservation lulus',
    ]) {
      expect(edit({ done_when: [allowed] }), allowed).toEqual([]);
    }
    for (const rejected of [
      '`pnpm check` hijau',
      'Test unit lulus; `pnpm check` hijau',
      // Larangan di kalimat lain tidak membenarkan perintah `pnpm check` di kalimat ini.
      'Tidak ada query N+1. `pnpm check` lulus',
    ]) {
      expect(edit({ done_when: [rejected] }), rejected).toEqual([check]);
    }
  });

  it('detail 7b nyata uji ulang T-018 fase 4 percobaan 2 diterima tanpa error (T-033)', () => {
    const fixture = loadClaudeFixture('verification/t018-ulang-stage7b-fase-4-attempt2');
    const output = JSON.parse(fixture.result.slice(fixture.result.indexOf('{')));
    const list = JSON.parse(loadClaudeFixture('verification/t018-ulang-stage7a').result);
    expect(validateStage7b(output, phaseTasks(list, 4)).errors).toEqual([]);
  });

  it('file baru yang menduplikasi file template ditolak; detail 7b nyata uji ulang T-018 fase 0 (T-036)', () => {
    const fixture = loadClaudeFixture('verification/t018-ulang-stage7b-fase-0');
    const output = JSON.parse(fixture.result.slice(fixture.result.indexOf('{')));
    const list = JSON.parse(loadClaudeFixture('verification/t018-ulang-stage7a').result);
    expect(validateStage7b(output, phaseTasks(list, 0), TEMPLATE_FILES).errors).toEqual([
      'T-002 files apps/api/src/features/users/http/users.route.ts adalah file baru dengan peran yang sama dengan file template apps/api/src/features/users/http/me.route.ts; ubah file template itu',
      'T-002 files apps/api/test/unit/features/users/http/users.route.test.ts adalah file baru dengan peran yang sama dengan file template apps/api/test/unit/features/users/http/me.route.test.ts; ubah file template itu',
    ]);
    // Tanpa daftar file template, aturan ini tidak berlaku (output yang sama lolos).
    expect(validateStage7b(output, phaseTasks(list, 0)).errors).toEqual([]);
  });

  it('migrasi dengan nomor yang sudah ada di template ditolak; detail 7b nyata uji ulang ketiga T-018 fase 0 (T-043)', () => {
    const fixture = loadClaudeFixture('verification/t018-ketiga-stage7b-fase-0');
    const output = JSON.parse(fixture.result.slice(fixture.result.indexOf('{')));
    const ketiga = JSON.parse(loadClaudeFixture('verification/t018-ketiga-stage7a').result);
    const schema = {
      tables: TEMPLATE_TABLES,
      migrations: TEMPLATE_MIGRATIONS,
      nextMigration: '0003',
    };
    const message = (id: string, path: string) =>
      `${id} files ${path} memakai nomor migrasi yang sudah ada di template; migrasi baru mulai dari 0003 (nomor akhirnya dibuat drizzle-kit lewat db:generate)`;
    expect(validateStage7b(output, phaseTasks(ketiga, 0), TEMPLATE_FILES, schema).errors).toEqual([
      message('T-001', 'apps/api/drizzle/0001_users_role_profile.sql'),
      message('T-004', 'apps/api/drizzle/0002_drop_notes.sql'),
    ]);
    // Tanpa skema template, aturan ini tidak berlaku (output yang sama lolos).
    expect(validateStage7b(output, phaseTasks(ketiga, 0), TEMPLATE_FILES).errors).toEqual([]);
    // Nomor berikutnya, nomor lebih besar, dan penanda tanpa nomor diterima.
    const first = () => detail(2).tasks[0] as TaskDetail;
    for (const path of [
      'apps/api/drizzle/0003_reservations.sql',
      'apps/api/drizzle/0007_reservations.sql',
      'apps/api/drizzle/NNNN_reservations.sql',
    ]) {
      const output2 = detail(2);
      output2.tasks[0] = { ...first(), file_notes: null, files: [path] };
      expect(validateStage7b(output2, phaseTasks(list(), 2), [], schema).errors, path).toEqual([]);
    }
  });

  it('fixture 7b gym dan uji ulang lain tidak terkena aturan file template (T-036)', () => {
    for (const phase of [0, 1, 2, 3]) {
      expect(
        validateStage7b(detail(phase), phaseTasks(list(), phase), TEMPLATE_FILES).errors,
      ).toEqual([]);
    }
    const fixture = loadClaudeFixture('verification/t018-ulang-stage7b-fase-4-attempt2');
    const output = JSON.parse(fixture.result.slice(fixture.result.indexOf('{')));
    const ulang = JSON.parse(loadClaudeFixture('verification/t018-ulang-stage7a').result);
    expect(validateStage7b(output, phaseTasks(ulang, 4), TEMPLATE_FILES).errors).toEqual([]);
  });

  it('unit test API yang menguji request HTTP dan status respons ditolak; dokumen OpenAPI dan integration test diterima (T-036)', () => {
    const { id } = first();
    const level = `${id} done_when menguji request HTTP dan status respons lewat unit test API; perilaku route diuji di integration test (\`pnpm --filter api test:int <filter>\`, konvensi Test API)`;
    for (const rejected of [
      'pnpm --filter api test me: PATCH /v1/me dengan phone tidak valid → 422',
      '`pnpm --filter api test reservations` lulus: POST /v1/reservations tanpa login mengembalikan 401',
    ]) {
      expect(edit({ done_when: [rejected] }), rejected).toEqual([level]);
    }
    for (const allowed of [
      'pnpm --filter api test:int me: PATCH /v1/me dengan phone tidak valid → 422',
      'pnpm --filter api test users: dokumen OpenAPI memuat PATCH /v1/me dengan operationId updateMe, respons 200/401/422',
      'pnpm --filter api test update-profile: fullName di-trim, field null tidak mengubah nilai lama',
      'pnpm --filter api test logger: nomor telepon dan token tidak ada di output captureLogger().raw()',
    ]) {
      expect(edit({ done_when: [allowed] }), allowed).toEqual([]);
    }
  });

  it('detail 7b nyata uji T-018 ditolak dengan alasan yang tepat', () => {
    const t018 = (phase: number) =>
      JSON.parse(loadClaudeFixture(`verification/t018-stage7b-fase-${phase}`).result);
    const t018List = JSON.parse(loadClaudeFixture('verification/t018-stage7a').result);
    const errorsOf = (phase: number) =>
      validateStage7b(t018(phase), phaseTasks(t018List, phase)).errors;
    const phase0 = errorsOf(0);
    expect(phase0).toContain(
      'T-001 files apps/api/src/db/schema.ts bertentangan dengan konvensi template: satu file per tabel di apps/api/src/db/schema/<tabel>.ts (konvensi Database)',
    );
    expect(phase0.some((e) => e.startsWith('T-001 files "apps/api/src/db/schema.ts (tabel'))).toBe(
      true,
    );
    expect(phase0.filter((e) => e.includes('memakai `--` sebelum filter test'))).not.toHaveLength(
      0,
    );
    for (const phase of [1, 2, 3]) {
      expect(errorsOf(phase).some((e) => e.includes('bukan path'))).toBe(true);
    }
  });
});

describe('prompts/stage-7b.md', () => {
  it('versi 6; konvensi, file template, skema template, dan API Contract di awal (awalan sama antarfase), task fase, dan bagian PRD yang dirujuk', () => {
    const prompt = loadPrompt('stage-7b');
    expect(prompt.version).toBe('6');
    // Skema dan migrasi template (T-043).
    expect(prompt.body).toContain('SKEMA DATABASE DAN MIGRASI YANG SUDAH ADA DI REPO TEMPLATE');
    expect(prompt.body).toContain('JANGAN memakai nomor migrasi yang sudah ada');
    expect(prompt.body).toContain('JANGAN menambah kolom yang sudah ada di tabel template');
    // API Contract PRD utuh dan larangan menambah field di luarnya (T-042).
    expect(prompt.body).toContain('API CONTRACT DARI PRD (bagian 5, utuh, sama untuk semua fase)');
    expect(prompt.body).toContain('JANGAN menambah field yang tidak ada di sana');
    expect(prompt.body).toContain('diawali "Catatan pertentangan:"');
    // File template dan aturannya (D-15, T-036).
    expect(prompt.body).toContain('FILE YANG SUDAH ADA DI REPO TEMPLATE');
    expect(prompt.body).toContain(
      'JANGAN membuat file baru dengan peran yang sama di folder yang sama',
    );
    // Level test sesuai konvensi Test API (T-036).
    expect(prompt.body).toContain('Level test mengikuti konvensi Test API');
    expect(prompt.body).toContain('isi log dari request itu, diuji di integration test');
    expect(prompt.body).toContain('PATH SAJA tanpa spasi, tanda kurung, atau backtick');
    expect(prompt.body).toContain('"file_notes"');
    expect(prompt.body).toContain('Perintah test dengan filter ditulis TANPA `--`');
    // Contoh perintah test berfilter yang benar per jenis test, dan contoh yang salah (T-033).
    expect(prompt.body).toContain('unit test API: `pnpm --filter api test create-reservation`');
    expect(prompt.body).toContain(
      'integration test API: `pnpm --filter api test:int reservations`',
    );
    expect(prompt.body).toContain(
      'test Flutter, dijalankan di `apps/app`: `flutter test test/features/reservations`',
    );
    expect(prompt.body).toContain(
      'Contoh yang SALAH: `pnpm --filter api test:int -- reservations`',
    );
    expect(prompt.body).toContain('JANGAN menyebut `pnpm check` sama sekali');
    expect(prompt.body).toContain('`apps/api/src/db/schema/<tabel>.ts`, bukan `schema.ts`');
    expect([...prompt.body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])).toEqual([
      'conventions',
      'templateFiles',
      'templateSchema',
      'apiContract',
      'phase',
      'phaseName',
      'phase',
      'tasks',
      'prd',
    ]);
    expect(prompt.body.startsWith('KONVENSI PROYEK')).toBe(true);
    expect(prompt.body).toContain('JANGAN menulis langkah persiapan');
  });
});
