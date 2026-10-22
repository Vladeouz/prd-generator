import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  JobProgressView,
  progressSummary,
  stepFraction,
} from '../../../src/components/job-progress.tsx';

describe('progressSummary', () => {
  it('belum ada progres atau belum ada teks', () => {
    expect(progressSummary(null)).toBe('Menunggu Claude Code mulai menjawab…');
    expect(progressSummary({ chars: 0, preview: '', attempt: 1 })).toBe(
      'Menunggu Claude Code mulai menjawab…',
    );
  });

  it('fase thinking sebelum teks pertama', () => {
    expect(progressSummary({ chars: 0, preview: '', attempt: 1, thinkingTokens: 12_500 })).toBe(
      'Claude sedang berpikir (±12.500 token) sebelum menulis…',
    );
  });

  it('jumlah karakter diterima, dengan langkah ke-i dari n bila ada', () => {
    expect(progressSummary({ chars: 45_004, preview: 'x', attempt: 1, thinkingTokens: 9 })).toBe(
      '45.004 karakter diterima',
    );
    expect(progressSummary({ chars: 1200, preview: 'x', attempt: 1, step: 2, totalSteps: 4 })).toBe(
      'Langkah 2 dari 4 · 1.200 karakter diterima',
    );
  });

  it('detail fase bersamaan: fase selesai dari n, dengan jumlah yang gagal (T-033)', () => {
    const base = { chars: 3_400, preview: 'x', attempt: 1, step: 2, totalSteps: 2 };
    expect(progressSummary({ ...base, phasesDone: 3, phasesTotal: 5 })).toBe(
      'Langkah 2 dari 2 · Fase selesai: 3 dari 5 · 3.400 karakter diterima',
    );
    expect(progressSummary({ ...base, phasesDone: 3, phasesFailed: 1, phasesTotal: 5 })).toBe(
      'Langkah 2 dari 2 · Fase selesai: 3 dari 5 (1 gagal) · 3.400 karakter diterima',
    );
    expect(progressSummary({ ...base, chars: 0, phasesDone: 0, phasesTotal: 5 })).toBe(
      'Langkah 2 dari 2 · Fase selesai: 0 dari 5 · Menunggu Claude Code mulai menjawab…',
    );
  });
});

describe('stepFraction', () => {
  it('bernilai hanya bila jumlah langkah diketahui', () => {
    expect(stepFraction(null)).toBeUndefined();
    expect(stepFraction({ chars: 5, preview: '', attempt: 1 })).toBeUndefined();
    expect(stepFraction({ chars: 5, preview: '', attempt: 1, step: 3, totalSteps: 4 })).toBe(0.5);
    // Langkah detail fase: fase yang selesai atau gagal ikut mengisi langkah itu.
    const phases = { chars: 5, preview: '', attempt: 1, step: 2, totalSteps: 2, phasesTotal: 4 };
    expect(stepFraction({ ...phases, phasesDone: 0 })).toBe(0.5);
    expect(stepFraction({ ...phases, phasesDone: 2, phasesFailed: 1 })).toBe(0.875);
  });
});

describe('JobProgressView', () => {
  it('menampilkan cuplikan teks terakhir, percobaan, dan bilah langkah', () => {
    const html = renderToStaticMarkup(
      <JobProgressView
        label="Penulisan TASKS"
        progress={{
          chars: 300,
          preview: '## 6. Functional <Requirements>',
          attempt: 2,
          step: 2,
          totalSteps: 4,
        }}
      />,
    );
    expect(html).toContain('data-testid="job-preview"');
    expect(html).toContain('## 6. Functional &lt;Requirements&gt;');
    expect(html).toContain(' · percobaan 2');
    expect(html).toContain('aria-label="Langkah 2 dari 4"');
    expect(html).toContain('aria-valuenow="25"');
  });

  it('tanpa cuplikan selama belum ada teks', () => {
    const html = renderToStaticMarkup(
      <JobProgressView label="Penulisan PRD" progress={{ chars: 0, preview: '', attempt: 1 }} />,
    );
    expect(html).not.toContain('job-preview');
    expect(html).not.toContain('percobaan');
  });
});
