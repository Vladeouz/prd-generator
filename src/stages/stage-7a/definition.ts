// Tahap 7a: daftar task singkat (FR-08, D-11). Bagian pertama job tahap 7; T-027 menjalankannya
// bersama 7b per fase dalam satu job, jadi definisi ini belum didaftarkan di registry.
// - Prompt berisi ringkasan PRD yang disusun aplikasi (`prdDigest`), bukan PRD utuh, dan bagian
//   konvensi tahap 7a dari `TEMPLATE_DIR` apa adanya (D-10).
// - Run dicatat sebagai `stage7a` (job tetap `stage7`).
import type { Db } from '../../core/db/client.ts';
import { latestDocument } from '../../projects/documents.ts';
import { formatPrdDigest, type PrdDigest, prdDigest } from '../../projects/prd-digest.ts';
import { readStageConventions } from '../conventions.ts';
import { extractJson } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import { type StageDefinition, StageFailedError } from '../run-stage.ts';
import { featureDraft } from '../stage-4/features.ts';
import { reachedStage } from '../stage-5/definition.ts';
import type { Stage6Options } from '../stage-6/definition.ts';
import { PLAN_LAYERS, TEMPLATE_TABLES } from '../task-rules.ts';
import { type Stage7aContext, type Stage7aOutput, validateStage7a } from './validate.ts';

/** Ringkasan PRD terbaru proyek; null bila PRD atau struktur fitur belum ada. */
export function projectDigest(db: Db, projectId: string): PrdDigest | null {
  const prd = latestDocument(db, projectId, 'prd')?.content;
  const draft = featureDraft(db, projectId);
  return prd && draft ? prdDigest(prd, draft) : null;
}

/** Konteks validasi dari ringkasan: kode PRD dan fitur beserta fasenya. */
export function stage7aContext(digest: PrdDigest): Stage7aContext {
  const features = new Map<string, number | null>();
  for (const phase of digest.phases) {
    for (const f of phase.features) features.set(f.id, phase.phase);
  }
  for (const f of digest.acceptedRecommendations) features.set(f.id, null);
  return {
    frIds: digest.frs.map((fr) => fr.id),
    nfrIds: digest.nfrs.map((nfr) => nfr.id),
    features,
    phases: digest.phases.map((p) => p.phase),
    tables: digest.tables,
  };
}

export function stage7aDefinition({
  templateDir = () => process.env.TEMPLATE_DIR,
}: Stage6Options = {}): StageDefinition<Stage7aOutput> {
  const prompt = loadPrompt('stage-7a');
  return {
    stage: 'stage7',
    runStage: 'stage7a',
    promptVersion: prompt.version,
    notReadyReason: ({ db, projectId }) =>
      latestDocument(db, projectId, 'prd') && reachedStage(db, projectId, 'stage7')
        ? null
        : 'Selesaikan PRD dan review kedua dulu sebelum menulis TASKS.',
    buildPrompt: async ({ db, projectId }) => {
      const { sections } = await readStageConventions(
        templateDir(),
        'stage7a',
        'daftar task belum bisa dibuat',
      );
      const digest = projectDigest(db, projectId);
      if (!digest) throw new StageFailedError('PRD atau struktur fitur belum ada.');
      return renderPrompt(prompt, {
        digest: formatPrdDigest(digest),
        conventions: sections,
        layers: PLAN_LAYERS.join(', '),
        templateTables: TEMPLATE_TABLES.join(', '),
      });
    },
    parse: (result) => extractJson(result) as Stage7aOutput,
    validate: (output, { db, projectId }) => {
      const digest = projectDigest(db, projectId);
      if (!digest) return { errors: ['PRD atau struktur fitur belum ada'] };
      return validateStage7a(output, stage7aContext(digest));
    },
  };
}
