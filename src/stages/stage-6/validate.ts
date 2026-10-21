// Kontrak output tahap 6 (FR-07), diturunkan dari `validatePrd` di docs/reference/e2e-gym.mjs.
// Perbedaan dari rujukan:
// - AI hanya menulis bagian 1 sampai 7; bagian 8 disusun aplikasi (D-05), jadi `## 8.` atau
//   `### Open Questions` di output adalah error;
// - heading harus berupa baris yang persis sama dan muncul dalam urutan PRD, dokumen dimulai dari
//   `# <Nama Produk>`;
// - tepat satu blok mermaid `erDiagram` (rujukan hanya memberi peringatan bila lebih dari satu);
// - PRD merujuk `docs/conventions.md` tanpa menyalinnya (D-10): paragraf atau blok kode konvensi
//   yang muncul utuh di PRD adalah error; ukuran di atas batas NFR-06 hanya peringatan;
// - FR boleh merujuk fitur rekomendasi `R-xx` selain fitur MVP `F-xx` (temuan spike T-022).
import type { StageValidation } from '../run-stage.ts';

export const PRD_HEADINGS = [
  '## 1. Context & Goal',
  '## 2. Scope',
  '### In scope',
  '### Non-goals',
  '## 3. Tech Constraints',
  '## 4. Data Model',
  '## 5. API Contract',
  '## 6. Functional Requirements',
  '## 7. Non-Functional Requirements',
] as const;

export const APPENDIX_HEADING = '## 8. Assumptions & Decisions';
export const OPEN_QUESTIONS_HEADING = '### Open Questions';

/** Batas peringatan ukuran PRD bagian 1–7 (NFR-06: target ±45 KB, peringatan di atas 50 KB). */
export const PRD_SIZE_WARN_BYTES = 50 * 1024;

/** Paragraf dan blok kode konvensi sependek ini terlalu umum untuk dianggap disalin. */
const MIN_COPIED_PARAGRAPH = 120;
const MIN_COPIED_CODE = 40;

const ENDPOINT = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/[^\s`|)]*/g;

/** Isi satu bagian `## ...` sampai bagian `## ` berikutnya (kosong bila heading tidak ada). */
export function prdSection(md: string, heading: string): string {
  const lines = md.split('\n');
  const start = lines.indexOf(heading);
  if (start === -1) return '';
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start, end === -1 ? undefined : end).join('\n');
}

export type PrdInfo = { frIds: string[]; endpoints: string[] };

