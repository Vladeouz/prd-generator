import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { Stage5Section } from '../../../src/app/projects/[id]/stage5-section.tsx';
import { projectSteps } from '../../../src/app/projects/[id]/steps.ts';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import type { Stage5Output } from '../../../src/stages/stage-5/validate.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-14T00:00:00.000Z';
const stage5 = JSON.parse(loadClaudeFixture('stage5').result) as Stage5Output;

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Gym',
  idea: 'Aplikasi membership untuk sebuah gym.',
  currentStage: 'stage5',
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
  stageOutputs: { stage5 },
  ...patch,
});

const decision = (code: string, chosenOption: string) => ({
  id: code,
  projectId: 'p1',
  code,
  origin: 'review1' as const,
  category: 'x',
  finding: 'x',
  chosenOption,
  consequence: 'x',
  createdAt: NOW,
});

const render = (detail: ProjectDetail) => renderToStaticMarkup(<Stage5Section project={detail} />);
const checkedRadios = (html: string) =>
  (html.match(/<input type="radio"[^>]*>/g) ?? []).filter((r) => r.includes('checked'));
const radioValue = (radio: string) => radio.match(/value="([^"]*)"/)?.[1];
/** Teks seperti yang ditulis renderToStaticMarkup. */
const escaped = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;');

describe('Stage5Section', () => {
  it('pilihan fitur belum disimpan: tidak ada tombol jalankan', () => {
    const html = render(project({ currentStage: 'stage4', stageOutputs: {} }));
    expect(html).toContain('data-testid="stage5-not-ready"');
    expect(html).not.toContain('Jalankan review kritis');
  });

  it('setiap temuan tampil dengan bukti, keparahan, kategori, dan opsi beserta konsekuensinya', () => {
    const html = render(project());
    for (const f of stage5.findings) {
      expect(html).toContain(`data-testid="finding-${f.id}"`);
      expect(html).toContain(escaped(f.finding));
      expect(html).toContain(escaped(f.evidence));
      for (const o of f.options) expect(html).toContain(escaped(o.consequence));
    }
    expect(html).toContain('Bukti');
    expect(html).toContain('Keputusanmu');
    const high = stage5.findings.filter((f) => f.severity === 'high').length;
    expect(html).toContain(`${high} tinggi`);
    expect(html.match(/>Rekomendasi</g)).toHaveLength(stage5.findings.length);
  });

  it('default: rekomendasi setiap temuan sudah terpilih', () => {
    const checked = checkedRadios(render(project()));
    expect(checked.map(radioValue)).toEqual(
      stage5.findings.map((f) => escaped(f.recommended_option)),
    );
    expect(render(project())).toMatch(
      /Berikutnya: <span[^>]*>PRD, sekitar 5–10 menit<\/span><\/span><button type="submit"[^>]*>Simpan keputusan/,
    );
  });

  it('keputusan tersimpan: opsi tersimpan terpilih, dan buku keputusan berisi kode dan pilihan', () => {
    const [first, second] = stage5.findings as [
      Stage5Output['findings'][number],
      Stage5Output['findings'][number],
    ];
    const other = second.options.find((o) => o.label !== second.recommended_option)
      ?.label as string;
    const html = render(
      project({
        currentStage: 'stage6',
        decisions: [decision(first.id, first.recommended_option), decision(second.id, other)],
      }),
    );
    expect(radioValue(checkedRadios(html)[1] as string)).toBe(escaped(other));
    expect(html).toContain('data-testid="decisions-saved"');
    expect(html).toContain('data-testid="decision-book"');
    expect(html).toContain(escaped(other));
    expect(html).toContain('1 berbeda dari rekomendasi');
  });
});

describe('halaman proyek di tahap 5', () => {
  it('stepper menautkan tahap 2–5 dan menyebut jumlah temuan', () => {
    const detail = project();
    const steps = projectSteps(detail, {}, 'stage5');
    expect(steps.filter((s) => s.href).map((s) => s.number)).toEqual([2, 3, 4, 5]);
    expect(steps[4]).toMatchObject({ status: 'current', meta: '9 temuan', selected: true });
    expect(renderToStaticMarkup(<ProjectView project={detail} />)).toContain('TAHAP 5 / 8');
  });
});
