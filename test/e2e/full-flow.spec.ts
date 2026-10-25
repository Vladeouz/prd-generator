// Satu proyek dari input ide sampai export ke folder proyek buatan, lewat UI, dengan runner palsu
// mode `flow` (fixture nyata gym). Tahap 3 gagal validasi sekali lalu berhasil di percobaan ulang
// (FAKE_CLAUDE_INVALID_ONCE di playwright.config.ts).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { PROFILE_DEFAULTS } from '../../src/core/config/claude.ts';
import { e2eEnvironment } from './environment.ts';

const env = e2eEnvironment(process.env.PRD_E2E_DIR as string);

/**
 * Menjalankan tahap lewat tombolnya (dengan konfirmasi bila ada) sampai banner job hilang.
 * `preview`: label tahap; memastikan progres nyata dan cuplikan teks stream tampil selama job masih
 * berjalan. `reload`: halaman dimuat ulang di tengah job, dan progres terkini harus tampil lagi.
 * `steps`: jumlah langkah tahap berlangkah (tahap 7: 7a lalu detail fase); "Langkah i dari n" harus
 * tampil selama berjalan.
 */
async function runStage(
  page: Page,
  stage: string,
  button: string,
  confirm = false,
  { preview, reload = false, steps }: { preview?: string; reload?: boolean; steps?: number } = {},
) {
  const runner = page.getByTestId(`runner-${stage}`);
  await runner.getByRole('button', { name: button, exact: true }).click();
  if (confirm) await runner.getByRole('button', { name: 'Ya, jalankan' }).click();
  await expect(runner.getByTestId('job-banner')).toBeVisible();
  if (preview) {
    // Cuplikan ada di dalam banner, jadi terlihatnya cuplikan berarti job belum selesai.
    const expectProgress = async () => {
      await expect(runner.getByTestId('job-preview')).toBeVisible();
      await expect(runner.getByTestId('job-preview')).not.toBeEmpty();
      await expect(runner.getByTestId('job-progress-summary')).toContainText('karakter diterima');
      await expect(runner.getByTestId('job-status')).toHaveText(`${preview} sedang berjalan`);
      if (steps) {
        await expect(runner.getByTestId('job-progress-summary')).toContainText(
          new RegExp(`Langkah \\d dari ${steps}`),
        );
      }
    };
    await expectProgress();
    if (reload) {
      await page.reload();
      await expectProgress();
    }
  }
  await expect(runner.getByTestId('job-banner')).toBeHidden({ timeout: 30_000 });
  await expect(runner.getByTestId('job-error')).toHaveCount(0);
}

async function save(page: Page, button: string) {
  await page.getByRole('button', { name: button, exact: true }).click();
}

