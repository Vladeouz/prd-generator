// Daftar isi dokumen Markdown (PRD dan TASKS): heading `##` berurutan, dengan id yang sama dengan
// yang dipasang `MarkdownPreview`.

export type OutlineItem = { id: string; no: string; label: string };

export const headingId = (prefix: string, index: number) => `${prefix}-${index}`;

/** Bagian 8 PRD disusun aplikasi dari data (D-05), bukan oleh AI. */
export const isAppendixHeading = (text: string) => /^8\.\s/.test(text.trim());

/** Sintaks Markdown inline yang tidak ikut tampil di daftar isi. */
const plain = (text: string) =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();

/**
 * Heading `##` di luar blok kode. Nomor bagian ("1." di "## 1. Context & Goal") dipisah dari
 * judulnya; heading tanpa nomor (misalnya "## Fase 0 — Fondasi" di TASKS) memakai nomor urut.
 */
export function documentOutline(markdown: string, prefix = 'bagian'): OutlineItem[] {
  const items: OutlineItem[] = [];
  let fence: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0] ?? null;
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^\s{0,3}##\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (!heading) continue;
    const text = plain(heading);
    const numbered = /^(\d+)\.\s+(.*)$/.exec(text);
    items.push({
      id: headingId(prefix, items.length + 1),
      no: numbered?.[1] ?? String(items.length + 1),
      label: numbered?.[2] ?? text,
    });
  }
  return items;
}

/** "FR-07: Perpanjangan" → `{ id: 'FR-07', rest: ': Perpanjangan' }`; null bila bukan judul FR/NFR. */
export function splitRequirementId(text: string): { id: string; rest: string } | null {
  const match = /^((?:N?FR)-\d+)(.*)$/s.exec(text);
  return match ? { id: match[1] ?? '', rest: match[2] ?? '' } : null;
}
