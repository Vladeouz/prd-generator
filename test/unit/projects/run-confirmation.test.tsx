// @vitest-environment happy-dom
// Interaksi komponen (klik) dengan DOM sungguhan: konfirmasi sebelum tahap 6–7 dijalankan (FR-10).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DecisionForm } from '../../../src/app/projects/[id]/decision-form.tsx';
import { confirmationText } from '../../../src/app/projects/[id]/run-confirmation.ts';
import { StageRunner } from '../../../src/app/projects/[id]/stage-runner.tsx';
import { Stage6Section } from '../../../src/app/projects/[id]/stage6-section.tsx';
import { Stage7Section } from '../../../src/app/projects/[id]/stage7-section.tsx';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import type { ProjectDetail } from '../../../src/projects/projects.ts';
import { TEST_ESTIMATES } from '../../../src/projects/usage.ts';
import type { Review2Output } from '../../../src/stages/review-2/validate.ts';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const ACT_ENV = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  ACT_ENV.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn(async () =>
    Response.json(
      { id: 'j1', stage: 'stage6', status: 'running', createdAt: '', startedAt: '' },
      { status: 202 },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const render = (node: React.ReactNode) => act(() => root.render(node));
const button = (text: string) => {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`tombol "${text}" tidak ada`);
  return found;
};
const click = (text: string) => act(async () => button(text).click());
const panel = (testId: string) => container.querySelector(`[data-testid="${testId}"]`);

const CONFIRM = confirmationText('Penulisan PRD', {
  ...TEST_ESTIMATES.stage6,
  basis: 'test',
  samples: 0,
});

const runner = (confirmation?: string) => (
  <StageRunner
    projectId="p1"
    stage="stage6"
    label="Penulisan PRD"
    activeJob={null}
    latestJob={null}
    hasOutput={false}
    confirmation={confirmation}
  />
);

describe('konfirmasi tahap 6–7 (FR-10)', () => {
  it('teks menyebut perkiraan durasi dan token, dan dasar perkiraannya', () => {
    expect(CONFIRM).toBe(
      'Penulisan PRD memakai kuota langganan Claude: sekitar 4 menit, ±33 rb token input dan ±30 rb token output per percobaan (angka uji, karena belum ada pemanggilan sebelumnya). Bila output ditolak validator, dicoba ulang sekali sehingga bisa dua kali lipat. Lanjutkan?',
    );
    expect(
      confirmationText('Penulisan TASKS', {
        durationMs: 450_000,
        inputTokens: 108_000,
        outputTokens: 48_500,
        basis: 'average',
        samples: 4,
      }),
    ).toContain(
      'sekitar 8 menit, ±108 rb token input dan ±49 rb token output per percobaan (rata-rata 4 pemanggilan sebelumnya)',
    );
  });

  it('menekan tombol jalankan menampilkan konfirmasi dulu; Batal tidak menjalankan apa pun', async () => {
    render(runner(CONFIRM));
    await click('Jalankan penulisan prd');
    expect(panel('run-confirmation')?.textContent).toContain(CONFIRM);
    expect(fetchMock).not.toHaveBeenCalled();
    await click('Batal');
    expect(panel('run-confirmation')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"Ya, jalankan" memulai tahap', async () => {
    render(runner(CONFIRM));
    await click('Jalankan penulisan prd');
    await click('Ya, jalankan');
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/stages/stage6/run', {
      method: 'POST',
    });
    expect(panel('job-status')?.textContent).toContain('Penulisan PRD sedang berjalan');
  });

  it('tahap tanpa konfirmasi langsung dijalankan', async () => {
    render(runner());
    await click('Jalankan penulisan prd');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keputusan review kedua yang menulis ulang PRD meminta konfirmasi sebelum disimpan', async () => {
    const review = JSON.parse(
      loadClaudeFixture('synthetic/review2-daftar-belanja').result,
    ) as Review2Output;
    render(
      <DecisionForm
        projectId="p1"
        origin="review2"
        next="TASKS"
        findings={review.findings}
        saved={{}}
        savedMessage="Tersimpan."
        regenerateConfirmation={CONFIRM}
      />,
    );
    await click('Simpan keputusan');
    expect(panel('regenerate-confirmation')?.textContent).toContain(CONFIRM);
    expect(fetchMock).not.toHaveBeenCalled();
    await click('Ya, simpan dan tulis ulang PRD');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/projects/p1/decisions/review2');
  });
});

describe('layar tahap 6 dan 7 memakai konfirmasi dari perkiraan', () => {
  const NOW = '2026-10-14T00:00:00.000Z';
  const prd = {
    id: 'd',
    projectId: 'p1',
    kind: 'prd' as const,
    version: 1,
    content: '# P\n',
    createdAt: NOW,
  };
  const project = (currentStage: 'stage6' | 'stage7'): ProjectDetail => ({
    id: 'p1',
    name: 'Gym',
    idea: 'Ide',
    currentStage,
    profileChoice: 'A',
    templateCommit: null,
    createdAt: NOW,
    updatedAt: NOW,
    lastCompletedStage: 'stage5',
    totalTokens: { inputTokens: 0, outputTokens: 0 },
    completedStages: [],
    answers: [],
    featureChoices: [],
    decisions: [],
    documents: { prd: currentStage === 'stage7' ? prd : null, tasks: null },
    activeJob: null,
    latestJob: null,
    stageOutputs: {},
  });
  const template = { valid: true, commit: 'a'.repeat(40) };
  const estimate = { ...TEST_ESTIMATES.stage7, basis: 'test' as const, samples: 0 };

  it('tahap 6', async () => {
    render(<Stage6Section project={project('stage6')} template={template} estimate={estimate} />);
    await click('Jalankan penulisan prd');
    expect(panel('run-confirmation')?.textContent).toContain('Penulisan PRD memakai kuota');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tahap 7', async () => {
    render(<Stage7Section project={project('stage7')} template={template} estimate={estimate} />);
    await click('Jalankan penulisan tasks');
    expect(panel('run-confirmation')?.textContent).toContain('Penulisan TASKS memakai kuota');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
