import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import { HomeView } from '../../../src/app/projects/home-view.tsx';
import type { ProjectDetail, ProjectSummary } from '../../../src/projects/projects.ts';

// Komponen klien memakai router App Router; di luar Next cukup diganti tiruan.
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const base: ProjectSummary = {
  id: 'p1',
  name: 'Gym',
  idea: 'Aplikasi membership untuk sebuah gym.',
  currentStage: 'stage2',
  profileChoice: null,
  templateCommit: null,
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
  lastCompletedStage: null,
  totalTokens: { inputTokens: 0, outputTokens: 0 },
};

describe('HomeView', () => {
  it('punya tautan ke /settings', () => {
    const html = renderToStaticMarkup(<HomeView projects={[]} />);
    expect(html).toMatch(/<a[^>]*href="\/settings"[^>]*>Pengaturan<\/a>/);
  });

  it('form proyek baru: nama dan ide wajib, ide dibatasi 4000 karakter', () => {
    const html = renderToStaticMarkup(<HomeView projects={[]} />);
    expect(html).toMatch(/<input[^>]*id="project-name"[^>]*required/);
    expect(html).toMatch(
      /<textarea[^>]*maxLength="4000"[^>]*required|<textarea[^>]*required[^>]*maxLength="4000"/,
    );
    expect(html).toContain('0/4000 karakter');
    expect(html).toContain('Buat proyek');
    expect(html).toContain('Belum ada proyek.');
  });

  it('daftar proyek menampilkan tahap terakhir yang selesai dan total token', () => {
    const html = renderToStaticMarkup(
      <HomeView
        projects={[
          {
            ...base,
            id: 'p2',
            name: 'Katalog UMKM',
            lastCompletedStage: 'stage3',
            totalTokens: { inputTokens: 24412, outputTokens: 1521 },
          },
          base,
        ]}
      />,
    );
    expect(html).toContain('href="/projects/p2"');
    expect(html).toContain('Katalog UMKM');
    expect(html).toMatch(/data-testid="last-stage">Klarifikasi teknis</);
    expect(html).toMatch(/data-testid="tokens">24\.412 input · 1\.521 output</);
    expect(html).toMatch(/data-testid="last-stage">Belum ada</);
    expect(html).toMatch(/data-testid="tokens">0 input · 0 output</);
  });
});

describe('ProjectView', () => {
  const detail: ProjectDetail = {
    ...base,
    completedStages: [],
    answers: [],
    featureChoices: [],
    decisions: [],
    documents: { prd: null, tasks: null },
    activeJob: null,
  };

  it('proyek baru: tahap klarifikasi produk siap dijalankan', () => {
    const html = renderToStaticMarkup(<ProjectView project={detail} />);
    expect(html).toContain('Gym');
    expect(html).toContain('Aplikasi membership untuk sebuah gym.');
    expect(html).toMatch(/id="current-stage">Klarifikasi produk — siap dijalankan</);
    expect(html).toContain('Hapus proyek');
  });

  it('job berjalan ditampilkan', () => {
    const html = renderToStaticMarkup(
      <ProjectView
        project={{
          ...detail,
          activeJob: {
            id: 'j',
            projectId: 'p1',
            stage: 'stage2',
            status: 'running',
            error: null,
            createdAt: base.createdAt,
            startedAt: base.createdAt,
            finishedAt: null,
          },
        }}
      />,
    );
    expect(html).toMatch(/Klarifikasi produk — sedang berjalan/);
  });
});
