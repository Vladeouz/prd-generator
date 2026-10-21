// T-021: pembaca dokumen (mockup Prd.dc.html), keadaan kosong/memuat/error, dan landmark keyboard.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ErrorPage from '../../../src/app/error.tsx';
import Loading from '../../../src/app/loading.tsx';
import NotFound from '../../../src/app/not-found.tsx';
import ProjectLoading from '../../../src/app/projects/[id]/loading.tsx';
import { ProjectView } from '../../../src/app/projects/[id]/project-view.tsx';
import {
  bannerEstimate,
  confirmationText,
} from '../../../src/app/projects/[id]/run-confirmation.ts';
import { StageRunner } from '../../../src/app/projects/[id]/stage-runner.tsx';
import { HomeView } from '../../../src/app/projects/home-view.tsx';
import { SettingsView } from '../../../src/app/settings/settings-view.tsx';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import {
  documentOutline,
  splitRequirementId,
} from '../../../src/components/ui/markdown-outline.ts';
import { MarkdownPreview } from '../../../src/components/ui/markdown-preview.tsx';
import { composePrd } from '../../../src/projects/compose-prd.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import { TEST_ESTIMATES } from '../../../src/projects/usage.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-14T00:00:00.000Z';
const PRD = composePrd(loadClaudeFixture('derived/stage6-gym').result, {
  decisions: [],
  assumptions: [],
  guesses: [],
  openQuestions: [],
});
const TASKS = loadClaudeFixture('derived/stage7-gym').result;
const doc = (kind: 'prd' | 'tasks', content: string) => ({
  id: `d-${kind}`,
  projectId: 'p1',
  kind,
  version: 1,
  content,
  createdAt: NOW,
});

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Gym',
  idea: 'Aplikasi membership untuk sebuah gym.',
  currentStage: 'review2',
  profileChoice: 'A',
  templateCommit: 'abcdef1',
  createdAt: NOW,
  updatedAt: NOW,
  lastCompletedStage: 'stage6',
  totalTokens: { inputTokens: 0, outputTokens: 0 },
  completedStages: ['stage2', 'stage3', 'stage4', 'stage5', 'stage6'],
  answers: [],
  featureChoices: [],
  decisions: [],
  documents: { prd: doc('prd', PRD), tasks: null },
  activeJob: null,
  latestJob: null,
  stageOutputs: {},
  ...patch,
});

const view = (detail: ProjectDetail, stage: string) =>
  renderToStaticMarkup(
    <ProjectView project={detail} stage={stage} template={{ valid: true, commit: 'abcdef1' }} />,
  );

describe('daftar isi dokumen', () => {
  it('PRD: bagian bernomor 1–8, tanpa heading di dalam blok kode', () => {
    const items = documentOutline(PRD);
    expect(items.map((i) => i.no)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(items[0]).toEqual({ id: 'bagian-1', no: '1', label: 'Context & Goal' });
    expect(items[7]?.label).toBe('Assumptions & Decisions');
    expect(documentOutline('```\n## bukan heading\n```\n## Satu `kode`\n## [Dua](x)')).toEqual([
      { id: 'bagian-1', no: '1', label: 'Satu kode' },
      { id: 'bagian-2', no: '2', label: 'Dua' },
    ]);
  });

  it('TASKS: heading fase memakai nomor urut', () => {
    const items = documentOutline(TASKS);
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]?.label).toMatch(/^Fase 0/);
    expect(items.map((i) => i.no)).toEqual(items.map((_, n) => String(n + 1)));
  });

  it('id heading di pratinjau sama dengan tautan daftar isi', () => {
    const html = renderToStaticMarkup(<MarkdownPreview markdown={PRD} label="Pratinjau PRD" />);
    for (const item of documentOutline(PRD)) expect(html).toContain(`<h2 id="${item.id}"`);
  });

  it('judul FR menampilkan ID dengan huruf mono aksen; tabel bisa digulir dengan keyboard', () => {
    expect(splitRequirementId('FR-07: Perpanjangan')).toEqual({
      id: 'FR-07',
      rest: ': Perpanjangan',
    });
    expect(splitRequirementId('Bukan FR-01')).toBeNull();
    const html = renderToStaticMarkup(<MarkdownPreview markdown={PRD} label="Pratinjau PRD" />);
    expect(html).toMatch(/<h3><span class="font-mono text-accent">FR-01<\/span>/);
    expect(html).toContain('<section class="prd-markdown-table" aria-label="Tabel" tabindex="0">');
    expect(html).toContain('<pre tabindex="0"><code class="language-mermaid">');
  });
});

