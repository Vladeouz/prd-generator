import Link from 'next/link';
import type { ProjectSummary } from '../../projects/projects.ts';
import { CreateProjectForm } from './create-project-form.tsx';
import { ProjectList } from './project-list.tsx';

export function HomeView({ projects }: { projects: ProjectSummary[] }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">PRD Generator</h1>
        <Link href="/settings" className="text-sm text-blue-700 underline" id="settings-link">
          Pengaturan
        </Link>
      </div>
      <p className="mt-4 text-slate-600">
        Ubah ide proyek menjadi PRD dan daftar task yang siap dikerjakan Claude Code.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Proyek baru</h2>
        <CreateProjectForm />
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Proyek</h2>
        <ProjectList projects={projects} />
      </section>
    </main>
  );
}
