import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Pratinjau dokumen Markdown (GFM: tabel, checklist) dengan gaya `.prd-markdown` di globals.css. */
export function MarkdownPreview({ markdown, label }: { markdown: string; label: string }) {
  return (
    <article aria-label={label} className="prd-markdown">
      <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
    </article>
  );
}
