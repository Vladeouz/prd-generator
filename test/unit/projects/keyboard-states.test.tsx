// @vitest-environment happy-dom
// T-021: konfirmasi bisa dipakai dengan keyboard (fokus, Escape, fokus kembali), dan keadaan error
// koneksi tampil dalam Bahasa Indonesia.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteProjectButton } from '../../../src/app/projects/[id]/delete-project-button.tsx';
import { StageRunner } from '../../../src/app/projects/[id]/stage-runner.tsx';
import { ConfirmPanel } from '../../../src/components/ui/confirm-panel.tsx';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/font/google', () => ({
  Plus_Jakarta_Sans: () => ({ variable: 'font-jakarta' }),
  JetBrains_Mono: () => ({ variable: 'font-jetbrains' }),
}));

const ACT_ENV = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  ACT_ENV.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const render = (node: React.ReactNode) => act(() => root.render(node));
const button = (text: string) => {
  const found = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!found) throw new Error(`tombol "${text}" tidak ada`);
  return found;
};
const click = (text: string) => act(async () => button(text).click());
const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const pressEscape = (target: Element) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
// Fokus dikembalikan lewat requestAnimationFrame.
const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

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

describe('ConfirmPanel', () => {
  it('fokus langsung ke tombol konfirmasi, dan Escape sama dengan Batal', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmPanel confirmLabel="Ya" onCancel={onCancel}>
        Yakin?
      </ConfirmPanel>,
    );
    expect(document.activeElement).toBe(button('Ya'));
    expect(container.querySelector('[role="alertdialog"]')?.getAttribute('aria-labelledby')).toBe(
      container.querySelector('[role="alertdialog"] > div')?.id,
    );
    await pressEscape(button('Ya'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('StageRunner dengan keyboard', () => {
  it('Escape menutup konfirmasi tanpa menjalankan tahap, lalu fokus kembali ke tombol jalankan', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(runner('Lanjutkan?'));
    await click('Jalankan penulisan prd');
    expect(document.activeElement).toBe(button('Ya, jalankan'));
    await pressEscape(button('Ya, jalankan'));
    await nextFrame();
    expect(byTestId('run-confirmation')).toBeNull();
    expect(document.activeElement).toBe(button('Jalankan penulisan prd'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('server tidak bisa dihubungi saat memulai: pesan error, tombol bisa dipakai lagi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    render(runner());
    await click('Jalankan penulisan prd');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      'Gagal menghubungi server. Pastikan server masih berjalan, lalu coba lagi.',
    );
    expect(button('Jalankan penulisan prd').disabled).toBe(false);
  });

  it('polling yang gagal dua kali berturut-turut menampilkan koneksi terputus', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const started = new Date().toISOString();
    render(
      <StageRunner
        projectId="p1"
        stage="stage2"
        label="Klarifikasi produk"
        activeJob={{
          id: 'j1',
          projectId: 'p1',
          stage: 'stage2',
          status: 'running',
          error: null,
          createdAt: started,
          startedAt: started,
          finishedAt: null,
        }}
        latestJob={null}
        hasOutput={false}
      />,
    );
    await act(async () => vi.advanceTimersByTime(2000));
    expect(byTestId('poll-disconnected')).toBeNull();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(byTestId('poll-disconnected')?.textContent).toBe(
      'Koneksi ke server terputus. Mencoba lagi…',
    );
  });
});

describe('DeleteProjectButton', () => {
  it('konfirmasi di halaman, bukan dialog browser; Batal mengembalikan fokus', async () => {
    const confirmSpy = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmSpy);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeleteProjectButton projectId="p1" name="Gym" />);
    await click('Hapus proyek');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(byTestId('delete-confirmation')?.textContent).toContain('Hapus proyek “Gym”');
    expect(document.activeElement).toBe(button('Ya, hapus'));
    await click('Batal');
    await nextFrame();
    expect(document.activeElement).toBe(button('Hapus proyek'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('"Ya, hapus" menghapus proyek', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<DeleteProjectButton projectId="p1" name="Gym" />);
    await click('Hapus proyek');
    await click('Ya, hapus');
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1', { method: 'DELETE' });
  });
});

describe('tata letak', () => {
  it('tautan pertama halaman melompat ke konten utama', async () => {
    const { default: RootLayout } = await import('../../../src/app/layout.tsx');
    const html = renderToStaticMarkup(
      <RootLayout>
        <main id="konten">isi</main>
      </RootLayout>,
    );
    const body = html.slice(html.indexOf('<body'));
    expect(body).toMatch(/^<body[^>]*><a href="#konten"[^>]*>Lewati ke konten utama<\/a>/);
    expect(body).toContain('focus:not-sr-only');
  });
});
