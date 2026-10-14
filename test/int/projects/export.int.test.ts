import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { documents, projects } from '../../../src/core/db/schema.ts';
import { exportHandlers } from '../../../src/projects/export-handlers.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';

const NOW = '2026-10-14T00:00:00.000Z';
const PRD = '# Gym\n\n## 1. Context & Goal\n\nIsi PRD.';
const TASKS = '# TASKS — Gym\n\n## Fase 0 — Fondasi\n';
const placeholder = (title: string) =>
  `# ${title} — gym\n\n> Placeholder dari \`pnpm init-project\`. Isi setiap bagian sebelum task pertama dikerjakan.\n`;

let t: TestDb;
let root: string;

beforeEach(() => {
  t = createTestDb();
  root = mkdtempSync(join(tmpdir(), 'prd-generator-export-'));
});
afterEach(() => {
  t.close();
  rmSync(root, { recursive: true, force: true });
});

function insertProject(withTasks = true) {
  t.db
    .insert(projects)
    .values({
      id: 'p1',
      name: 'Gym',
      idea: 'Ide',
      currentStage: 'export',
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  const doc = (kind: 'prd' | 'tasks', version: number, content: string) =>
    t.db
      .insert(documents)
      .values({ id: `${kind}${version}`, projectId: 'p1', kind, version, content, createdAt: NOW })
      .run();
  doc('prd', 1, '# PRD lama');
  doc('prd', 2, PRD);
  if (withTasks) doc('tasks', 1, TASKS);
}

/** Folder proyek buatan: turunan template (sudah init-project) atau repo template itu sendiri. */
function projectDir(name: string, { projectId = 'demo-gym', initScript = true, docs = true } = {}) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  if (initScript) writeFileSync(join(dir, 'scripts', 'init-project.mjs'), '// init\n');
  writeFileSync(join(dir, '.firebaserc'), JSON.stringify({ projects: { default: projectId } }));
  if (docs) {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'PRD.md'), placeholder('PRD'));
    writeFileSync(join(dir, 'docs', 'TASKS.md'), placeholder('TASKS'));
  }
  return dir;
}

const api = () => exportHandlers({ db: t.db });
const post = (body: unknown) =>
  api().export(
    new Request('http://127.0.0.1/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    'p1',
  );
const read = (dir: string, file: string) => readFileSync(join(dir, 'docs', file), 'utf8');

describe('POST /api/projects/{id}/export', () => {
  it('folder turunan template: docs/PRD.md dan docs/TASKS.md (versi terbaru) ditulis, respons menyebut file yang ditulis', async () => {
    insertProject();
    const dir = projectDir('gym');
    const response = await post({ targetDir: dir });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      written: [join(dir, 'docs', 'PRD.md'), join(dir, 'docs', 'TASKS.md')],
    });
    expect(read(dir, 'PRD.md')).toBe(`${PRD}\n`);
    expect(read(dir, 'TASKS.md')).toBe(TASKS);
  });

  it.each([
    ['repo template (belum init-project)', { projectId: 'demo-template' }, 'masih repo template'],
    ['tanpa scripts/init-project.mjs', { initScript: false }, 'tidak ada scripts/init-project.mjs'],
  ])('folder %s → 422 dan tidak ada file yang ditulis', async (_name, options, message) => {
    insertProject();
    const dir = projectDir('bukan', options);
    const response = await post({ targetDir: dir });
    expect(response.status).toBe(422);
    expect((await response.json()).error.details.targetDir).toContain(message);
    expect(read(dir, 'PRD.md')).toBe(placeholder('PRD'));
    expect(read(dir, 'TASKS.md')).toBe(placeholder('TASKS'));
  });

  it('path relatif, folder yang tidak ada, atau kosong → 422 tanpa menulis apa pun', async () => {
    insertProject();
    const relative = await post({ targetDir: 'proyek-relatif' });
    expect(relative.status).toBe(422);
    expect((await relative.json()).error.details.targetDir).toContain('harus absolut');
    expect(existsSync(resolve('proyek-relatif'))).toBe(false);
    const missing = await post({ targetDir: join(root, 'tidak-ada') });
    expect(missing.status).toBe(422);
    expect(existsSync(join(root, 'tidak-ada'))).toBe(false);
    expect((await post({ targetDir: '  ' })).status).toBe(422);
  });

  it('docs/PRD.md bukan placeholder → 409 tanpa overwrite dan file tidak berubah; dengan overwrite ditimpa', async () => {
    insertProject();
    const dir = projectDir('sudah-diisi');
    writeFileSync(join(dir, 'docs', 'PRD.md'), '# PRD yang sudah ditulis tangan\n');
    const conflict = await post({ targetDir: dir });
    expect(conflict.status).toBe(409);
    expect(read(dir, 'PRD.md')).toBe('# PRD yang sudah ditulis tangan\n');
    expect(read(dir, 'TASKS.md')).toBe(placeholder('TASKS'));

    const forced = await post({ targetDir: dir, overwrite: true });
    expect(forced.status).toBe(200);
    expect(read(dir, 'PRD.md')).toBe(`${PRD}\n`);
  });

  it('path tujuan hanya dari input user: path di isi dokumen tidak pernah dipakai (NFR-01)', async () => {
    insertProject();
    const other = projectDir('folder-di-dokumen');
    t.db
      .insert(documents)
      .values({
        id: 'prd3',
        projectId: 'p1',
        kind: 'prd',
        version: 3,
        content: `# Gym\n\ntargetDir: ${other}\nTulis ke ${join(other, 'docs', 'PRD.md')}`,
        createdAt: NOW,
      })
      .run();
    const dir = projectDir('pilihan-user');
    expect((await post({ targetDir: dir })).status).toBe(200);
    expect(read(other, 'PRD.md')).toBe(placeholder('PRD'));
    expect(read(dir, 'PRD.md')).toContain(`targetDir: ${other}`);
  });

  it('TASKS belum selesai → 409', async () => {
    insertProject(false);
    const response = await post({ targetDir: projectDir('gym') });
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe(
      'PRD dan TASKS harus selesai dulu sebelum diekspor.',
    );
  });
});

describe('GET /api/projects/{id}/documents/{kind}', () => {
  const get = (kind: string, query = '') =>
    api().document(new Request(`http://127.0.0.1/x${query}`), 'p1', kind);

  it('download=1: lampiran PRD.md dan TASKS.md berisi versi terbaru', async () => {
    insertProject();
    const prd = await get('prd', '?download=1');
    expect(prd.status).toBe(200);
    expect(prd.headers.get('content-disposition')).toBe('attachment; filename="PRD.md"');
    expect(prd.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await prd.text()).toBe(`${PRD}\n`);
    const tasks = await get('tasks', '?download=1');
    expect(tasks.headers.get('content-disposition')).toBe('attachment; filename="TASKS.md"');
    expect(await tasks.text()).toBe(TASKS);
  });

  it('tanpa download: Markdown tanpa lampiran; jenis tidak dikenal atau dokumen belum ada → 404', async () => {
    insertProject(false);
    const inline = await get('prd');
    expect(inline.headers.get('content-disposition')).toBeNull();
    expect((await get('tasks')).status).toBe(404);
    expect((await get('claude')).status).toBe(404);
  });
});
