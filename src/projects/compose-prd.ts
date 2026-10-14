// Bagian 8 PRD disusun aplikasi dari data, bukan oleh AI (FR-07, D-05): keputusan tersimpan ditulis
// apa adanya, sehingga tidak bisa bergeser saat PRD ditulis ulang (kasus RV-08 di uji end-to-end:
// AI menulis "owner dan staf sama-sama boleh", padahal keputusannya "sementara hanya pemilik").
//
// Isi bagian 8:
// - Keputusan: D-01, RV-xx, lalu RV2-xx, masing-masing dengan temuan, opsi yang dipilih, dan
//   konsekuensinya;
// - Asumsi: asumsi produk (tahap 2) dan teknis (tahap 3);
// - Open Questions: jawaban bertanda tebakan (`source: guess`) dan pertanyaan terbuka tahap 4.
import { and, eq } from 'drizzle-orm';
import type { Db } from '../core/db/client.ts';
import { answers, decisions } from '../core/db/schema.ts';
import { currentOutput, type Tx } from '../stages/run-stage.ts';
import type { Stage2Output } from '../stages/stage-2/validate.ts';
import type { Stage3Output } from '../stages/stage-3/validate.ts';
import type { Stage4Output } from '../stages/stage-4/validate.ts';
import { APPENDIX_HEADING, OPEN_QUESTIONS_HEADING } from '../stages/stage-6/validate.ts';

export type AppendixDecision = {
  code: string;
  category: string;
  finding: string;
  chosenOption: string;
  consequence: string;
};

export type AppendixGuess = { topic: string; question: string; value: string | string[] };

export type PrdAppendix = {
  decisions: AppendixDecision[];
  assumptions: string[];
  guesses: AppendixGuess[];
  openQuestions: string[];
};

const ORIGIN_ORDER = ['profile', 'review1', 'review2'];

const list = (items: string[]) => (items.length ? items : ['Tidak ada.']).map((i) => `- ${i}`);

/** PRD lengkap: bagian 1–7 dari AI, lalu bagian 8 dari data. */
export function composePrd(body: string, appendix: PrdAppendix): string {
  const decisionLines = appendix.decisions.length
    ? appendix.decisions.flatMap((d) => [
        `- **${d.code}** (${d.category}): ${d.finding}`,
        `  - Diputuskan: ${d.chosenOption}`,
        `  - Konsekuensi: ${d.consequence}`,
      ])
    : list([]);
  const questions = [
    ...appendix.guesses.map(
      (g) =>
        `**Tebakan (${g.topic.replaceAll('_', ' ')}):** ${g.question} Jawaban yang dipakai: ${[g.value].flat().join(', ')}.`,
    ),
    ...appendix.openQuestions,
  ];
  return [
    body.trimEnd(),
    '',
    APPENDIX_HEADING,
    '',
    'Bagian ini disusun aplikasi dari keputusan dan jawaban yang tersimpan, bukan ditulis AI.',
    '',
    '### Keputusan',
    '',
    ...decisionLines,
    '',
    '### Asumsi',
    '',
    ...list(appendix.assumptions),
    '',
    OPEN_QUESTIONS_HEADING,
    '',
    ...list(questions),
    '',
  ].join('\n');
}

/** Data bagian 8 untuk proyek; bisa dibaca di dalam transaksi pencatatan output tahap 6. */
export function prdAppendix(db: Db | Tx, projectId: string): PrdAppendix {
  const reader = db as Db;
  const rows = reader.select().from(decisions).where(eq(decisions.projectId, projectId)).all();
  rows.sort(
    (a, b) =>
      ORIGIN_ORDER.indexOf(a.origin) - ORIGIN_ORDER.indexOf(b.origin) ||
      a.code.localeCompare(b.code),
  );
  const stage2 = currentOutput<Stage2Output>(reader, projectId, 'stage2');
  const stage3 = currentOutput<Stage3Output>(reader, projectId, 'stage3');
  const stage4 = currentOutput<Stage4Output>(reader, projectId, 'stage4');
  const guessRows = reader
    .select()
    .from(answers)
    .where(and(eq(answers.projectId, projectId), eq(answers.source, 'guess')))
    .all();
  const questionText = (id: string) => stage2?.questions.find((q) => q.id === id)?.question ?? id;
  return {
    decisions: rows.map(({ code, category, finding, chosenOption, consequence }) => ({
      code,
      category,
      finding,
      chosenOption,
      consequence,
    })),
    assumptions: [...(stage2?.assumptions ?? []), ...(stage3?.assumptions ?? [])],
    guesses: guessRows
      .map((row) => ({
        topic: row.topic,
        question: row.stage === 'stage2' ? questionText(row.questionId) : row.questionId,
        value: JSON.parse(row.valueJson) as string | string[],
        order: stage2?.questions.findIndex((q) => q.id === row.questionId) ?? 0,
      }))
      .sort((a, b) => a.order - b.order)
      .map(({ order: _order, ...guess }) => guess),
    openQuestions: stage4?.open_questions ?? [],
  };
}
