// Parser output tahap, diturunkan dari `extractJson` di docs/reference/e2e-gym.mjs.

/** Objek JSON dari teks model: code fence dibuang, lalu diambil dari `{` pertama sampai `}` terakhir. */
export function extractJson(text: string): unknown {
  const cleaned = text.replaceAll(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('tidak ada objek JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Dokumen Markdown dari teks model (tahap 6–7), diturunkan dari `extractMarkdown` di e2e-gym.mjs:
 * blok kode pembungkus dibuang, lalu diambil mulai dari heading `# ` pertama.
 */
export function extractMarkdown(text: string): string {
  let cleaned = text.trim();
  const fenced = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenced) cleaned = (fenced[1] ?? '').trim();
  const heading = cleaned.indexOf('# ');
  if (heading === -1) throw new Error('tidak ada heading markdown');
  return cleaned.slice(heading);
}
