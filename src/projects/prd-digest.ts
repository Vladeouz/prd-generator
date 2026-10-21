// Ringkasan PRD untuk prompt tahap 7a (FR-08, D-11): disusun aplikasi dari PRD tersimpan dan draft
// fitur tahap 4, bukan PRD utuh. Isinya cukup untuk membuat daftar task dan merujuk kodenya: kode
// dan judul FR, kode NFR, endpoint, tabel, serta fase dan fitur.
import type { FeatureDraft } from '../stages/stage-4/features.ts';
import { prdInfo, prdSection } from '../stages/stage-6/validate.ts';

export type DigestFeature = { id: string; name: string };

export type PrdDigest = {
  frs: { id: string; title: string }[];
  nfrs: { id: string; title: string }[];
  /** `METHOD /path` unik, sesuai urutan di API Contract. */
  endpoints: string[];
  /** Nama entitas di erDiagram bagian 4. */
  tables: string[];
  phases: { phase: number; name: string; goal: string; features: DigestFeature[] }[];
  /** Fitur rekomendasi yang diterima user: ikut dikerjakan, belum punya fase. */
  acceptedRecommendations: DigestFeature[];
};

const trimTitle = (text: string, max = 80) =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

export function prdDigest(prdMd: string, draft: FeatureDraft): PrdDigest {
  const frs = [
    ...prdSection(prdMd, '## 6. Functional Requirements').matchAll(/^### (FR-\d{2}):\s*(.+)$/gm),
  ].map((m) => ({ id: m[1] as string, title: (m[2] as string).trim() }));

  const nfrSection = prdSection(prdMd, '## 7. Non-Functional Requirements');
  const nfrs: PrdDigest['nfrs'] = [];
  for (const line of nfrSection.split('\n')) {
    const match = line.match(/(NFR-\d{2})\b[*:\s]*(.*)$/);
    if (!match || nfrs.some((n) => n.id === match[1])) continue;
    // `**NFR-01 (Keamanan):** isi` → `Keamanan: isi`.
    const title = (match[2] ?? '')
      .replace(/\*\*/g, '')
      .replace(/^\(([^)]*)\):?/, '$1:')
      .replace(/^[:\s-]+/, '')
      .trim();
    nfrs.push({ id: match[1] as string, title: trimTitle(title) });
  }

  const er = prdMd.match(/```mermaid\s*\n\s*erDiagram([\s\S]*?)```/)?.[1] ?? '';
  const tables = [
    ...new Set([...er.matchAll(/^\s*([A-Za-z_]\w*)\s*\{/gm)].map((m) => m[1] as string)),
  ];

  const names = new Map(draft.mvp_features.map((f) => [f.id, f.name]));
  return {
    frs,
    nfrs,
    // Tanpa penanda tebal Markdown dan query string (`**GET /me**`, `GET /packages?x=1`).
    endpoints: [
      ...new Set(prdInfo(prdMd).endpoints.map((e) => e.replace(/\*+$/, '').replace(/\?.*$/, ''))),
    ],
    tables,
    phases: [...draft.phases]
      .sort((a, b) => a.phase - b.phase)
      .map((p) => ({
        phase: p.phase,
        name: p.name,
        goal: p.goal,
        features: p.feature_ids.map((id) => ({ id, name: names.get(id) ?? id })),
      })),
    acceptedRecommendations: draft.accepted_recommendations.map((f) => ({
      id: f.id,
      name: f.name,
    })),
  };
}

/** Teks ringkasan untuk prompt. */
export function formatPrdDigest(digest: PrdDigest): string {
  const lines = ['Functional Requirements:'];
  for (const fr of digest.frs) lines.push(`- ${fr.id}: ${fr.title}`);
  lines.push('', 'Non-Functional Requirements:');
  for (const nfr of digest.nfrs) lines.push(`- ${nfr.id}${nfr.title ? `: ${nfr.title}` : ''}`);
  lines.push('', 'Endpoint (API Contract):');
  for (const endpoint of digest.endpoints) lines.push(`- ${endpoint}`);
  lines.push('', `Tabel (erDiagram): ${digest.tables.join(', ') || '-'}`, '', 'Fase dan fitur:');
  for (const phase of digest.phases) {
    lines.push(`- Fase ${phase.phase} — ${phase.name}: ${phase.goal}`);
    for (const f of phase.features) lines.push(`  - ${f.id}: ${f.name}`);
  }
  lines.push(
    '',
    'Fitur rekomendasi yang diterima (ikut dikerjakan, tempatkan di fase yang sesuai):',
  );
  if (digest.acceptedRecommendations.length === 0) lines.push('- (tidak ada)');
  for (const f of digest.acceptedRecommendations) lines.push(`- ${f.id}: ${f.name}`);
  return lines.join('\n');
}
