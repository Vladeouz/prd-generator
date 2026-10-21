import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { resumeNote, Stage7Section } from '../../../src/app/projects/[id]/stage7-section.tsx';
import { projectSteps } from '../../../src/app/projects/[id]/steps.ts';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { TemplateStatus } from '../../../src/components/ui/app-header.tsx';
import type { ProjectDetail } from '../../../src/projects/projects.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-14T00:00:00.000Z';
const doc = (kind: 'prd' | 'tasks', content: string, version = 1) => ({
  id: kind,
  projectId: 'p1',
  kind,
  version,
  content,
  createdAt: NOW,
});
const prd = doc('prd', '# Gym\n', 2);
const tasks = doc('tasks', loadClaudeFixture('derived/stage7-gym').result);

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Gym',
  idea: 'Aplikasi membership untuk sebuah gym.',
  currentStage: 'stage7',
  profileChoice: 'A',
  templateCommit: null,
  createdAt: NOW,
  updatedAt: NOW,
  lastCompletedStage: 'review2',
  totalTokens: { inputTokens: 0, outputTokens: 0 },
  completedStages: ['stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2'],
  answers: [],
  featureChoices: [],
  decisions: [],
  documents: { prd, tasks: null },
  activeJob: null,
  latestJob: null,
  stageOutputs: {},
  ...patch,
});

const valid: TemplateStatus = { valid: true, commit: 'a'.repeat(40) };
const render = (detail: ProjectDetail, template = valid) =>
  renderToStaticMarkup(<Stage7Section project={detail} template={template} />);

describe('Stage7Section', () => {
  it('review kedua belum diputuskan: tidak ada tombol jalankan', () => {
    const html = render(project({ currentStage: 'review2' }));
    expect(html).toContain('data-testid="stage7-not-ready"');
    expect(html).not.toContain('Jalankan penulisan tasks');
  });

  it('template tidak valid: tidak bisa dijalankan (FR-11)', () => {
    const html = render(project(), { valid: false, commit: null });
    expect(html).toContain('data-testid="template-invalid"');
    expect(html).toContain('TASKS memakai konvensi dari repo template');
    expect(html).not.toContain('Jalankan penulisan tasks');
  });

  it('siap: tombol jalankan dengan perkiraan durasi (FR-02)', () => {
    const html = render(project());
    expect(html).toContain('Jalankan penulisan tasks');
    expect(html).toContain('Perkiraan sekitar 3–6 menit');
    expect(html).not.toContain('data-testid="stage7-resume"');
  });

  it('job sebelumnya berhenti di tengah: keterangan bahwa menjalankan lagi melanjutkan fase yang belum', () => {
    const html = renderToStaticMarkup(
      <Stage7Section
        project={project()}
        template={valid}
        steps={{ list: true, phasesDone: 2, phasesTotal: 4 }}
      />,
    );
    expect(html).toContain(
      'Daftar task dan detail 2 dari 4 fase sudah tersimpan. Menjalankan lagi hanya melanjutkan fase yang belum selesai.',
    );
    expect(resumeNote({ list: false, phasesDone: 0, phasesTotal: 4 })).toBeNull();
    expect(resumeNote({ list: true, phasesDone: 4, phasesTotal: 4 })).toBeNull();
    expect(resumeNote(undefined)).toBeNull();
  });

  it('TASKS tersimpan: pratinjau Markdown, versi, dan versi PRD sumbernya', () => {
    const html = render(project({ currentStage: 'export', documents: { prd, tasks } }));
    expect(html).toContain('data-testid="tasks-preview"');
    expect(html).toContain('<h1>TASKS — Aplikasi Membership Gym</h1>');
    expect(html).toContain('T-044 Hapus fitur contoh notes');
    expect(html).toContain('data-testid="tasks-version">1<');
    expect(html).toContain('versi 2');
  });
});

describe('halaman proyek di tahap 7', () => {
  it('stepper menautkan tahap 2–8 (Ekspor sejak T-015), tahap 6 selesai, dan ?tahap=7 membuka tahap 7', () => {
    const detail = project({ currentStage: 'export', documents: { prd, tasks } });
    const steps = projectSteps(detail, {}, 'stage7');
    expect(steps.filter((s) => s.href).map((s) => s.number)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(steps[5]?.status).toBe('done');
    expect(steps[6]).toMatchObject({ status: 'done', meta: 'Versi 1', selected: true });
    const html = renderToStaticMarkup(<ProjectView project={detail} template={valid} stage="7" />);
    expect(html).toContain('TAHAP 7 / 8');
  });
});
