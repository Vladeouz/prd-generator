// Bagian konvensi template untuk prompt tahap (D-06, D-10): dibaca dari `TEMPLATE_DIR` saat prompt
// dibuat. Template yang tidak valid atau heading yang hilang menggagalkan job sebelum `claude`
// dipanggil, dengan pesan yang menyebut masalahnya (FR-07, FR-11).
import {
  type ConventionStage,
  missingSectionsMessage,
  stageSections,
} from '../template/sections.ts';
import { readTemplate } from '../template/template.ts';
import { StageFailedError } from './run-stage.ts';

export type StageConventions = { commit: string; sections: string };

/** `action`: apa yang tertunda, untuk pesan error (misalnya "PRD belum bisa ditulis"). */
export async function readStageConventions(
  templateDir: string | undefined,
  stage: ConventionStage,
  action: string,
): Promise<StageConventions> {
  const template = await readTemplate(templateDir);
  if (!template.ok) {
    throw new StageFailedError(
      `Repo template belum valid, jadi ${action}: ${template.problems.join(' ')} Perbaiki di halaman Pengaturan.`,
    );
  }
  const selection = stageSections(template.template.conventions, stage);
  if (!selection.ok) {
    throw new StageFailedError(
      `${action[0]?.toUpperCase()}${action.slice(1)}: ${missingSectionsMessage(stage, selection.missing)}`,
    );
  }
  return { commit: template.template.commit, sections: selection.text };
}
