// `injectFlaws` dan `scoreReview` dari docs/reference/e2e-gym.mjs, untuk membuktikan FR-06: draft
// yang sengaja diberi empat kesalahan, direview dengan output nyata tahap 5, harus tertangkap
// keempatnya. Logikanya sama dengan rujukan; hanya diberi tipe.
import type { Stage4Output } from '../../src/stages/stage-4/validate.ts';
import type { Stage5Output } from '../../src/stages/stage-5/validate.ts';

export type Flaw = { id: string; categories: string[]; keywords: string[]; note?: string };

export type FlawedDraft = Stage4Output & { assumptions_extra?: string[] };

export function injectFlaws(draft: Stage4Output): { draft: FlawedDraft; flaws: Flaw[] } {
  const d = structuredClone(draft) as FlawedDraft;
  const flaws: Flaw[] = [];
  const lastPhase = d.phases.reduce((a, b) => (b.phase > a.phase ? b : a));

  // 1. Scope creep: fitur yang tidak pernah diminta, ditandai seolah dari user.
  d.mvp_features.push({
    id: 'F-90',
    name: 'Leaderboard dan gamifikasi poin member',
    description: 'Member mendapat poin setiap check-in dan bersaing di papan peringkat.',
    source: 'user',
    sub_features: ['Poin per check-in', 'Papan peringkat bulanan'],
    depends_on: [],
  });
  lastPhase.feature_ids.push('F-90');
  flaws.push({
    id: 'scope_creep',
    categories: ['scope_creep', 'consistency'],
    keywords: ['leaderboard', 'gamifikasi', 'f-90'],
  });

  // 2. Urutan dependensi: fitur fondasi akun/login dipindah ke fase terakhir.
  const auth =
    d.mvp_features.find(
      (f) =>
        f.source === 'fondasi' &&
        /akun|login|masuk|auth|daftar/i.test(`${f.name} ${f.description}`),
    ) ?? d.mvp_features.find((f) => f.source === 'fondasi');
  if (auth) {
    for (const p of d.phases) p.feature_ids = p.feature_ids.filter((id) => id !== auth.id);
    lastPhase.feature_ids.push(auth.id);
    flaws.push({
      id: 'dependency_order',
      categories: ['dependency_order', 'security'],
      keywords: [auth.id.toLowerCase(), 'auth', 'login', 'akun', 'fondasi'],
      note: `${auth.id} ${auth.name} dipindah ke fase ${lastPhase.phase}`,
    });
  }

  // 3. Stack vs deployment: keputusan yang bertabrakan dengan profil.
  d.technical_decisions = [
    ...(d.technical_decisions ?? []),
    'Backend dideploy sebagai serverless function dengan database SQLite supaya gratis.',
  ];
  flaws.push({
    id: 'stack_deploy',
    categories: ['stack_deploy', 'consistency'],
    keywords: ['sqlite', 'serverless'],
  });

  // 4. Konsistensi: asumsi yang bertentangan dengan "sebuah gym".
  d.assumptions_extra = ['Aplikasi menjadi marketplace untuk banyak gym di satu kota.'];
  flaws.push({
    id: 'consistency',
    categories: ['consistency', 'scope_creep'],
    keywords: ['marketplace', 'banyak gym'],
  });

  return { draft: d, flaws };
}

export function scoreReview(review: Stage5Output, flaws: Flaw[]) {
  return flaws.map((flaw) => {
    const hit = review.findings.find((f) => {
      const text = `${f.finding} ${f.evidence}`.toLowerCase();
      return flaw.categories.includes(f.category) && flaw.keywords.some((k) => text.includes(k));
    });
    return { flaw: flaw.id, detected: Boolean(hit), by: hit?.id ?? null };
  });
}
