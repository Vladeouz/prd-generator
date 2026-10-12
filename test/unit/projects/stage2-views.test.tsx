import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { formatElapsed } from '../../../src/app/projects/[id]/stage-runner.tsx';
import { Stage2Section } from '../../../src/app/projects/[id]/stage2-section.tsx';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { Job } from '../../../src/jobs/job-queue.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import type { Stage2Output } from '../../../src/stages/stage-2/validate.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const NOW = '2026-10-12T00:00:00.000Z';
const gym = JSON.parse(loadClaudeFixture('stage2').result) as Stage2Output;

const project = (patch: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  name: 'Gym',
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

const render = (detail: ProjectDetail) => renderToStaticMarkup(<Stage2Section project={detail} />);

describe('Stage2Section', () => {
  it('belum dijalankan: tombol jalankan, tanpa pertanyaan', () => {
    const html = render(project());
    expect(html).toContain('Jalankan klarifikasi produk');
    expect(html).not.toContain('data-testid="questions-stage2"');
  });

  it('job berjalan: status dan waktu berjalan, boleh meninggalkan halaman', () => {
    const html = render(project({ activeJob: job({}) }));
    expect(html).toMatch(/data-testid="job-status">Klarifikasi produk sedang berjalan · \d+:\d{2}/);
    expect(html).toContain('(perkiraan sekitar 20 detik)');
    expect(html).toContain('Kamu boleh meninggalkan halaman ini.');
    expect(html).not.toContain('Jalankan klarifikasi produk');
  });

  it('tahap lain sedang berjalan: tombol nonaktif dengan keterangan', () => {
    const html = render(project({ activeJob: job({ stage: 'stage3' }) }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Jalankan klarifikasi produk/);
    expect(html).toContain('Tahap lain sedang berjalan.');
  });

  it('job terakhir gagal: pesan penyebab tampil', () => {
    const html = render(
      project({
        latestJob: job({
          status: 'failed',
          error: 'Claude Code tidak selesai dalam batas waktu 15 menit; proses dihentikan.',
        }),
      }),
    );
    expect(html).toContain(
      'Gagal: Claude Code tidak selesai dalam batas waktu 15 menit; proses dihentikan.',
    );
  });

  it('output ada: pertanyaan, opsi, Lainnya, lewati, dan keterangan tebakan hanya untuk masalah dan pengguna', () => {
    const html = render(project({ stageOutputs: { stage2: gym } }));
    for (const question of gym.questions) {
      expect(html).toContain(question.question);
      for (const option of question.options) expect(html).toContain(option);
    }
    expect(html.match(/data-testid="guess-note"/g)).toHaveLength(2);
    expect(html.match(/Lainnya/g)?.length).toBe(gym.questions.length);
    expect(html.match(/Lewati, pakai default/g)?.length).toBe(gym.questions.length);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('Jalankan ulang klarifikasi produk');
    expect(html).toContain(`Kejelasan ide 2/5: ${gym.clarity_reason}`);
  });

  it('asumsi dan hal teknis yang ditunda tampil; jawaban tersimpan terpilih lagi', () => {
    const output = {
      ...gym,
      assumptions: ['Satu gym saja'],
      deferred_technical: ['Ide menyebut web'],
    };
    const q1 = gym.questions[0] as Stage2Output['questions'][number];
    const html = render(
      project({
        stageOutputs: { stage2: output },
        answers: [
          {
            id: 'a1',
            projectId: 'p1',
            stage: 'stage2',
            questionId: 'q1',
            topic: 'masalah',
            value: q1.options[1],
            source: 'user',
            createdAt: NOW,
          },
        ],
      }),
    );
    expect(html).toContain('Satu gym saja');
    expect(html).toContain('Dibahas di tahap teknis');
    expect(html).toContain('Ide menyebut web');
    expect(html).toContain('data-testid="answers-saved"');
    expect(html).toContain('Tahap berikutnya: Klarifikasi teknis — siap dijalankan.');
    expect(html).toMatch(new RegExp(`checked=""/>${escapeRegExp(q1.options[1] as string)}`));
  });
});

describe('formatElapsed', () => {
  it('menit:detik', () => {
    expect([0, 5_400, 65_000, 3_600_000].map(formatElapsed)).toEqual([
      '0:00',
      '0:05',
      '1:05',
      '60:00',
    ]);
  });
});

function escapeRegExp(text: string) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
