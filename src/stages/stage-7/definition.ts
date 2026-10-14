// Tahap 7: TASKS dari PRD terbaru (FR-08).
// - Prompt berisi `docs/conventions.md` template apa adanya (setup yang sudah ada dan prosedur
//   menghapus fitur contoh notes) dan PRD terbaru; template yang tidak valid menggagalkan job sebelum
//   `claude` dipanggil (FR-11).
// - Validator memeriksa TASKS terhadap FR dan NFR di PRD yang sama.
// - Output yang valid disimpan sebagai dokumen `tasks` versi berikutnya; proyek pindah ke export.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { documents, projects } from '../../core/db/schema.ts';
import { latestDocument } from '../../projects/documents.ts';
import { readTemplate } from '../../template/template.ts';
import { extractMarkdown } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import { type StageDefinition, StageFailedError } from '../run-stage.ts';
import { reachedStage } from '../stage-5/definition.ts';
import type { Stage6Options } from '../stage-6/definition.ts';
import { prdInfo } from '../stage-6/validate.ts';
import { nfrIds, TASK_LAYERS, validateTasks } from './validate.ts';

export function stage7Definition({
  templateDir = () => process.env.TEMPLATE_DIR,
}: Stage6Options = {}): StageDefinition<string> {
  const prompt = loadPrompt('stage-7');
  return {
    stage: 'stage7',
    promptVersion: prompt.version,
    notReadyReason: ({ db, projectId }) =>
      latestDocument(db, projectId, 'prd') && reachedStage(db, projectId, 'stage7')
        ? null
        : 'Selesaikan PRD dan review kedua dulu sebelum menulis TASKS.',
    buildPrompt: async ({ db, projectId }) => {
      const template = await readTemplate(templateDir());
      if (!template.ok) {
        throw new StageFailedError(
          `Repo template belum valid, jadi TASKS belum bisa ditulis: ${template.problems.join(' ')} Perbaiki di halaman Pengaturan.`,
        );
      }
      db.update(projects)
        .set({ templateCommit: template.template.commit })
        .where(eq(projects.id, projectId))
        .run();
      return renderPrompt(prompt, {
        layers: TASK_LAYERS.join('|'),
        conventions: template.template.conventions,
        prd: latestDocument(db, projectId, 'prd')?.content ?? '',
      });
    },
    parse: (result) => extractMarkdown(result),
    validate: (md, { db, projectId }) => {
      const prd = latestDocument(db, projectId, 'prd')?.content ?? '';
      return validateTasks(md, { ...prdInfo(prd), nfrIds: nfrIds(prd) });
    },
    onSuccess: ({ tx, projectId, output, now }) => {
      const latest = latestDocument(tx, projectId, 'tasks');
      tx.insert(documents)
        .values({
          id: randomUUID(),
          projectId,
          kind: 'tasks',
          version: (latest?.version ?? 0) + 1,
          content: output,
          createdAt: now,
        })
        .run();
      tx.update(projects)
        .set({ currentStage: 'export', updatedAt: now })
        .where(eq(projects.id, projectId))
        .run();
    },
  };
}
