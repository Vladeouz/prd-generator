import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { Stage4Section } from '../../../src/app/projects/[id]/stage4-section.tsx';
import { projectSteps, selectedStage } from '../../../src/app/projects/[id]/steps.ts';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-14T00:00:00.000Z';
const stage4 = JSON.parse(loadClaudeFixture('stage4').result) as Stage4Output;

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Gym',
  idea: 'Aplikasi membership untuk sebuah gym.',
  currentStage: 'stage4',
  profileChoice: 'A',
  templateCommit: null,
  createdAt: NOW,
  updatedAt: NOW,
  lastCompletedStage: 'stage4',
  totalTokens: { inputTokens: 0, outputTokens: 0 },
  completedStages: ['stage2', 'stage3', 'stage4'],
  answers: [],
  featureChoices: [],
  decisions: [],
  documents: { prd: null, tasks: null },
  activeJob: null,
  latestJob: null,
  stageOutputs: { stage4 },
  ...patch,
});

const render = (detail: ProjectDetail) => renderToStaticMarkup(<Stage4Section project={detail} />);
const checkboxes = (html: string) => html.match(/<input type="checkbox"[^>]*>/g) ?? [];

describe('Stage4Section', () => {
  it('tahap 3 belum selesai: tidak ada tombol jalankan', () => {
    const html = render(project({ currentStage: 'stage3', stageOutputs: {} }));
    expect(html).toContain('data-testid="stage4-not-ready"');
    expect(html).not.toContain('Jalankan struktur fitur');
  });

  it('siap dijalankan: tombol jalankan', () => {
    expect(render(project({ stageOutputs: {} }))).toContain('Jalankan struktur fitur');
  });

  it('fitur MVP tampil per fase dengan dependensi, keputusan teknis, dan pertanyaan terbuka', () => {
    const html = render(project());
    for (const p of stage4.phases) {
      expect(html).toContain(`data-testid="phase-${p.phase}"`);
      expect(html).toContain(`FASE ${p.phase}`);
    }
    for (const feature of stage4.mvp_features) expect(html).toContain(feature.name);
    expect(html).toContain('data-testid="depends-F-04">Bergantung pada: F-02, F-03');
    expect(html).toContain('Fondasi</span>');
    expect(html).toContain('Dari jawabanmu</span>');
    expect(html).toContain('data-testid="technical-decisions"');
    expect(html).toContain('data-testid="open-questions"');
    expect(html).toContain('data-testid="non-goals"');
  });

  it('fitur rekomendasi tidak dicentang secara default', () => {
    const html = render(project());
    const boxes = checkboxes(html);
    expect(boxes).toHaveLength(stage4.recommended_features.length);
    for (const box of boxes) expect(box).not.toContain('checked');
    expect(html).toContain(
      `0 dari ${stage4.recommended_features.length} fitur rekomendasi dipilih`,
    );
    expect(html).not.toContain('data-testid="features-saved"');
  });

  it('pilihan tersimpan: yang dicentang tampil tercentang, dan tahap berikutnya disebut', () => {
    const html = render(
      project({
        currentStage: 'stage5',
        featureChoices: stage4.recommended_features.map((r) => ({
          id: r.id,
          projectId: 'p1',
          featureCode: r.id,
          accepted: r.id === 'R-02' ? 1 : 0,
        })),
      }),
    );
    const checked = checkboxes(html).filter((box) => box.includes('checked'));
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain('value="R-02"');
    expect(html).toContain('data-testid="features-saved"');
    expect(html).toMatch(
      /Berikutnya: <span[^>]*>Review kritis<\/span><\/span><button type="submit"[^>]*>Simpan pilihan fitur/,
    );
  });
});

describe('halaman proyek di tahap 4', () => {
  it('tahap 4 dibuka secara bawaan, dan stepper menautkan tahap 2–4', () => {
    const detail = project();
    expect(selectedStage(detail)).toBe('stage4');
    expect(selectedStage(detail, '2')).toBe('stage2');
    expect(selectedStage(detail, '5')).toBe('stage4');
    expect(selectedStage(project({ currentStage: 'stage3' }), '4')).toBe('stage3');
    const steps = projectSteps(detail, {}, 'stage4');
    expect(steps.filter((s) => s.href).map((s) => s.number)).toEqual([2, 3, 4]);
    expect(steps[3]).toMatchObject({ status: 'current', meta: '9 fitur MVP', selected: true });
    const html = renderToStaticMarkup(<ProjectView project={detail} />);
    expect(html).toContain('TAHAP 4 / 8');
  });
});
