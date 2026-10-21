// Bagian PRD untuk prompt tahap 7b satu fase (FR-08): hanya yang dirujuk task fase itu, bukan PRD
// utuh. Isinya blok `### FR-xx` dan butir `NFR-xx` yang ada di `refs`, ditambah bagian 4 (Data Model)
// bila fase itu punya task layer `db`, karena task skema merujuk tabel, bukan FR tertentu.
import { prdSection } from '../stage-6/validate.ts';
import type { Stage7aTask } from '../stage-7a/validate.ts';

function frBlocks(prdMd: string): Map<string, string> {
  const section = prdSection(prdMd, '## 6. Functional Requirements');
  const blocks = new Map<string, string>();
  for (const block of section.split(/\n(?=### FR-\d{2})/)) {
    const id = block.match(/^### (FR-\d{2})/)?.[1];
    if (id) blocks.set(id, block.trimEnd());
  }
  return blocks;
}

/** Butir NFR: baris yang menyebut kodenya, beserta baris lanjutan berindentasi. */
function nfrItems(prdMd: string): Map<string, string> {
  const lines = prdSection(prdMd, '## 7. Non-Functional Requirements').split('\n');
  const items = new Map<string, string>();
  lines.forEach((line, i) => {
    const id = line.match(/NFR-\d{2}/)?.[0];
    if (!id || items.has(id) || /^#{1,3} /.test(line)) return;
    const item = [line];
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j] ?? ''); j++)
      item.push(lines[j] ?? '');
    items.set(id, item.join('\n').trimEnd());
  });
  return items;
}

export function prdExcerpt(prdMd: string, tasks: Stage7aTask[]): string {
  const refs = new Set(tasks.flatMap((t) => t.refs));
  const frs = frBlocks(prdMd);
  const nfrs = nfrItems(prdMd);
  const parts: string[] = [];
  if (tasks.some((t) => t.layer === 'db')) {
    parts.push(prdSection(prdMd, '## 4. Data Model').trimEnd());
  }
  const frParts = [...frs].filter(([id]) => refs.has(id)).map(([, block]) => block);
  if (frParts.length)
    parts.push(['## Functional Requirements yang dirujuk', ...frParts].join('\n\n'));
  const nfrParts = [...nfrs].filter(([id]) => refs.has(id)).map(([, item]) => item);
  if (nfrParts.length) {
    parts.push(['## Non-Functional Requirements yang dirujuk', ...nfrParts].join('\n'));
  }
  return parts.join('\n\n') || '(task fase ini tidak merujuk FR atau NFR)';
}
