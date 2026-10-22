// Bagian `docs/conventions.md` yang dibawa setiap tahap (D-10, daftar dari spike T-022). Prompt
// hanya berisi bagian ini, apa adanya, bukan seluruh file (±77 KB); sumbernya tetap `TEMPLATE_DIR`
// (D-06). Heading yang tidak ada di template membuat tahap gagal sebelum `claude` dipanggil dan
// tampil sebagai masalah di halaman pengaturan (FR-07, FR-11).

/** Heading persis (satu baris) per tahap; setiap heading dibawa beserta sub-heading-nya. */
export const CONVENTION_SECTIONS = {
  stage6: [
    '## Struktur repo',
    '## Job (pg-boss)',
    '## Autentikasi',
    '## Port push dan storage',
    '## Pagination',
    '## Database',
    '## Format error',
    '## Clean Architecture API',
  ],
  review2: [
    '## Autentikasi',
    '## Pagination',
    '## Database',
    '## Format error',
    '## Clean Architecture API',
  ],
  // Daftar task: apa yang sudah disediakan template (agar tidak dibuat ulang), cara kerja task dan
  // `pnpm check`, prosedur menghapus fitur contoh notes, serta aturan skema dan kontrak yang
  // menentukan pembagian task (uji T-018: tabel per fitur, `contract:generate` bersama route).
  stage7a: [
    '## Struktur repo',
    '## Memulai proyek dan log task',
    '## Script dan perintah root',
    '## Database',
    '## Kontrak dan client Dart',
    '## Menghapus fitur contoh notes',
  ],
  // Detail task per fase: path, pola, dan perintah test untuk `files` dan *done when*.
  stage7b: [
    '## Struktur repo',
    '## Script dan perintah root',
    '## Clean Architecture API',
    '## Test API',
    '## Kontrak dan client Dart',
    '## Flutter',
  ],
} as const satisfies Record<string, readonly string[]>;

export type ConventionStage = keyof typeof CONVENTION_SECTIONS;

/** Nama tahap untuk pesan ke user. */
export const CONVENTION_STAGE_LABELS: Record<ConventionStage, string> = {
  stage6: 'tahap 6 (PRD)',
  review2: 'review kedua',
  stage7a: 'tahap 7a (daftar task)',
  stage7b: 'tahap 7b (detail task)',
};

export type SectionSelection = { ok: true; text: string } | { ok: false; missing: string[] };

const headingLevel = (line: string) => line.match(/^(#{1,6}) /)?.[1]?.length ?? 0;
/** Baris tanpa akhiran `\r` dan spasi di akhir, untuk dibandingkan dengan heading. */
const bare = (line: string) => line.replace(/\r$/, '').trimEnd();

/**
 * Bagian `markdown` per heading, berurutan sesuai `headings`, dipisah satu baris kosong. Setiap
 * bagian dimulai dari baris heading-nya sampai sebelum heading berikutnya yang setingkat atau lebih
 * tinggi (sub-heading ikut), dengan baris apa adanya (termasuk `\r` dan spasi di akhir). Heading di
 * dalam blok kode tidak dihitung. Semua heading yang tidak ditemukan dilaporkan sekaligus.
 */
export function selectSections(markdown: string, headings: readonly string[]): SectionSelection {
  const lines = markdown.split('\n');
  const inFence: boolean[] = [];
  let fenced = false;
  for (const line of lines) {
    const isFence = bare(line).startsWith('```');
    inFence.push(fenced || isFence);
    if (isFence) fenced = !fenced;
  }

  const missing: string[] = [];
  const parts: string[] = [];
  for (const heading of headings) {
    const start = lines.findIndex((line, i) => !inFence[i] && bare(line) === heading);
    if (start === -1) {
      missing.push(heading);
      continue;
    }
    const level = headingLevel(heading);
    let end = start + 1;
    while (end < lines.length) {
      const l = inFence[end] ? 0 : headingLevel(lines[end] ?? '');
      if (l > 0 && l <= level) break;
      end++;
    }
    const part = lines.slice(start, end);
    // Baris kosong di akhir bagian dibuang; pemisah antarbagian ditambahkan di bawah.
    while (part.length > 1 && bare(part.at(-1) ?? '') === '') part.pop();
    parts.push(part.join('\n'));
  }
  return missing.length > 0 ? { ok: false, missing } : { ok: true, text: parts.join('\n\n') };
}

/** Bagian konvensi untuk satu tahap. */
export function stageSections(conventions: string, stage: ConventionStage): SectionSelection {
  return selectSections(conventions, CONVENTION_SECTIONS[stage]);
}

/** Pesan masalah heading yang hilang untuk satu tahap, misalnya untuk halaman pengaturan. */
export function missingSectionsMessage(stage: ConventionStage, missing: string[]): string {
  const list = missing.map((heading) => `\`${heading}\``).join(', ');
  return `Bagian ${list} tidak ada di \`docs/conventions.md\` template, padahal dibutuhkan ${CONVENTION_STAGE_LABELS[stage]}. Perbarui salinan template atau sesuaikan daftar heading di \`src/template/sections.ts\`.`;
}

/** Semua masalah heading untuk semua tahap; kosong bila semua heading ada. */
export function sectionProblems(conventions: string): string[] {
  return (Object.keys(CONVENTION_SECTIONS) as ConventionStage[]).flatMap((stage) => {
    const selection = stageSections(conventions, stage);
    return selection.ok ? [] : [missingSectionsMessage(stage, selection.missing)];
  });
}