/** Membaca database server (read-only); hanya untuk memeriksa yang tidak tampil di layar. */
function query<T>(sql: string, ...params: unknown[]): T[] {
  const db = new Database(env.databasePath, { readonly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

const stageRuns = (projectId: string, stage: string) =>
  query<{ attempt: number; status: string; isCurrent: number; errorsJson: string | null }>(
    'select attempt, status, is_current as isCurrent, errors_json as errorsJson from stage_runs where project_id = ? and stage = ? order by attempt',
    projectId,
    stage,
  );

const documentVersions = (projectId: string) =>
  query<{ kind: string; version: number }>(
    'select kind, version from documents where project_id = ? order by created_at',
    projectId,
  ).map((d) => [d.kind, d.version]);

test('dari input ide sampai export, dengan satu percobaan ulang', async ({ page, request }) => {
  // Tahap 1: input ide.
  await page.goto('/');
  await page.getByLabel('Nama proyek').fill('Uji end-to-end');
  await page.getByRole('textbox', { name: 'Ide' }).fill('Aplikasi membership untuk sebuah gym.');
  await page.getByRole('button', { name: 'Buat proyek' }).click();
  await page.waitForURL(/\/projects\/[^/?]+/);
  const projectId = new URL(page.url()).pathname.split('/')[2] as string;

  // Tahap 2: klarifikasi produk, semua pertanyaan memakai default.
  await runStage(page, 'stage2', 'Jalankan klarifikasi produk');
  await save(page, 'Simpan jawaban');

  // Tahap 3: percobaan pertama ditolak validator, keterangannya tampil selama percobaan ulang.
  const runner3 = page.getByTestId('runner-stage3');
  await runner3.getByRole('button', { name: 'Jalankan klarifikasi teknis', exact: true }).click();
  await expect(runner3.getByTestId('attempt-note')).toContainText('Percobaan 2 dari 2');
  await expect(runner3.getByTestId('attempt-note')).toContainText('default_policy_key');
  await expect(runner3.getByTestId('job-banner')).toBeHidden({ timeout: 30_000 });
  await expect(runner3.getByTestId('job-error')).toHaveCount(0);
  const runs = stageRuns(projectId, 'stage3');
  expect(runs.map((r) => [r.attempt, r.status, r.isCurrent])).toEqual([
    [1, 'failed', 0],
    [2, 'succeeded', 1],
  ]);
  expect(runs[0]?.errorsJson).toContain('default_policy_key');
  await save(page, 'Simpan jawaban');

  // Tahap 4: struktur fitur, fitur rekomendasi tidak dicentang.
  await runStage(page, 'stage4', 'Jalankan struktur fitur');

  // Flowchart fitur (FR-12): pilih node dengan klik dan dengan keyboard, tanpa task sebelum 7a.
  const graph = page.getByTestId('graph-section');
  const detail = graph.getByRole('region', { name: 'Detail node' });
  await expect(graph.locator('.react-flow__node[data-id="feature-F-01"]')).toBeVisible();
  await expect(graph.locator('.react-flow__node-task')).toHaveCount(0);
  await expect(graph.getByTestId('node-task-count')).toHaveCount(0);
  await graph.getByRole('button', { name: 'Pas ke layar' }).click();
  // Fokus menggeser graf ke node itu (autoPanOnNodeFocus), lalu node diklik.
  const featureNode = graph.locator('.react-flow__node[data-id="feature-F-04"]');
  await featureNode.focus();
  await featureNode.click();
  await expect(detail.getByTestId('node-detail')).toContainText('F-04');
  await expect(detail).toContainText('Task tampil setelah daftar task (tahap 7) selesai.');
  await graph.locator('.react-flow__node[data-id="phase-1"]').focus();
  await page.keyboard.press('Enter');
  await expect(detail.getByTestId('node-detail')).toContainText(/Fase\s*1/);
  await page.keyboard.press('Escape');
  await expect(detail).toContainText('Pilih node dengan klik');
  await save(page, 'Simpan pilihan fitur');

  // Tahap 5: review kritis, rekomendasi setiap temuan.
  await runStage(page, 'stage5', 'Jalankan review kritis');
  await save(page, 'Simpan keputusan');

  // Tahap 6: PRD (dengan konfirmasi), lalu review kedua.
  await runStage(page, 'stage6', 'Jalankan penulisan prd', true, { preview: 'Penulisan PRD' });
  await runStage(page, 'review2', 'Jalankan review kedua');
  // Server tidak mewarisi profil Claude dari shell (T-040): kedua profil memakai bawaan.
  const profileOf = (stage: string) =>
    query<{ model: string; effort: string }>(
      'select model, effort from stage_runs where project_id = ? and stage = ? and is_current = 1',
      projectId,
      stage,
    );
  expect(profileOf('stage6')).toEqual([PROFILE_DEFAULTS.standard]);
  expect(profileOf('review2')).toEqual([PROFILE_DEFAULTS.reasoning]);
  // Rekomendasi fixture review kedua memuat satu perbaikan PRD: PRD ditulis ulang tepat sekali.
  await save(page, 'Simpan keputusan');
  await page.getByRole('button', { name: 'Ya, simpan dan tulis ulang PRD' }).click();

  // Tahap 7: TASKS (dengan konfirmasi), setelah PRD versi 2 selesai.
  await expect(
    page.getByTestId('runner-stage7').getByRole('button', { name: 'Jalankan penulisan tasks' }),
  ).toBeVisible({ timeout: 30_000 });
  expect(documentVersions(projectId)).toEqual([
    ['prd', 1],
    ['prd', 2],
  ]);
  await runStage(page, 'stage7', 'Jalankan penulisan tasks', true, {
    preview: 'Penulisan TASKS',
    reload: true,
    // Langkah 1: daftar task (7a); langkah 2: detail fase 0–3 bersamaan (7b, D-11, T-033).
    steps: 2,
  });

  // Flowchart setelah tahap 7: task di bawah fiturnya, dengan done when dari 7b.
  await page.goto(`/projects/${projectId}?tahap=7`);
  await expect(
    graph.locator('.react-flow__node[data-id="feature-F-01"]').getByTestId('node-task-count'),
  ).toHaveText(/^\d+ task$/);
  await graph.locator('.react-flow__node[data-id="task-T-004"]').focus();
  await page.keyboard.press('Enter');
  await expect(detail.getByTestId('node-detail')).toContainText('T-004');
  await expect(detail).toContainText('Done when');

  // Tahap 8: export ke folder proyek turunan template.
  await page.goto(`/projects/${projectId}?tahap=8`);
  await page.getByLabel('Folder proyek').fill(env.targetDir);
  await page.getByRole('button', { name: 'Tulis ke folder proyek' }).click();
  await expect(page.getByTestId('export-written').getByRole('listitem')).toHaveText([
    join(env.targetDir, 'docs', 'PRD.md'),
    join(env.targetDir, 'docs', 'TASKS.md'),
  ]);

  for (const [kind, file] of [
    ['prd', 'PRD.md'],
    ['tasks', 'TASKS.md'],
  ] as const) {
    const response = await request.get(`/api/projects/${projectId}/documents/${kind}`);
    expect(response.ok()).toBe(true);
    const written = readFileSync(join(env.targetDir, 'docs', file), 'utf8');
    expect(written.trimEnd()).toBe((await response.text()).replace(/\r\n/g, '\n').trimEnd());
  }
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: env.targetDir,
    encoding: 'utf8',
  });
  // Hanya kedua dokumen yang berubah di folder proyek (FR-09).
  expect(status.split('\n').filter(Boolean).sort()).toEqual([' M docs/PRD.md', ' M docs/TASKS.md']);
});