function frBlocks(md: string) {
  return md.split(/\n(?=### FR-\d{2})/).filter((block) => /^### FR-\d{2}/.test(block));
}

/** Id FR dan endpoint di PRD, dipakai validator TASKS (tahap 7). */
export function prdInfo(md: string): PrdInfo {
  return {
    frIds: frBlocks(md).map((block) => block.match(/FR-\d{2}/)?.[0] as string),
    endpoints: prdSection(md, '## 5. API Contract').match(ENDPOINT) ?? [],
  };
}

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Paragraf (atau butir daftar/baris tabel) dan isi blok kode `conventions` yang muncul utuh di
 * `md`, setelah spasi dirapatkan. Heading tidak dihitung.
 */
export function copiedConventions(md: string, conventions: string): string[] {
  const units: string[] = [];
  const blocks = conventions.replaceAll('\r\n', '\n').split(/^```.*$/m);
  blocks.forEach((block, i) => {
    // Indeks ganjil: isi blok kode (di antara pagar pembuka dan penutup).
    if (i % 2 === 1) {
      if (normalize(block).length >= MIN_COPIED_CODE) units.push(normalize(block));
      return;
    }
    for (const paragraph of block.split(/\n\s*\n/)) {
      const lines = paragraph.split('\n').filter((line) => line.trim() && !/^#{1,6} /.test(line));
      const listLike = lines.some((line) => /^\s*([-*+]|\d+\.|\|)\s/.test(line));
      const pieces = listLike
        ? lines.map((line) => line.replace(/^\s*([-*+]|\d+\.)\s+/, ''))
        : [lines.join(' ')];
      for (const piece of pieces) {
        if (normalize(piece).length >= MIN_COPIED_PARAGRAPH) units.push(normalize(piece));
      }
    }
  });
  const prd = normalize(md);
  return [...new Set(units)].filter((unit) => prd.includes(unit));
}

export type ValidatePrdOptions = {
  /** Bagian konvensi yang dikirim di prompt; bila ada, PRD tidak boleh menyalinnya. */
  conventions?: string;
};

export function validatePrd(md: string, options: ValidatePrdOptions = {}): StageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = md.split('\n').map((line) => line.trimEnd());

  if (!/^# \S/.test(lines[0] ?? '')) errors.push('PRD harus dimulai dengan "# <Nama Produk>"');
  let previous = -1;
  for (const heading of PRD_HEADINGS) {
    const at = lines.indexOf(heading);
    if (at === -1) errors.push(`heading hilang: ${heading}`);
    else if (at < previous) errors.push(`heading tidak urut: ${heading}`);
    else previous = at;
  }
  if (lines.some((line) => line.startsWith('## 8.'))) {
    errors.push('bagian 8 ditulis oleh aplikasi; jangan tulis "## 8. Assumptions & Decisions"');
  }
  if (lines.includes(OPEN_QUESTIONS_HEADING)) {
    errors.push('Open Questions ditulis oleh aplikasi; jangan tulis "### Open Questions"');
  }

  const mermaid = [...md.matchAll(/```mermaid\s*\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
  const er = mermaid.filter((block) => /^\s*erDiagram/.test(block)).length;
  if (er === 0) errors.push('tidak ada blok mermaid erDiagram');
  if (er > 1) errors.push(`${er} blok mermaid erDiagram (harus tepat satu)`);
  if (mermaid.length > er) warnings.push(`${mermaid.length - er} blok mermaid selain erDiagram`);

  const { endpoints, frIds } = prdInfo(md);
  if (endpoints.length < 3) errors.push(`endpoint di API Contract hanya ${endpoints.length}`);

  const blocks = frBlocks(md);
  if (blocks.length < 3) errors.push(`hanya ${blocks.length} FR`);
  if (new Set(frIds).size !== frIds.length) errors.push('id FR tidak unik');
  blocks.forEach((block, i) => {
    const id = frIds[i];
    if (!block.includes('- [ ]')) errors.push(`${id} tanpa checklist acceptance criteria`);
    if (!/Given/i.test(block) || !/Then/i.test(block)) {
      warnings.push(`${id} acceptance criteria tidak berpola Given/When/Then`);
    }
    if (!/\b[FR]-\d{2}\b/.test(block)) warnings.push(`${id} tidak merujuk fitur F-xx atau R-xx`);
  });
  if (!/NFR-\d{2}/.test(prdSection(md, '## 7. Non-Functional Requirements'))) {
    errors.push('tidak ada NFR-xx di Non-Functional Requirements');
  }

  if (options.conventions) {
    const copied = copiedConventions(md, options.conventions);
    for (const unit of copied.slice(0, 3)) {
      errors.push(
        `PRD menyalin isi docs/conventions.md ("${unit.slice(0, 80)}…"); rujuk bagiannya, misalnya "lihat docs/conventions.md bagian Format error", jangan disalin`,
      );
    }
    if (copied.length > 3) {
      errors.push(`dan ${copied.length - 3} bagian konvensi lain yang disalin`);
    }
  }
  const bytes = new TextEncoder().encode(md).length;
  if (bytes > PRD_SIZE_WARN_BYTES) {
    warnings.push(
      `PRD ${Math.round(bytes / 1024)} KB, di atas batas NFR-06 (${PRD_SIZE_WARN_BYTES / 1024} KB); ringkas FR dan API Contract bila PRD dibuat ulang`,
    );
  }
  return { errors, warnings };
}
