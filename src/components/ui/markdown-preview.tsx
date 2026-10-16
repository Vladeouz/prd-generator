import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { headingId, isAppendixHeading, splitRequirementId } from './markdown-outline.ts';

type HastNode = { type: string; value?: string; children?: HastNode[] };

const textOf = (node: HastNode | undefined): string =>
  node?.type === 'text' ? (node.value ?? '') : (node?.children ?? []).map(textOf).join('');

/** Judul FR-xx/NFR-xx: ID-nya tampil dengan huruf mono berwarna aksen (mockup Prd.dc.html). */
function withRequirementId(children: ReactNode): ReactNode {
  const items = Array.isArray(children) ? children : [children];
  const [first, ...rest] = items;
  if (typeof first !== 'string') return children;
  const split = splitRequirementId(first);
  if (!split) return children;
  return (
    <>
      <span className="font-mono text-accent">{split.id}</span>
      {split.rest}
      {rest}
    </>
  );
}

type Props = {
  markdown: string;
  label: string;
  /** Awalan id heading `##`, agar daftar isi (`documentOutline`) bisa menautkannya. */
  idPrefix?: string;
};

/**
 * Pratinjau dokumen Markdown (GFM: tabel, checklist) dengan gaya `.prd-markdown` di globals.css.
 * Heading `##` diberi id berurutan, dan bagian 8 PRD ditandai sebagai susunan aplikasi (D-05).
 */
export function MarkdownPreview({ markdown, label, idPrefix = 'bagian' }: Props) {
  let index = 0;
  const components: Components = {
    h2: ({ node, children }) => {
      index += 1;
      const appendix = isAppendixHeading(textOf(node as HastNode));
      return (
        <>
          <h2 id={headingId(idPrefix, index)} tabIndex={-1}>
            {children}
          </h2>
          {appendix && (
            <p className="prd-markdown-note" data-testid="appendix-note">
              Disusun aplikasi dari buku keputusan dan jawabanmu, bukan ditulis AI.
            </p>
          )}
        </>
      );
    },
    h3: ({ children }) => <h3>{withRequirementId(children)}</h3>,
    // Tabel lebar bisa digulir ke samping; wilayahnya bisa difokus agar bisa digulir dengan keyboard.
    table: ({ children }) => (
      // biome-ignore lint/a11y/noNoninteractiveTabindex: wilayah gulir harus bisa difokus (WCAG 2.1.1).
      <section className="prd-markdown-table" aria-label="Tabel" tabIndex={0}>
        <table>{children}</table>
      </section>
    ),
    // Blok kode panjang (misalnya erDiagram) juga digulir ke samping.
    pre: ({ children }) => (
      // biome-ignore lint/a11y/noNoninteractiveTabindex: wilayah gulir harus bisa difokus (WCAG 2.1.1).
      <pre tabIndex={0}>{children}</pre>
    ),
  };
  return (
    <article aria-label={label} className="prd-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </article>
  );
}
