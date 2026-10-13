import { AppHeader, type TemplateStatus } from '../../components/ui/app-header.tsx';
import { Card } from '../../components/ui/card.tsx';
import type { ProjectSummary } from '../../projects/projects.ts';
import { CreateProjectForm } from './create-project-form.tsx';
import { ProjectList } from './project-list.tsx';

const STEPS = [
  {
    no: '01',
    title: 'Klarifikasi produk dan teknis',
    body: 'Pertanyaan singkat dengan pilihan jawaban. Lewati bila ragu; default dan tebakan ditandai jelas.',
  },
  {
    no: '02',
    title: 'Review kritis sebelum menulis',
    body: 'Kombinasi teknis yang bertabrakan, urutan dependensi, dan fitur yang menyusup muncul sebagai temuan yang kamu putuskan.',
  },
  {
    no: '03',
    title: 'PRD dan TASKS untuk agent',
    body: 'Setiap task punya kriteria yang bisa dibuktikan, lalu diekspor langsung ke folder proyek.',
  },
];

type Props = { projects: ProjectSummary[]; template?: TemplateStatus };

export function HomeView({ projects, template }: Props) {
  return (
    <>
      <AppHeader template={template} />
      <main className="mx-auto flex max-w-[1120px] flex-col gap-16 px-5 pt-12 pb-24 sm:px-8 sm:pt-18">
        <section
          aria-labelledby="hero-title"
          className="flex flex-col items-center gap-7 text-center"
        >
          <span className="rounded-full border border-accent-line bg-accent-soft px-3 py-1.5 font-mono text-[13px] tracking-[0.08em] text-accent">
            IDE → PRD → TASKS
          </span>
          <h1
            id="hero-title"
            className="max-w-[820px] text-4xl leading-[1.08] font-extrabold tracking-[-0.025em] sm:text-[52px]"
          >
            Ubah ide jadi rencana yang siap dikerjakan agent.
          </h1>
          <p className="max-w-[640px] text-[17px] text-ink-muted">
            Jawab beberapa pertanyaan, putuskan temuan review, lalu ekspor PRD dan TASKS yang
            langsung dikerjakan Claude Code di proyek dari template.
          </p>
          <CreateProjectForm />
        </section>

        <section aria-labelledby="cara-kerja" className="flex flex-col gap-5">
          <h2
            id="cara-kerja"
            className="text-sm font-bold tracking-[0.06em] text-ink-muted uppercase"
          >
            Cara kerjanya
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <Card key={step.no} className="flex min-w-0 flex-col gap-3">
                <span className="font-mono text-[13px] text-accent">{step.no}</span>
                <h3 className="text-lg font-bold">{step.title}</h3>
                <p className="text-sm text-ink-muted">{step.body}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="proyek" aria-labelledby="proyek-title" className="flex flex-col gap-4">
          <h2 id="proyek-title" className="text-[22px] font-bold">
            Proyek
          </h2>
          <ProjectList projects={projects} />
        </section>
      </main>
    </>
  );
}
