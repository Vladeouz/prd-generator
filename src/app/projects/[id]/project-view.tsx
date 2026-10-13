import Link from 'next/link';
import type { ProjectDetail } from '../../../projects/projects.ts';
import { STAGE_LABELS } from '../../../projects/stage-labels.ts';
import { formatDateTime, formatTokens } from '../format.ts';
import { DeleteProjectButton } from './delete-project-button.tsx';
import { Stage2Section } from './stage2-section.tsx';
import { Stage3Section } from './stage3-section.tsx';

export function ProjectView({ project }: { project: ProjectDetail }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-blue-700 underline">
        ← Semua proyek
      </Link>
      <div className="mt-4 flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold">{project.name}</h1>
        <DeleteProjectButton projectId={project.id} name={project.name} />
      </div>
      <p className="mt-1 text-xs text-slate-500">Dibuat {formatDateTime(project.createdAt)}</p>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-500">Ide</h2>
        <p className="mt-2 whitespace-pre-wrap">{project.idea}</p>
      </section>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6">
        <dl className="grid grid-cols-[12rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Tahap saat ini</dt>
          <dd id="current-stage">
            {STAGE_LABELS[project.currentStage]}
            {project.activeJob ? ' — sedang berjalan' : ' — siap dijalankan'}
          </dd>
          <dt className="text-slate-500">Tahap terakhir selesai</dt>
          <dd id="last-stage">
            {project.lastCompletedStage ? STAGE_LABELS[project.lastCompletedStage] : 'Belum ada'}
          </dd>
          <dt className="text-slate-500">Token terpakai</dt>
          <dd id="tokens">{formatTokens(project.totalTokens)}</dd>
        </dl>
      </section>

      <Stage2Section project={project} />
      <Stage3Section project={project} />
    </main>
  );
}
