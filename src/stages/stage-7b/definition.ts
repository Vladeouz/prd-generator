// Tahap 7b: detail task satu fase (FR-08, D-11), dijalankan per fase oleh job tahap 7 (job.ts).
// - Prompt: bagian konvensi 7b dan daftar file template (D-15) di awal (sama untuk setiap fase,
//   sehingga bisa dibaca dari cache), lalu API Contract PRD utuh (T-042, juga sama untuk setiap
//   fase), task fase itu dari output 7a yang berlaku, dan hanya bagian PRD lain yang dirujuk task-nya.
// - Daftar file template yang dipakai prompt juga dipakai validator, sehingga keduanya sama.
// - Run dicatat sebagai `stage7b` dengan `scope` nomor fase; percobaan ulang (D-08) per fase.
import { STAGE_PROFILES } from '../../core/config/claude.ts';
import { latestDocument } from '../../projects/documents.ts';
import { templateFiles } from '../../template/files.ts';
import { readStageConventions } from '../conventions.ts';
import { extractJson } from '../parse.ts';
import { loadPrompt, renderPrompt } from '../prompt.ts';
import { currentOutput, type StageDefinition, StageFailedError } from '../run-stage.ts';
import type { Stage6Options } from '../stage-6/definition.ts';
import type { Stage7aOutput, Stage7aTask } from '../stage-7a/validate.ts';
import { apiContractSection, prdExcerpt } from './prd-excerpt.ts';
import { type Stage7bOutput, validateStage7b } from './validate.ts';

/** Task fase `phase` dari daftar 7a yang berlaku. */
export function phaseTasks(list: Stage7aOutput | null, phase: number): Stage7aTask[] {
  return (list?.tasks ?? []).filter((t) => t.phase === phase);
}

/**
 * Daftar file template untuk 7b (D-15). Gagal dibaca → `StageFailedError` yang menyebut penyebabnya
 * (FR-11). Job tahap 7 memanggilnya juga sebelum 7a, agar tahap gagal sebelum `claude` dipanggil.
 */
export async function readTemplateFiles(dir: string | undefined): Promise<string[]> {
  try {
    return await templateFiles(dir?.trim() ?? '');
  } catch (error) {
    throw new StageFailedError(
      `Daftar file repo template tidak bisa dibaca (git ls-files), jadi detail task belum bisa dibuat: ${(error as Error).message.trim()} Periksa TEMPLATE_DIR di halaman Pengaturan.`,
    );
  }
}

export function stage7bDefinition(
  phase: { phase: number; name: string },
  { templateDir = () => process.env.TEMPLATE_DIR }: Stage6Options = {},
): StageDefinition<Stage7bOutput> {
  const prompt = loadPrompt('stage-7b');
  const tasksOf = (db: Parameters<typeof currentOutput>[0], projectId: string) =>
    phaseTasks(currentOutput<Stage7aOutput>(db, projectId, 'stage7a'), phase.phase);
  // Diisi `buildPrompt`, yang selalu berjalan sebelum `validate` di `runStage`.
  let files: string[] = [];
  return {
    stage: 'stage7',
    runStage: 'stage7b',
    scope: String(phase.phase),
    promptVersion: prompt.version,
    profile: STAGE_PROFILES.stage7b,
    buildPrompt: async ({ db, projectId }) => {
      const { sections } = await readStageConventions(
        templateDir(),
        'stage7b',
        'detail task belum bisa dibuat',
      );
      const tasks = tasksOf(db, projectId);
      if (tasks.length === 0) {
        throw new StageFailedError(`Daftar task tidak punya task untuk fase ${phase.phase}.`);
      }
      files = await readTemplateFiles(templateDir());
      const prd = latestDocument(db, projectId, 'prd')?.content ?? '';
      return renderPrompt(prompt, {
        conventions: sections,
        templateFiles: files.join('\n'),
        apiContract: apiContractSection(prd),
        phase: String(phase.phase),
        phaseName: phase.name,
        tasks: JSON.stringify(tasks, null, 2),
        prd: prdExcerpt(prd, tasks),
      });
    },
    parse: (result) => extractJson(result) as Stage7bOutput,
    validate: (output, { db, projectId }) => validateStage7b(output, tasksOf(db, projectId), files),
  };
}
