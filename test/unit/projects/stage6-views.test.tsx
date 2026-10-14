import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { Stage6Section } from '../../../src/app/projects/[id]/stage6-section.tsx';
import { projectSteps } from '../../../src/app/projects/[id]/steps.ts';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { TemplateStatus } from '../../../src/components/ui/app-header.tsx';
import { composePrd } from '../../../src/projects/compose-prd.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-14T00:00:00.000Z';
const COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';
const content = composePrd(loadClaudeFixture('derived/stage6-gym').result, {
  decisions: [
    {
      code: 'RV-01',
      category: 'stack_deploy',
      finding: 'Serverless bertabrakan.',
      chosenOption: 'Hapus keputusan serverless + SQLite',
      consequence: 'API tetap container.',
    },
  ],
  assumptions: [],
  guesses: [],
  openQuestions: [],
});
const prdDocument = {
  id: 'd1',
  projectId: 'p1',
  kind: 'prd' as const,
  version: 2,
  content,
  createdAt: NOW,
};

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Gym',
  idea: 'Aplikasi membership untuk sebuah gym.',
  currentStage: 'stage6',
  profileChoice: 'A',
  templateCommit: null,
  createdAt: NOW,
  updatedAt: NOW,
  lastCompletedStage: 'stage5',
  totalTokens: { inputTokens: 0, outputTokens: 0 },
  completedStages: ['stage2', 'stage3', 'stage4', 'stage5'],
  answers: [],
  featureChoices: [],
  decisions: [],
  documents: { prd: null, tasks: null },
  activeJob: null,
  latestJob: null,
  stageOutputs: {},
  ...patch,
});

const valid: TemplateStatus = { valid: true, commit: COMMIT };
const render = (detail: ProjectDetail, template = valid) =>
  renderToStaticMarkup(<Stage6Section project={detail} template={template} />);

describe('Stage6Section', () => {
  it('keputusan review belum disimpan: tidak ada tombol jalankan', () => {
    const html = render(project({ currentStage: 'stage5' }));
    expect(html).toContain('data-testid="stage6-not-ready"');
    expect(html).not.toContain('Jalankan penulisan prd');
  });

  it('template tidak valid: tahap 6 tidak bisa dijalankan dan menautkan Pengaturan (FR-11)', () => {
    const html = render(project(), { valid: false, commit: null });
    expect(html).toContain('data-testid="template-invalid"');
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain('Jalankan penulisan prd');
  });

  it('siap: tombol jalankan dengan perkiraan durasi (FR-02)', () => {
    const html = render(project());
    expect(html).toContain('Jalankan penulisan prd');
    expect(html).toContain('Perkiraan sekitar 5–10 menit');
  });

  it('job berjalan: status dan perkiraan durasi tampil', () => {
    const html = render(
      project({
        activeJob: {
          id: 'j1',
          projectId: 'p1',
          stage: 'stage6',
          status: 'running',
          error: null,
          createdAt: NOW,
          startedAt: NOW,
          finishedAt: null,
        },
      }),
    );
    expect(html).toContain('Penulisan PRD sedang berjalan');
    expect(html).toContain('(perkiraan sekitar 5–10 menit)');
    expect(html).toContain('role="progressbar"');
  });

  it('PRD tersimpan: pratinjau Markdown dengan bagian 8, versi, dan commit template', () => {
    const html = render(
      project({
        currentStage: 'review2',
        templateCommit: COMMIT,
        documents: { prd: prdDocument, tasks: null },
      }),
    );
    expect(html).toContain('data-testid="prd-preview"');
    expect(html).toContain('<h1>Aplikasi Membership Gym</h1>');
    expect(html).toContain('<h2>8. Assumptions &amp; Decisions</h2>');
    expect(html).toContain('<strong>RV-01</strong> (stack_deploy): Serverless bertabrakan.');
    expect(html).toContain('<input type="checkbox" disabled=""/>');
    expect(html).toContain('data-testid="prd-version">2<');
    expect(html).toContain('data-testid="prd-template-commit">abcdef1<');
    expect(html).toContain('Jalankan ulang penulisan prd');
  });
});

describe('halaman proyek di tahap 6', () => {
  it('stepper menautkan tahap 2–6 dan halaman membuka tahap 6', () => {
    const detail = project({
      currentStage: 'review2',
      documents: { prd: prdDocument, tasks: null },
    });
    const steps = projectSteps(detail, {}, 'stage6');
    expect(steps.filter((s) => s.href).map((s) => s.number)).toEqual([2, 3, 4, 5, 6]);
    expect(steps[5]).toMatchObject({ status: 'current', meta: 'Versi 2', selected: true });
    const html = renderToStaticMarkup(<ProjectView project={detail} template={valid} />);
    expect(html).toContain('TAHAP 6 / 8');
  });
});
