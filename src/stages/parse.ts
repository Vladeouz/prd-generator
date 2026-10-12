// Parser output tahap, diturunkan dari `extractJson` di docs/reference/e2e-gym.mjs.

/** Objek JSON dari teks model: code fence dibuang, lalu diambil dari `{` pertama sampai `}` terakhir. */
export function extractJson(text: string): unknown {
  const cleaned = text.replaceAll(/```(?:json)?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('tidak ada objek JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}
