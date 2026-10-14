// Pemeriksaan otomatis untuk review kedua (FR-07): rute UI form edit (`/items/{id}/edit` atau
// `/items/:id/edit`) yang tidak punya `GET` per item di API Contract, misalnya kasus uji agent
// `daftar-belanja`: form edit tidak bisa diisi data lama tanpa endpoint itu. Celah yang ditemukan
// dikirim ke prompt dan wajib menjadi temuan `ui_endpoint`.
import { prdSection } from '../stage-6/validate.ts';

export type EndpointGap = { route: string; missing: string; resource: string };

const PARAM = /\{[^}]+\}|:\w+/g;
const EDIT_ROUTE = /(?:\/[\w-]+)*\/(?:\{[^}]+\}|:\w+)\/edit\b/g;
const ENDPOINT = /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s`|)*?]*)/g;

/** Path dengan parameter diseragamkan: `/items/{id}` dan `/items/:itemId` → `/items/{}`. */
export const normalizePath = (path: string) => path.replaceAll(PARAM, '{}').replace(/\/+$/, '');

export function endpointGaps(md: string): EndpointGap[] {
  const gets = [...prdSection(md, '## 5. API Contract').matchAll(ENDPOINT)]
    .filter((m) => m[1] === 'GET')
    .map((m) => normalizePath(m[2] ?? ''));
  const gaps = new Map<string, EndpointGap>();
  for (const route of md.match(EDIT_ROUTE) ?? []) {
    const item = route.replace(/\/edit$/, '');
    const resource = normalizePath(item);
    const served = gets.some((path) => path === resource || path.endsWith(resource));
    if (!served && !gaps.has(resource)) {
      gaps.set(resource, { route, missing: `GET ${item}`, resource });
    }
  }
  return [...gaps.values()];
}

/** Teks untuk prompt review kedua. */
export function formatGaps(gaps: EndpointGap[]): string {
  if (gaps.length === 0) return '- (tidak ada)';
  return gaps
    .map((g) => `- Rute UI ${g.route} tidak punya endpoint pendukung ${g.missing}.`)
    .join('\n');
}
