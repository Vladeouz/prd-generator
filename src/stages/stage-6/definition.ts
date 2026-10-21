// Tahap 6: PRD bagian 1–7 oleh AI, bagian 8 oleh aplikasi (FR-07, D-05, D-06).
// - Prompt berisi bagian `docs/conventions.md` tahap 6 dari `TEMPLATE_DIR` apa adanya (D-10,
//   `CONVENTION_SECTIONS.stage6`); commit template dicatat di `projects.template_commit` saat prompt
//   dibuat (NFR-04).
// - Template yang tidak valid atau heading yang hilang menggagalkan job sebelum `claude` dipanggil
//   (FR-07, FR-11).
// - Validator menolak PRD yang menyalin bagian konvensi yang dikirim di prompt.
// - Output yang valid disusun dengan bagian 8 (`composePrd`) dan disimpan sebagai dokumen `prd`
//   versi berikutnya. Proyek lalu pindah ke review kedua, atau ke TASKS bila PRD ini ditulis ulang
//   setelah keputusan review kedua.
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { decisions, documents, projects } from '../../core/db/schema.ts';
import { composePrd, prdAppendix } from '../../projects/compose-prd.ts';
import { readStageConventions } from '../conventions.ts';
import { extractMarkdown } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import type { StageDefinition } from '../run-stage.ts';
import { formatProductContext, productContext } from '../stage-2/context.ts';
import { formatTechnicalContext, technicalContext } from '../stage-3/context.ts';
import { featureDraft } from '../stage-4/features.ts';
import { reachedStage } from '../stage-5/definition.ts';
import { validatePrd } from './validate.ts';

export type Stage6Options = { templateDir?: () => string | undefined };

/** Keputusan untuk prompt: kode, kategori, temuan, dan pilihan user beserta konsekuensinya. */
export function formatDecisions(items: ReturnType<typeof prdAppendix>['decisions']): string {
  if (items.length === 0) return '- (tidak ada keputusan)';
  return items
    .map(
      (d) =>
        `- ${d.code} (${d.category}): ${d.finding}\n  DIPUTUSKAN: ${d.chosenOption}\n  Konsekuensi: ${d.consequence}`,
    )
    .join('\n');
}

export function stage6Definition({
  templateDir = () => process.env.TEMPLATE_DIR,
}: Stage6Options = {}): StageDefinition<string> {
  const prompt = loadPrompt('stage-6');
  // Bagian konvensi prompt terakhir, untuk validator. Aman karena hanya satu job berjalan dalam satu
  // waktu, dan buildPrompt selalu dipanggil sebelum validate dalam job yang sama.
  let sections: string | undefined;
  return {
    stage: 'stage6',
    promptVersion: prompt.version,
    notReadyReason: ({ db, projectId }) =>
      reachedStage(db, projectId, 'stage6')
        ? null
        : 'Simpan keputusan review kritis dulu sebelum menulis PRD.',
    buildPrompt: async ({ db, projectId }) => {
      const conventions = await readStageConventions(
        templateDir(),
        'stage6',
        'PRD belum bisa ditulis',
      );
      sections = conventions.sections;
      db.update(projects)
        .set({ templateCommit: conventions.commit })
        .where(eq(projects.id, projectId))
        .run();
      return renderPrompt(prompt, {
        conventions: conventions.sections,
        decisions: formatDecisions(prdAppendix(db, projectId).decisions),
        context: `${formatProductContext(productContext(db, projectId))}

${formatTechnicalContext(technicalContext(db, projectId))}`,
        draft: JSON.stringify(featureDraft(db, projectId), null, 2),
      });
    },
    parse: (result) => extractMarkdown(result),
    validate: (output) => validatePrd(output, { conventions: sections }),
    onSuccess: ({ tx, projectId, output, now }) => {
      const latest = tx
        .select({ version: documents.version })
        .from(documents)
        .where(and(eq(documents.projectId, projectId), eq(documents.kind, 'prd')))
        .orderBy(desc(documents.version))
        .get();
      tx.insert(documents)
        .values({
          id: randomUUID(),
          projectId,
          kind: 'prd',
          version: (latest?.version ?? 0) + 1,
          content: composePrd(output, prdAppendix(tx, projectId)),
          createdAt: now,
        })
        .run();
      // PRD yang ditulis ulang setelah keputusan review kedua langsung lanjut ke TASKS, sehingga
      // perbaikan review kedua membuat PRD ulang tepat satu kali (FR-07).
      const afterReview2 = tx
        .select({ id: decisions.id })
        .from(decisions)
        .where(and(eq(decisions.projectId, projectId), eq(decisions.origin, 'review2')))
        .get();
      tx.update(projects)
        .set({ currentStage: afterReview2 ? 'stage7' : 'review2', updatedAt: now })
        .where(eq(projects.id, projectId))
        .run();
    },
  };
}
