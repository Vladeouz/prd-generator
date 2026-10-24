import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../../../src/core/clock.ts';
import { answers, decisions, documents, jobs, stageRuns } from '../../../src/core/db/schema.ts';
import { prdAppendix } from '../../../src/projects/compose-prd.ts';
import type { Stage2Output } from '../../../src/stages/stage-2/validate.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';
import type { Stage5Output } from '../../../src/stages/stage-5/validate.ts';
import { createTestDb, type TestDb } from '../../helpers/db.ts';
import {
  createFlow,
  GYM_FIXTURES as F,
  projectRow,
  projectThrough,
  putRequest,
  runStage,
} from '../../helpers/stage-flow.ts';
import {
  createTemplateRepo,
  EXPECTED_SECTIONS,
  TEMPLATE_CONVENTIONS,
  TEMPLATE_SECTIONS,
  type TemplateRepo,
} from '../../helpers/template-repo.ts';

let t: TestDb;
let template: TemplateRepo;
let tick: number;
const clock: Clock = () => new Date(Date.UTC(2026, 9, 14, 2, 0, tick++)).toISOString();

beforeEach(() => {
  t = createTestDb();
  template = createTemplateRepo();
  tick = 0;
});
afterEach(() => {
  t.close();
  template.remove();
});

const through5 = () => [F.stage2(), F.stage3(), F.stage4(), F.stage5()];
const prdDocuments = () =>
  t.db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, 'p1'), eq(documents.kind, 'prd')))
    .all()
    .sort((a, b) => a.version - b.version);
const stage5 = () => JSON.parse(F.stage5().result) as Stage5Output;
const aiBody = () => F.stage6().result;

