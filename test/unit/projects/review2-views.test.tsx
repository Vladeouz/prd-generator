import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Review2Section } from '../../../src/app/projects/[id]/review2-section.tsx';
import { Stage6Section } from '../../../src/app/projects/[id]/stage6-section.tsx';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import type { Review2Output } from '../../../src/stages/review-2/validate.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-14T00:00:00.000Z';
const review2 = JSON.parse(
  loadClaudeFixture('synthetic/review2-daftar-belanja').result,
) as Review2Output;
const prd = {
  id: 'd1',
  projectId: 'p1',
  kind: 'prd' as const,
  version: 1,
  content: '# Daftar Belanja\n',
  createdAt: NOW,
};

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Belanja',
  idea: 'Daftar belanja keluarga.',
  currentStage: 'review2',
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
  stageOutputs: { review2 },
  ...patch,
});

const render = (detail: ProjectDetail) => renderToStaticMarkup(<Review2Section project={detail} />);
const checkedValues = (html: string) =>
  (html.match(/<input type="radio"[^>]*>/g) ?? [])
    .filter((r) => r.includes('checked'))
    .map((r) => r.match(/value="([^"]*)"/)?.[1]);

describe('Review2Section', () => {
  it('ada di layar PRD setelah PRD tertulis, dengan tombol jalankan', () => {
    const html = renderToStaticMarkup(
      <Stage6Section
        project={project({ stageOutputs: {} })}
        template={{ valid: true, commit: 'a'.repeat(40) }}
      />,
    );
    expect(html).toContain('id="review2-title"');
    expect(html).toContain('Jalankan review kedua');
  });

  it('temuan RV2-xx tampil dengan kategori, opsi yang mengubah PRD, dan rekomendasi terpilih', () => {
    const html = render(project());
    expect(html).toContain('data-testid="finding-RV2-01"');
    expect(html).toContain('Rute UI dan endpoint');
    expect(html).toContain('Aturan bisnis');
    expect(html.match(/>Mengubah PRD</g)).toHaveLength(2);
    expect(checkedValues(html)).toEqual(review2.findings.map((f) => f.recommended_option));
    expect(html).toContain(
      'data-testid="regenerate-note">1 perbaikan dipilih: PRD ditulis ulang sekali',
    );
    expect(html).toMatch(
      /Berikutnya: <span[^>]*>TASKS, sekitar 3–6 menit<\/span><\/span><button type="submit"[^>]*>Simpan keputusan/,
    );
  });

  it('setelah diputuskan dan PRD ditulis ulang: ringkasan keputusan tanpa form', () => {
    const html = render(
      project({
        currentStage: 'stage7',
        decisions: [
          {
            id: 'x',
            projectId: 'p1',
            code: 'RV2-01',
            origin: 'review2',
            category: 'ui_endpoint',
            finding: 'x',
            chosenOption: 'Tambahkan GET /items/{id}',
            consequence: 'x',
            createdAt: NOW,
          },
        ],
      }),
    );
    expect(html).toContain('data-testid="review2-decided"');
    expect(html).toContain('Tambahkan GET /items/{id}');
    expect(html).not.toContain('data-testid="decisions-review2"');
  });
});
