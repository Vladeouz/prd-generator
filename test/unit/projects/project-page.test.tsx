// Tata letak dan isi halaman proyek dan beranda setelah fondasi desain (T-020).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { Stage2Section } from '../../../src/app/projects/[id]/stage2-section.tsx';
import { Stage3Section } from '../../../src/app/projects/[id]/stage3-section.tsx';
import { projectSteps, selectedStage } from '../../../src/app/projects/[id]/steps.ts';
import { HomeView } from '../../../src/app/projects/home-view.tsx';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { Job } from '../../../src/jobs/job-queue.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import type { Stage2Output } from '../../../src/stages/stage-2/validate.ts';
import type { Stage3Output } from '../../../src/stages/stage-3/validate.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-13T00:00:00.000Z';
const stage2 = JSON.parse(loadClaudeFixture('stage2').result) as Stage2Output;
const gym3 = JSON.parse(loadClaudeFixture('derived/stage3-gym').result) as Stage3Output;
const umkm3 = JSON.parse(loadClaudeFixture('derived/stage3-umkm-b').result) as Stage3Output;

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Membership gym',
  idea: 'Aplikasi membership untuk sebuah gym.',
  currentStage: 'stage2',
  profileChoice: null,
  templateCommit: null,
  createdAt: NOW,
  updatedAt: NOW,
  lastCompletedStage: null,
  totalTokens: { inputTokens: 0, outputTokens: 0 },
  completedStages: [],
  answers: [],
  featureChoices: [],
  decisions: [],
  documents: { prd: null, tasks: null },
  activeJob: null,
  latestJob: null,
  stageOutputs: {},
  ...patch,
});

const job = (patch: Partial<Job>): Job => ({
  id: 'j1',
  projectId: 'p1',
  stage: 'stage2',
  status: 'running',
  error: null,
  createdAt: NOW,
  startedAt: NOW,
  finishedAt: null,
  ...patch,
});

const productAnswers = stage2.questions.map((q) => ({
  id: `a-${q.id}`,
  projectId: 'p1',
  stage: 'stage2' as const,
  questionId: q.id,
  topic: q.topic,
  value: q.recommended_default,
  source: 'default' as const,
  policyKey: null,
  createdAt: NOW,
}));

const atStage3 = (patch: Partial<ProjectDetail> = {}) =>
  project({
    currentStage: 'stage3',
    completedStages: ['stage2'],
    lastCompletedStage: 'stage2',
    answers: productAnswers,
    stageOutputs: { stage2 },
    ...patch,
  });

const statuses = (detail: ProjectDetail, selected: 'stage2' | 'stage3' = 'stage2') =>
  projectSteps(detail, {}, selected).map((step) => step.status);

