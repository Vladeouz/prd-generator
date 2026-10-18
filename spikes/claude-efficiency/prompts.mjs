// Spike T-022: menyusun prompt tahap 2 dan tahap 6 dari data proyek uji T-012 ("Uji T-012"),
// memakai definisi tahap yang ada di src/ apa adanya. Database utama tidak disentuh: isinya
// disalin dulu ke folder sementara, karena `buildPrompt` tahap 6 mencatat commit template.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { MAIN_DATABASE_PATH, openDatabase } from '../../src/core/db/client.ts';
import { projects } from '../../src/core/db/schema.ts';
import { prdAppendix } from '../../src/projects/compose-prd.ts';
import { stage2Definition } from '../../src/stages/stage-2/definition.ts';
import { featureDraft } from '../../src/stages/stage-4/features.ts';
import { stage6Definition } from '../../src/stages/stage-6/definition.ts';
import { readTemplate } from '../../src/template/template.ts';

export const PROJECT_NAME = 'Uji T-012';

/**
 * Bagian `docs/conventions.md` untuk tahap 6 (konfigurasi D). Setiap heading diambil beserta
 * sub-heading-nya sampai heading berikutnya yang setingkat atau lebih tinggi.
 */
export const STAGE6_HEADINGS = [
  '## Struktur repo',
  '## Job (pg-boss)',
  '## Autentikasi',
  '## Port push dan storage',
  '## Pagination',
  '## Database',
  '## Format error',
  '## Clean Architecture API',
];

/** Memotong `markdown` per heading, apa adanya. Melempar error bila heading tidak ditemukan. */
export function selectSections(markdown, headings) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const level = (line) => line.match(/^(#{1,6}) /)?.[1].length ?? 0;
  return headings
    .map((heading) => {
      const start = lines.indexOf(heading);
      if (start === -1) throw new Error(`Heading tidak ditemukan di conventions: ${heading}`);
      const own = level(heading);
      let end = start + 1;
      let inFence = false;
      for (; end < lines.length; end++) {
        if (lines[end].startsWith('```')) inFence = !inFence;
        const l = inFence ? 0 : level(lines[end]);
        if (l > 0 && l <= own) break;
      }
      return lines.slice(start, end).join('\n').trimEnd();
    })
    .join('\n\n');
}

const FULL_HEADER = 'KONVENSI PROYEK (docs/conventions.md dari repo template, apa adanya):';
const SELECTED_HEADER =
  'KONVENSI PROYEK (bagian terpilih dari docs/conventions.md di repo template, apa adanya). ' +
  'File itu sudah ada di repo proyek dan dibaca agent bersama PRD. Di PRD, rujuk konvensi ini ' +
  'dengan menyebut nama bagiannya (misalnya "lihat docs/conventions.md bagian Format error"). ' +
  'JANGAN menyalin paragraf, tabel, atau blok kodenya ke PRD; tulis hanya keputusan yang khusus ' +
  'untuk produk ini:';
const FULL_RULE =
  '- Bagian 3 merangkum stack di bawah beserta konvensi proyek, singkat dan tegas. Konvensi proyek di bawah adalah sumber kebenaran; bila bertentangan dengan ringkasan stack, ikuti konvensi proyek.';
const SELECTED_RULE =
  '- Bagian 3 singkat: sebut stack dalam beberapa baris, lalu rujuk docs/conventions.md untuk detailnya. Konvensi proyek di bawah adalah sumber kebenaran; bila bertentangan dengan ringkasan stack, ikuti konvensi proyek. Jangan menulis ulang isi konvensi.';

// Konfigurasi F: batas ukuran PRD (NFR-06, ≤ 30 KB).
const LANGUAGE_LINE = 'Bahasa Indonesia yang jelas.';
const SIZE_RULES = `BATAS UKURAN (wajib): seluruh PRD paling banyak 30.000 karakter. Caranya:
- satu FR per fitur F-xx atau fitur rekomendasi yang diterima; jangan memecah FR per sub-fitur;
- 3 sampai 5 acceptance criteria per FR, dan paling banyak 3 edge case singkat;
- bagian 5 berupa tabel, satu baris per endpoint, dengan kolom: Endpoint ("METHOD /path"), Request, Response, Error, Akses;
- jangan mengulang isi yang sudah ada di bagian lain atau di docs/conventions.md.`;

function replaceOnce(text, from, to) {
  if (text.split(from).length !== 2)
    throw new Error(`Teks prompt tidak ditemukan tepat satu kali: ${from}`);
  return text.replace(from, () => to);
}

/** Prompt tahap 2, tahap 6 (konvensi utuh), dan tahap 6 dengan bagian konvensi terpilih. */
export async function buildPrompts() {
  const templateDir = process.env.TEMPLATE_DIR;
  const template = await readTemplate(templateDir);
  if (!template.ok) throw new Error(`TEMPLATE_DIR tidak valid: ${template.problems.join(' ')}`);

  const copyPath = join(mkdtempSync(join(tmpdir(), 'prd-generator-t022-')), 'copy.db');
  const source = new Database(MAIN_DATABASE_PATH, { readonly: true, fileMustExist: true });
  await source.backup(copyPath);
  source.close();

  const db = openDatabase(copyPath);
  try {
    const project = db
      .select()
      .from(projects)
      .all()
      .find((p) => p.name === PROJECT_NAME);
    if (!project) throw new Error(`Proyek "${PROJECT_NAME}" tidak ada di database utama.`);
    const context = { db, projectId: project.id };

    const stage2 = await stage2Definition().buildPrompt(context);
    const stage6 = await stage6Definition({ templateDir: () => templateDir }).buildPrompt(context);

    const conventions = template.template.conventions;
    const selected = selectSections(conventions, STAGE6_HEADINGS);
    let stage6Selected = replaceOnce(stage6, conventions, selected);
    stage6Selected = replaceOnce(stage6Selected, FULL_HEADER, SELECTED_HEADER);
    stage6Selected = replaceOnce(stage6Selected, FULL_RULE, SELECTED_RULE);
    const stage6Compact = replaceOnce(
      stage6Selected,
      LANGUAGE_LINE,
      `${SIZE_RULES}\n\n${LANGUAGE_LINE}`,
    );

    // Bahan pemeriksaan kualitas PRD (run.mjs): fitur yang harus punya FR dan keputusan proyek.
    const draft = featureDraft(db, project.id);
    return {
      projectId: project.id,
      templateCommit: template.template.commit,
      conventions,
      conventionsChars: conventions.length,
      selectedChars: selected.length,
      features: [
        ...(draft?.mvp_features ?? []).map((f) => ({ id: f.id, name: f.name })),
        ...(draft?.accepted_recommendations ?? []).map((f) => ({ id: f.id, name: f.name })),
      ],
      decisionCodes: prdAppendix(db, project.id).decisions.map((d) => d.code),
      prompts: { stage2, stage6, stage6Selected, stage6Compact },
    };
  } finally {
    db.$client.close();
  }
}
