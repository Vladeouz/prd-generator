import Link from 'next/link';
import { Badge } from '../../components/ui/badge.tsx';
import type { ProjectSummary } from '../../projects/projects.ts';
import { STAGE_LABELS } from '../../projects/stage-labels.ts';
import { formatDateTime, formatTokens, stageNumber } from './format.ts';

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  if (projects.length === 0) {
    return (
      <p className="rounded-panel border border-dashed border-line px-5.5 py-8 text-center text-sm text-ink-muted">
        Belum ada proyek. Tulis idemu di atas untuk memulai.
      </p>
    );
  }
  return (
    <ul
      className="flex flex-col overflow-hidden rounded-panel border border-line-subtle"
      id="projects"
    >
      {projects.map((project) => (
        <li key={project.id} className="border-b border-line-subtle bg-surface last:border-b-0">
          <Link
            href={`/projects/${project.id}`}
            className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5.5 py-4.5 hover:bg-raised"
          >
            <span className="flex min-w-0 flex-[999_1_320px] flex-col gap-1">
              <span className="text-base font-bold">{project.name}</span>
              <span className="truncate text-sm text-ink-muted">{project.idea}</span>
              <span className="text-[13px] text-ink-muted">
                Tahap terakhir selesai:{' '}
                <span className="text-ink-secondary" data-testid="last-stage">
                  {project.lastCompletedStage
                    ? STAGE_LABELS[project.lastCompletedStage]
                    : 'Belum ada'}
                </span>{' '}
                · Dibuat {formatDateTime(project.createdAt)}
              </span>
            </span>
            <Badge tone="accent" dot>
              Tahap {stageNumber(project.currentStage)} · {STAGE_LABELS[project.currentStage]}
            </Badge>
            <span className="min-w-30 text-right font-mono text-[13px] text-ink-muted">
              <span className="sr-only">Token: </span>
              <span data-testid="tokens">{formatTokens(project.totalTokens)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
