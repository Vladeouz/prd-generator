import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ExportSection } from '../../../src/app/projects/[id]/export-section.tsx';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { projectSteps, selectedStage } from '../../../src/app/projects/[id]/steps.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-14T00:00:00.000Z';
const doc = (kind: 'prd' | 'tasks', version: number) => ({
  id: kind,
  projectId: 'p1',
  kind,
  version,
  content: `# ${kind}\n`,
  createdAt: NOW,
});

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Gym',
  idea: 'Ide',
  currentStage: 'export',
  profileChoice: 'A',
  templateCommit: null,
  createdAt: NOW,
  updatedAt: NOW,
  lastCompletedStage: 'stage7',
  totalTokens: { inputTokens: 0, outputTokens: 0 },
  completedStages: ['stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'review2', 'stage7'],
  answers: [],
  featureChoices: [],
  decisions: [],
  documents: { prd: doc('prd', 2), tasks: doc('tasks', 1) },
  activeJob: null,
  latestJob: null,
  stageOutputs: {},
  ...patch,
});

const render = (detail: ProjectDetail) => renderToStaticMarkup(<ExportSection project={detail} />);

describe('ExportSection', () => {
  it('TASKS belum selesai: belum bisa diekspor', () => {
    const html = render(
      project({ currentStage: 'stage7', documents: { prd: doc('prd', 1), tasks: null } }),
    );
    expect(html).toContain('data-testid="export-not-ready"');
    expect(html).not.toContain('data-testid="export-form"');
  });

  it('unduhan bernama PRD.md dan TASKS.md (FR-09)', () => {
    const html = render(project());
    expect(html).toContain('href="/api/projects/p1/documents/prd?download=1"');
    expect(html).toContain('download="PRD.md"');
    expect(html).toContain('href="/api/projects/p1/documents/tasks?download=1"');
    expect(html).toContain('download="TASKS.md"');
    expect(html).toContain('PRD versi 2 dan TASKS versi 1.');
  });

  it('form folder proyek: path diketik user, tanpa isian bawaan', () => {
    const html = render(project());
    expect(html).toContain('data-testid="export-form"');
    expect(html).toMatch(/<input id="export-target"[^>]*value=""/);
    expect(html).toContain('Hanya docs/PRD.md dan docs/TASKS.md yang ditulis.');
    expect(html).not.toContain('data-testid="export-overwrite"');
  });
});

describe('halaman proyek di tahap ekspor', () => {
  it('stepper menautkan semua tahap dan halaman membuka Ekspor', () => {
    const detail = project();
    expect(selectedStage(detail)).toBe('export');
    const steps = projectSteps(detail, {}, 'export');
    expect(steps.filter((s) => s.href).map((s) => s.number)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(steps[7]).toMatchObject({ status: 'current', selected: true });
    expect(renderToStaticMarkup(<ProjectView project={detail} />)).toContain('TAHAP 8 / 8');
  });
});