describe('layar PRD (Prd.dc.html)', () => {
  it('daftar isi di kolom kiri menautkan setiap bagian PRD', () => {
    const html = view(project(), '6');
    expect(html).toContain('aria-label="Daftar isi PRD"');
    expect(html).toContain('PRD · versi 1');
    expect(html).toContain('href="#bagian-1"');
    expect(html).toContain('href="#bagian-8"');
  });

  it('panel ekspor: PRD bisa diunduh, TASKS belum siap, tulis ke folder belum aktif', () => {
    const html = view(project(), '6');
    expect(html).toContain('href="/api/projects/p1/documents/prd?download=1"');
    expect(html).toContain('TASKS.md belum siap');
    expect(html).toContain('Menulis ke folder proyek aktif setelah TASKS selesai');
    expect(html).not.toContain('href="/projects/p1?tahap=8"');
  });

  it('setelah TASKS selesai: kedua file bisa diunduh dan layar ekspor ditautkan', () => {
    const html = view(
      project({
        currentStage: 'export',
        documents: { prd: doc('prd', PRD), tasks: doc('tasks', TASKS) },
      }),
      '7',
    );
    expect(html).toContain('aria-label="Daftar isi TASKS"');
    expect(html).toContain('href="/api/projects/p1/documents/tasks?download=1"');
    expect(html).toMatch(/href="\/projects\/p1\?tahap=8"[^>]*>Tulis ke folder proyek/);
  });

  it('layar tanpa dokumen tidak punya daftar isi', () => {
    const html = view(
      project({ currentStage: 'stage6', documents: { prd: null, tasks: null } }),
      '6',
    );
    expect(html).not.toContain('data-testid="document-toc"');
  });
});

describe('banner job berjalan', () => {
  it('perkiraan banner sama dengan konfirmasi', () => {
    const estimate = { ...TEST_ESTIMATES.stage6, basis: 'test' as const, samples: 0 };
    expect(bannerEstimate(estimate)).toEqual({
      estimate: 'sekitar 4 menit',
      estimateMs: 267_620,
      estimateTokens: '±30 rb token output',
    });
    expect(confirmationText('Penulisan PRD', estimate)).toContain('sekitar 4 menit');
    expect(bannerEstimate(undefined)).toEqual({});
  });

  it('menampilkan status, waktu berjalan, perkiraan token, dan progres nyata (bukan dari waktu)', () => {
    const started = new Date(Date.now() - 60_000).toISOString();
    const html = renderToStaticMarkup(
      <StageRunner
        projectId="p1"
        stage="stage7"
        label="Penulisan TASKS"
        activeJob={{
          id: 'j1',
          projectId: 'p1',
          stage: 'stage7',
          status: 'running',
          error: null,
          createdAt: started,
          startedAt: started,
          finishedAt: null,
        }}
        latestJob={null}
        hasOutput={false}
        estimate="sekitar 3 menit"
        estimateMs={180_000}
        estimateTokens="±19 rb token output"
      />,
    );
    expect(html).toContain('aria-label="Job berjalan"');
    expect(html).toContain(
      'role="status" data-testid="job-status">Penulisan TASKS sedang berjalan<',
    );
    expect(html).toContain('perkiraan sekitar 3 menit dan ±19 rb token output');
    // Sebelum event progres pertama datang: belum ada progres, bilah tidak tentu.
    expect(html).toContain('Menunggu Claude Code mulai menjawab…');
    expect(html).toContain('role="progressbar" aria-label="Progres penulisan tasks"');
    expect(html).not.toContain('aria-valuenow');
    expect(html).not.toContain('persen dari perkiraan waktu');
  });
});

describe('keadaan memuat, error, dan tidak ditemukan', () => {
  it('memuat: teks status untuk pembaca layar', () => {
    expect(renderToStaticMarkup(<Loading />)).toContain('role="status"');
    expect(renderToStaticMarkup(<Loading />)).toContain('Memuat halaman…');
    expect(renderToStaticMarkup(<ProjectLoading />)).toContain('Memuat proyek…');
  });

  it('tidak ditemukan: penjelasan dan tautan kembali', () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain('Halaman tidak ditemukan');
    expect(html).toContain('Mungkin proyeknya sudah dihapus');
    expect(html).toContain('href="/"');
  });

  it('error: penjelasan, tombol coba lagi, dan kode error', () => {
    const error = Object.assign(new Error('db'), { digest: 'abc123' });
    const html = renderToStaticMarkup(<ErrorPage error={error} reset={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Terjadi kesalahan');
    expect(html).toContain('Coba lagi');
    expect(html).toContain('Kode error: abc123');
    expect(html).not.toContain('>db<');
  });
});

describe('landmark konten utama (tautan "Lewati ke konten utama")', () => {
  it('beranda, halaman proyek, dan pengaturan punya main#konten', () => {
    expect(renderToStaticMarkup(<HomeView projects={[]} />)).toContain('<main id="konten"');
    expect(view(project(), '6')).toContain('<main id="konten"');
    expect(
      renderToStaticMarkup(
        <SettingsView
          settings={{
            templateDir: null,
            templateCommit: null,
            problems: ['TEMPLATE_DIR belum diisi'],
            claudeAvailable: false,
            claudeVersion: null,
          }}
        />,
      ),
    ).toContain('<main id="konten"');
  });
});
