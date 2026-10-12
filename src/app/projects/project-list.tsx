import Link from 'next/link';
import type { ProjectSummary } from '../../projects/projects.ts';
import { STAGE_LABELS } from '../../projects/stage-labels.ts';
import { formatDateTime, formatTokens } from './format.ts';

export function ProjectList({ projects }: { projects: ProjectSummary[] }) {
  if (projects.length === 0) {
    return <p className="text-sm text-slate-500">Belum ada proyek.</p>;
  }
  return (
    <ul
      className="divide-y divide-slate-200 rounded border border-slate-200 bg-white"
      id="projects"
    >
      {projects.map((project) => (
        <li key={project.id} className="p-4">
          <Link href={`/projects/${project.id}`} className="font-medium text-blue-700 underline">
            {project.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{project.idea}</p>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            <div>
              <dt className="inline">Tahap terakhir selesai: </dt>
              <dd className="inline" data-testid="last-stage">
                {project.lastCompletedStage
                  ? STAGE_LABELS[project.lastCompletedStage]
                  : 'Belum ada'}
              </dd>
            </div>
            <div>
              <dt className="inline">Token: </dt>
              <dd className="inline" data-testid="tokens">
                {formatTokens(project.totalTokens)}
              </dd>
            </div>
            <div>
              <dt className="inline">Dibuat: </dt>
              <dd className="inline">{formatDateTime(project.createdAt)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
