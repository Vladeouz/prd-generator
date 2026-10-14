import Link from 'next/link';
import { buttonClass } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { MarkdownPreview } from '../../../components/ui/markdown-preview.tsx';
import type { ProjectDetail } from '../../../projects/projects.ts';

type Kind = 'prd' | 'tasks';
const FILE: Record<Kind, string> = { prd: 'PRD.md', tasks: 'TASKS.md' };

export const downloadHref = (projectId: string, kind: Kind) =>
  `/api/projects/${projectId}/documents/${kind}?download=1`;

/** Dokumen di pembaca (mockup Prd.dc.html): kartu utama selebar maksimal 760 px. */
export function DocumentCard({
  kind,
  content,
  version,
}: {
  kind: Kind;
  content: string;
  version: number;
}) {
  const name = kind === 'prd' ? 'PRD' : 'TASKS';
  return (
    <Card
      size="main"
      className="w-full max-w-[760px] lg:px-11 lg:py-10"
      data-testid={`${kind}-preview`}
    >
      <span className="mb-4 block font-mono text-xs text-ink-muted">
        {name} · versi {version}
      </span>
      <MarkdownPreview markdown={content} label={`Pratinjau ${name}`} />
    </Card>
  );
}

/**
 * Panel ekspor di samping dokumen: unduhan yang sudah siap, dan tautan ke layar ekspor setelah
 * TASKS selesai. Form tulis ke folder ada di layar ekspor (tahap 8).
 */
export function ExportPanel({ project }: { project: ProjectDetail }) {
  const ready = project.currentStage === 'export';
  return (
    <Card as="section" aria-labelledby="export-panel-title" className="flex flex-col gap-3">
      <h2 id="export-panel-title" className="text-[15px] font-bold">
        Ekspor
      </h2>
      <div className="flex flex-wrap gap-2" data-testid="export-panel-downloads">
        {(['prd', 'tasks'] as const).map((kind) =>
          project.documents[kind] ? (
            <a
              key={kind}
              href={downloadHref(project.id, kind)}
              download={FILE[kind]}
              className={buttonClass('secondary')}
            >
              Unduh {FILE[kind]}
            </a>
          ) : (
            <span
              key={kind}
              className="inline-flex min-h-11 items-center rounded-control border border-dashed border-line px-3.5 text-sm text-ink-muted"
            >
              {FILE[kind]} belum siap
            </span>
          ),
        )}
      </div>
      {ready ? (
        <Link href={`/projects/${project.id}?tahap=8`} className={buttonClass('primary')}>
          Tulis ke folder proyek
        </Link>
      ) : (
        <p className="text-[13px] text-ink-muted">
          Menulis ke folder proyek aktif setelah TASKS selesai:{' '}
          <code className="font-mono">docs/PRD.md</code> dan{' '}
          <code className="font-mono">docs/TASKS.md</code>.
        </p>
      )}
    </Card>
  );
}
