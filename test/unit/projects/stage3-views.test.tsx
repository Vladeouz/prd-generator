import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { Stage3Section } from '../../../src/app/projects/[id]/stage3-section.tsx';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import type { Stage2Output } from '../../../src/stages/stage-2/validate.ts';
import type { Stage3Output } from '../../../src/stages/stage-3/validate.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-13T00:00:00.000Z';
const stage2 = JSON.parse(loadClaudeFixture('stage2').result) as Stage2Output;
const gym = JSON.parse(loadClaudeFixture('derived/stage3-gym').result) as Stage3Output;
const umkm = JSON.parse(loadClaudeFixture('derived/stage3-umkm-b').result) as Stage3Output;

type Answer = ProjectDetail['answers'][number];
const answer = (stage: 'stage2' | 'stage3', questionId: string, patch: Partial<Answer> = {}) => ({
  id: `${stage}-${questionId}`,
  projectId: 'p1',
  stage,
  questionId,
  topic: 'x',
  value: 'x',
  source: 'default' as const,
  policyKey: null,
  createdAt: NOW,
  ...patch,
});
const productAnswers = stage2.questions.map((q) => answer('stage2', q.id));

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Katalog',
  idea: 'Website katalog produk UMKM.',
  currentStage: 'stage3',
  profileChoice: null,
  templateCommit: null,
  createdAt: NOW,
  updatedAt: NOW,
  lastCompletedStage: 'stage2',
  totalTokens: { inputTokens: 0, outputTokens: 0 },
  completedStages: ['stage2'],
  answers: productAnswers,
  featureChoices: [],
  decisions: [],
  documents: { prd: null, tasks: null },
  activeJob: null,
  latestJob: null,
  stageOutputs: { stage2 },
  ...patch,
});

const render = (detail: ProjectDetail) => renderToStaticMarkup(<Stage3Section project={detail} />);
const INTERNAL_TERMS = /profil\s+[ab]\b|stack profile/i;
/** Teks seperti yang ditulis renderToStaticMarkup. */
const escaped = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;');

describe('Stage3Section', () => {
  it('jawaban klarifikasi produk belum tersimpan: tidak ada tombol jalankan', () => {
    const html = render(project({ answers: [] }));
    expect(html).toContain('data-testid="stage3-not-ready"');
    expect(html).not.toContain('Jalankan klarifikasi teknis');
  });

  it('siap dijalankan: tombol jalankan', () => {
    expect(render(project())).toContain('Jalankan klarifikasi teknis');
  });

  it('rekomendasi Profil A: stack tersedia langsung dipakai, tanpa layar pilihan', () => {
    const html = render(project({ profileChoice: 'A', stageOutputs: { stage2, stage3: gym } }));
    expect(html).toContain('Stack: pakai stack yang tersedia');
    expect(html).toContain(gym.profile_recommendation.reason);
    expect(html).not.toContain('data-testid="profile-choice"');
    for (const q of gym.questions) {
      expect(html).toContain(q.question);
      expect(html).toContain(`Alasan default: ${q.default_reason}`);
    }
    expect(html).not.toMatch(INTERNAL_TERMS);
  });

  it('rekomendasi Profil B: pilihan eksplisit lanjut dengan mitigasi SEO atau tunda', () => {
    const html = render(project({ stageOutputs: { stage2, stage3: umkm } }));
    expect(html).toContain('Stack yang paling cocok belum tersedia');
    expect(html).toContain(umkm.profile_recommendation.reason);
    expect(html).toContain(umkm.profile_recommendation.fallback_if_unsupported);
    expect(html).toContain('data-testid="profile-choice"');
    expect(html).toContain('Lanjut dengan stack yang tersedia, ditambah mitigasi SEO');
    expect(html).toContain('Tunda proyek sampai stack website yang ramah SEO tersedia');
    expect(html.match(/name="profile-choice"/g)).toHaveLength(2);
    expect(html).not.toContain('checked=""/><span><strong>');
    expect(html).toContain('Rekomendasi ini bergantung pada jawabanmu untuk pertanyaan nomor 1.');
    expect(html).not.toMatch(INTERNAL_TERMS);
  });

  it('semua detected_risks tampil sebelum form jawaban', () => {
    const html = render(project({ stageOutputs: { stage2, stage3: umkm } }));
    const risks = html.indexOf('data-testid="risks"');
    expect(risks).toBeGreaterThan(-1);
    expect(risks).toBeLessThan(html.indexOf('data-testid="questions-stage3"'));
    for (const risk of umkm.detected_risks) expect(html).toContain(escaped(risk));
    for (const item of umkm.assumptions) expect(html).toContain(escaped(item));
  });

  it('Profil B, jawaban tersimpan, belum memilih: pesan meminta memilih stack', () => {
    const html = render(
      project({
        stageOutputs: { stage2, stage3: umkm },
        answers: [...productAnswers, ...umkm.questions.map((q) => answer('stage3', q.id))],
      }),
    );
    expect(html).toContain(
      'Jawaban tersimpan. Pilih kelanjutan stack di atas sebelum lanjut ke Struktur fitur.',
    );
  });

  it('Profil B ditunda: pilihan tersimpan dan terpilih lagi', () => {
    const html = render(
      project({
        profileChoice: 'postpone',
        stageOutputs: { stage2, stage3: umkm },
        answers: [...productAnswers, ...umkm.questions.map((q) => answer('stage3', q.id))],
      }),
    );
    expect(html).toContain(
      'Pilihan tersimpan: Tunda proyek sampai stack website yang ramah SEO tersedia.',
    );
    expect(html).toMatch(/checked=""\/><span><strong>Tunda proyek/);
    expect(html).toContain('Proyek ditunda.');
  });

  it('Profil B lanjut dengan mitigasi dan jawaban tersimpan: tahap berikutnya siap', () => {
    const html = render(
      project({
        profileChoice: 'A_with_seo_mitigation',
        stageOutputs: { stage2, stage3: umkm },
        answers: [...productAnswers, ...umkm.questions.map((q) => answer('stage3', q.id))],
      }),
    );
    expect(html).toContain('Tahap berikutnya: Struktur fitur — siap dijalankan.');
  });
});

describe('ProjectView', () => {
  it('menampilkan bagian tahap 2 dan tahap 3', () => {
    const html = renderToStaticMarkup(<ProjectView project={project()} />);
    expect(html).toContain('id="stage2"');
    expect(html).toContain('id="stage3"');
  });
});