describe('stepper proyek', () => {
  it('8 tahap; proyek baru: ide selesai, klarifikasi produk aktif, sisanya terkunci', () => {
    const steps = projectSteps(project(), {}, 'stage2');
    expect(steps.map((step) => step.label)).toEqual([
      'Ide',
      'Klarifikasi produk',
      'Klarifikasi teknis',
      'Struktur fitur',
      'Review kritis',
      'PRD',
      'TASKS',
      'Ekspor',
    ]);
    expect(statuses(project())).toEqual([
      'done',
      'current',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(steps.filter((step) => step.href).map((step) => step.href)).toEqual([
      '/projects/p1?tahap=2',
    ]);
    expect(steps.find((step) => step.selected)?.number).toBe(2);
  });

  it('job berjalan dan job gagal ditandai di tahapnya', () => {
    expect(statuses(project({ activeJob: job({}) }))[1]).toBe('running');
    expect(
      statuses(atStage3({ latestJob: job({ stage: 'stage3', status: 'failed' }) }), 'stage3')[2],
    ).toBe('failed');
  });

  it('tahap 3: tahap 2 selesai dan bisa dibuka lagi; token per tahap tampil', () => {
    const steps = projectSteps(
      atStage3({ stageOutputs: { stage2, stage3: gym3 }, profileChoice: 'A' }),
      { stage2: { inputTokens: 24_100, outputTokens: 1_512, costUsd: 0.1, durationMs: 19_000 } },
      'stage3',
    );
    expect(steps[1]).toMatchObject({
      status: 'done',
      tokens: '25.612 token',
      href: '/projects/p1?tahap=2',
      meta: `${stage2.questions.length} pertanyaan`,
    });
    expect(steps[2]).toMatchObject({ status: 'current', selected: true });
    expect(steps[3]).toMatchObject({ status: 'locked', href: undefined });
  });

  it('rekomendasi stack belum tersedia dan belum dipilih: tahap 3 menunggu pilihan', () => {
    const [, , step3] = projectSteps(
      atStage3({ stageOutputs: { stage2, stage3: umkm3 } }),
      {},
      'stage3',
    );
    expect(step3?.meta).toBe('Menunggu pilihan stack');
  });

  it('tahap yang dibuka: ?tahap bila sudah terbuka, selain itu tahap saat ini', () => {
    expect(selectedStage(project())).toBe('stage2');
    expect(selectedStage(project(), '3')).toBe('stage2');
    expect(selectedStage(atStage3())).toBe('stage3');
    expect(selectedStage(atStage3(), '2')).toBe('stage2');
    // Semua tahap sudah punya layar sejak T-015: tahap saat ini dibuka, dan tahap yang belum
    // terbuka jatuh ke tahap saat ini.
    expect(selectedStage(project({ currentStage: 'export' }))).toBe('export');
    expect(selectedStage(project({ currentStage: 'stage7' }), '8')).toBe('stage7');
  });
});

describe('halaman proyek', () => {
  it('header dengan breadcrumb dan token; stepper, konten, dan panel dalam satu grid', () => {
    const html = renderToStaticMarkup(
      <ProjectView
        project={project({ totalTokens: { inputTokens: 24_100, outputTokens: 1_512 } })}
        template={{ valid: true, commit: '0416d60c04bf650c3d517eb0197adc494ce1a8eb' }}
      />,
    );
    expect(html).toContain('data-testid="breadcrumb-project">Membership gym<');
    expect(html).toContain('data-testid="header-tokens">24.100 input · 1.512 output<');
    expect(html).toContain('template 0416d60');
    expect(html).toContain('xl:grid-cols-[280px_minmax(560px,1fr)_300px]');
    expect(html).toContain('<nav aria-label="Tahapan"');
    expect(html).toContain('TAHAP 2 / 8');
    // Layar sempit: konten (order-1), stepper (order-2), panel (order-3).
    expect(html.indexOf('order-2')).toBeLessThan(html.indexOf('id="stage2"'));
    expect(html).toMatch(/<section id="stage2"[^>]*class="contents"><div class="order-1/);
  });

  it('ringkasan pemakaian token per tahap dan total tampil di kolom stepper (FR-10)', () => {
    const html = renderToStaticMarkup(
      <ProjectView
        project={project()}
        usage={{
          stage2: { inputTokens: 24_100, outputTokens: 1_512, costUsd: 0.1, durationMs: 19_000 },
        }}
      />,
    );
    expect(html).toContain('id="usage-title"');
    expect(html).toContain('data-testid="usage-total-tokens">24.100 / 1.512<');
    expect(html).toContain('data-testid="usage-total-cost">$0,10<');
  });

  it('tahap 2: bilah aksi menyebut Klarifikasi teknis di samping tombol simpan; panel samping', () => {
    const html = renderToStaticMarkup(
      <Stage2Section
        project={project({ stageOutputs: { stage2 } })}
        usage={{ inputTokens: 24_100, outputTokens: 1_512, costUsd: 0.1, durationMs: 19_000 }}
      />,
    );
    const total = stage2.questions.length;
    expect(html).toMatch(
      /Berikutnya: <span[^>]*>Klarifikasi teknis<\/span><\/span><button type="submit"[^>]*>Simpan jawaban/,
    );
    expect(html).toContain(`0 dari ${total} dijawab`);
    expect(html).toContain(`${total} dilewati, pakai default`);
    expect(html).toContain('aria-label="Catatan tahap"');
    expect(html).toContain('Pemakaian tahap ini');
    expect(html).toContain(
      'data-testid="stage-usage">24.100 input · 1.512 output · $0,10 · 19 dtk<',
    );
    expect(html).toContain(`aria-label="Kejelasan ide ${stage2.clarity} dari 5"`);
    expect(html.match(/\+ Lainnya/g)).toHaveLength(total);
  });

  it('tahap 3: bilah aksi menyebut Struktur fitur', () => {
    const html = renderToStaticMarkup(
      <Stage3Section project={atStage3({ stageOutputs: { stage2, stage3: gym3 } })} />,
    );
    expect(html).toMatch(
      /Berikutnya: <span[^>]*>Struktur fitur<\/span><\/span><button type="submit"[^>]*>Simpan jawaban/,
    );
    expect(html).toContain('data-testid="stage-usage">Belum ada<');
  });
});

describe('beranda', () => {
  it('komposer, tiga langkah cara kerja, daftar proyek dengan badge tahap', () => {
    const html = renderToStaticMarkup(
      <HomeView
        projects={[{ ...project({ currentStage: 'stage3' }), lastCompletedStage: 'stage2' }]}
        template={{ valid: false, commit: null }}
      />,
    );
    expect(html).toContain('Ubah ide jadi rencana yang siap dikerjakan agent.');
    expect(html).toContain('<form aria-label="Proyek baru"');
    expect(html).toContain('Cara kerjanya');
    expect(html.match(/font-mono text-\[13px\] text-accent">0[123]</g)).toHaveLength(3);
    expect(html).toContain('Tahap 3 · Klarifikasi teknis');
    expect(html).toContain('template bermasalah');
  });
});