describe('menjalankan tahap 6', () => {
  it('409 sebelum keputusan review kritis disimpan', async () => {
    const flow = createFlow(t.db, clock, through5(), { templateDir: template.dir });
    await projectThrough(flow, 'stage4');
    await runStage(flow, 'stage5');
    const response = await flow.jobsApi.run('p1', 'stage6');
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe(
      'Simpan keputusan review kritis dulu sebelum menulis PRD.',
    );
  });

  it('prompt hanya berisi bagian konvensi tahap 6 apa adanya dan semua keputusan; template_commit dicatat', async () => {
    const flow = createFlow(t.db, clock, [...through5(), F.stage6()], {
      templateDir: template.dir,
    });
    await projectThrough(flow, 'stage5');
    await runStage(flow, 'stage6');

    const prompt = flow.runner.prompts[4] as string;
    expect(prompt).toContain(`"""\n${EXPECTED_SECTIONS.stage6}\n"""`);
    // Bagian yang tidak terpilih (dan judul dokumen) tidak ikut.
    for (const unused of [
      TEMPLATE_SECTIONS.intro,
      TEMPLATE_SECTIONS.git,
      TEMPLATE_SECTIONS.flutter,
    ]) {
      expect(prompt).not.toContain(unused);
    }
    expect(prompt).toContain('JANGAN menyalin paragraf, tabel, atau blok kodenya ke PRD');
    expect(prompt).toContain('BATAS UKURAN (wajib): seluruh PRD paling banyak 45.000 karakter');
    expect(prompt).toContain('## 7. Non-Functional Requirements\n\nJANGAN menulis bagian 8');
    for (const f of stage5().findings) {
      expect(prompt).toContain(
        `- ${f.id} (${f.category}): ${f.finding}\n  DIPUTUSKAN: ${f.recommended_option}`,
      );
    }
    expect(prompt).toContain('DRAFT RENCANA (JSON):\n{\n  "product_name"');
    expect(prompt).not.toMatch(/\{\{\w+\}\}/);
    expect(projectRow(t.db)).toMatchObject({
      templateCommit: template.commit,
      currentStage: 'review2',
    });
    const run = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage6')))
      .get();
    expect(run).toMatchObject({ status: 'succeeded', promptVersion: '3', isCurrent: 1 });
  });

  it('PRD tersimpan: bagian 1–7 dari AI, bagian 8 dari data dengan teks keputusan yang sama persis', async () => {
    const flow = createFlow(t.db, clock, [...through5(), F.stage6()], {
      templateDir: template.dir,
    });
    await projectThrough(flow, 'stage5');
    // Kasus RV-08 di uji end-to-end: user memilih opsi yang bukan rekomendasi, dan PRD lama buatan
    // AI menulis keputusan itu berbeda dari datanya.
    const rv08 = stage5().findings.find(
      (f) => f.id === 'RV-08',
    ) as Stage5Output['findings'][number];
    const other = rv08.options.find(
      (o) => o.label !== rv08.recommended_option,
    ) as Stage5Output['findings'][number]['options'][number];
    const saved = await flow.decisionsApi.save(
      putRequest({ choices: [{ findingId: 'RV-08', option: other.label }] }),
      'p1',
      'review1',
    );
    expect(saved.status).toBe(200);
    await runStage(flow, 'stage6');

    const [doc] = prdDocuments();
    expect(doc?.version).toBe(1);
    const content = doc?.content as string;
    expect(content.startsWith(aiBody().trimEnd())).toBe(true);
    const appendix = content.slice(aiBody().trimEnd().length);
    expect(appendix.startsWith('\n\n## 8. Assumptions & Decisions\n')).toBe(true);
    expect(content.match(/^## 8\. /gm)).toHaveLength(1);
    expect(content.match(/^### Open Questions$/gm)).toHaveLength(1);

    const rows = t.db.select().from(decisions).where(eq(decisions.projectId, 'p1')).all();
    expect(rows).toHaveLength(stage5().findings.length);
    for (const d of rows) {
      expect(appendix).toContain(
        `- **${d.code}** (${d.category}): ${d.finding}\n  - Diputuskan: ${d.chosenOption}\n  - Konsekuensi: ${d.consequence}\n`,
      );
    }
    expect(appendix).toContain(
      `  - Diputuskan: ${other.label}\n  - Konsekuensi: ${other.consequence}`,
    );
    // Teks PRD lama buatan AI untuk RV-08 tidak ikut.
    expect(appendix).not.toContain('Owner dan staf sama-sama boleh');

    const product = JSON.parse(F.stage2().result) as Stage2Output;
    for (const a of product.assumptions) expect(appendix).toContain(`- ${a}\n`);
    const guesses = t.db
      .select()
      .from(answers)
      .where(and(eq(answers.projectId, 'p1'), eq(answers.source, 'guess')))
      .all();
    expect(guesses.map((g) => g.topic).sort()).toEqual(['masalah', 'pengguna']);
    expect(appendix).toContain('- **Tebakan (masalah):** ');
    for (const q of (JSON.parse(F.stage4().result) as Stage4Output).open_questions) {
      expect(appendix).toContain(`- ${q}\n`);
    }
    expect(prdAppendix(t.db, 'p1').decisions.map((d) => d.code)).toEqual(
      stage5().findings.map((f) => f.id),
    );
  });

  it('menjalankan ulang tahap 6 menyimpan PRD versi berikutnya', async () => {
    const flow = createFlow(t.db, clock, [...through5(), F.stage6(), F.stage6()], {
      templateDir: template.dir,
    });
    await projectThrough(flow, 'stage5');
    await runStage(flow, 'stage6');
    await runStage(flow, 'stage6');
    expect(prdDocuments().map((d) => d.version)).toEqual([1, 2]);
  });

  it('output dengan bagian 8 buatan AI ditolak lalu dicoba ulang dengan daftar error', async () => {
    const original = {
      ...F.stage6(),
      result: `${F.stage6().result}\n## 8. Assumptions & Decisions\n\n- x\n`,
    };
    const flow = createFlow(t.db, clock, [...through5(), original, F.stage6()], {
      templateDir: template.dir,
    });
    await projectThrough(flow, 'stage5');
    await runStage(flow, 'stage6');
    expect(flow.runner.prompts[5]).toContain(
      '- bagian 8 ditulis oleh aplikasi; jangan tulis "## 8. Assumptions & Decisions"',
    );
    expect(prdDocuments()).toHaveLength(1);
  });

  it('TEMPLATE_DIR tidak valid: job gagal dengan penyebabnya tanpa memanggil claude (FR-11)', async () => {
    const flow = createFlow(t.db, clock, through5(), { templateDir: undefined });
    await projectThrough(flow, 'stage5');
    const response = await flow.jobsApi.run('p1', 'stage6');
    expect(response.status).toBe(202);
    const job = await flow.queue.waitFor((await response.json()).id);
    expect(job?.status).toBe('failed');
    expect(job?.error).toContain('Repo template belum valid');
    expect(job?.error).toContain('`TEMPLATE_DIR` belum diisi');
    expect(flow.runner.prompts).toHaveLength(4);
    expect(prdDocuments()).toEqual([]);
    expect(t.db.select().from(jobs).where(eq(jobs.stage, 'stage6')).all()).toHaveLength(1);
    expect(projectRow(t.db)?.templateCommit).toBeNull();
  });

  it('heading konvensi tahap 6 tidak ada: job gagal menyebut heading-nya tanpa memanggil claude', async () => {
    template.remove();
    template = createTemplateRepo(
      TEMPLATE_CONVENTIONS.replace('## Format error', '## Error').replace(
        '## Database',
        '## Basis data',
      ),
    );
    const flow = createFlow(t.db, clock, through5(), { templateDir: template.dir });
    await projectThrough(flow, 'stage5');
    const response = await flow.jobsApi.run('p1', 'stage6');
    const job = await flow.queue.waitFor((await response.json()).id);
    expect(job?.status).toBe('failed');
    expect(job?.error).toBe(
      'PRD belum bisa ditulis: Bagian `## Database`, `## Format error` tidak ada di `docs/conventions.md` template, padahal dibutuhkan tahap 6 (PRD). Perbarui salinan template atau sesuaikan daftar heading di `src/template/sections.ts`.',
    );
    expect(flow.runner.prompts).toHaveLength(4);
    expect(prdDocuments()).toEqual([]);
    expect(projectRow(t.db)?.templateCommit).toBeNull();
  });

  it('PRD yang menyalin paragraf konvensi ditolak, lalu percobaan ulang yang merujuknya diterima', async () => {
    const paragraph =
      'Setiap error API dikembalikan sebagai objek error dengan code dari enum OpenAPI, message berbahasa Indonesia untuk ditampilkan, dan details per field bila validasi gagal.';
    template.remove();
    template = createTemplateRepo(
      TEMPLATE_CONVENTIONS.replace(
        TEMPLATE_SECTIONS.errors,
        `${TEMPLATE_SECTIONS.errors}\r\n\r\n${paragraph}`,
      ),
    );
    const copying = {
      ...F.stage6(),
      result: F.stage6().result.replace(
        '## 4. Data Model',
        `Format error:\n${paragraph.replace(' dengan code', '\ndengan code')}\n\n## 4. Data Model`,
      ),
    };
    const flow = createFlow(t.db, clock, [...through5(), copying, F.stage6()], {
      templateDir: template.dir,
    });
    await projectThrough(flow, 'stage5');
    await runStage(flow, 'stage6');

    const runs = t.db
      .select()
      .from(stageRuns)
      .where(and(eq(stageRuns.projectId, 'p1'), eq(stageRuns.stage, 'stage6')))
      .all()
      .sort((a, b) => a.attempt - b.attempt);
    expect(runs.map((r) => r.status)).toEqual(['failed', 'succeeded']);
    expect(JSON.parse(runs[0]?.errorsJson ?? '[]')).toEqual([
      `PRD menyalin isi docs/conventions.md ("${paragraph.slice(0, 80)}…"); rujuk bagiannya, misalnya "lihat docs/conventions.md bagian Format error", jangan disalin`,
    ]);
    expect(prdDocuments()).toHaveLength(1);
  });
});
