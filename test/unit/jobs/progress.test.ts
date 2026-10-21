import { describe, expect, it } from 'vitest';
import { sseEvent } from '../../../src/jobs/event-stream.ts';
import {
  PREVIEW_CHARS,
  type ProgressEvent,
  ProgressStore,
  sharedProgressStore,
} from '../../../src/jobs/progress.ts';

describe('ProgressStore', () => {
  it('menghitung karakter dan menyimpan cuplikan teks terakhir saja', () => {
    const store = new ProgressStore();
    store.startAttempt('j1', 1);
    store.report('j1', { kind: 'text', text: 'a'.repeat(PREVIEW_CHARS), chars: PREVIEW_CHARS });
    store.report('j1', { kind: 'text', text: 'AKHIR', chars: PREVIEW_CHARS + 5 });
    const progress = store.get('j1');
    expect(progress?.chars).toBe(PREVIEW_CHARS + 5);
    expect(progress?.preview).toHaveLength(PREVIEW_CHARS);
    expect(progress?.preview.endsWith('AKHIR')).toBe(true);
    expect(progress?.attempt).toBe(1);
  });

  it('thinking dicatat tanpa mengubah teks', () => {
    const store = new ProgressStore();
    store.startAttempt('j1', 1);
    store.report('j1', { kind: 'thinking', estimatedTokens: 350 });
    expect(store.get('j1')).toEqual({ chars: 0, preview: '', attempt: 1, thinkingTokens: 350 });
  });

  it('percobaan baru menghitung teks dari nol dan mempertahankan langkah', () => {
    const store = new ProgressStore();
    store.startAttempt('j1', 1, { step: 2, totalSteps: 4 });
    store.report('j1', { kind: 'text', text: 'lama', chars: 4 });
    store.startAttempt('j1', 2);
    expect(store.get('j1')).toEqual({ chars: 0, preview: '', attempt: 2, step: 2, totalSteps: 4 });
  });

  it('pendengar menerima progres, lalu done saat selesai; progres dihapus', () => {
    const store = new ProgressStore();
    const events: ProgressEvent[] = [];
    store.subscribe('j1', (event) => events.push(event));
    store.startAttempt('j1', 1);
    store.report('j1', { kind: 'text', text: 'x', chars: 1 });
    store.finish('j1');
    expect(events.map((e) => e.type)).toEqual(['progress', 'progress', 'done']);
    expect(store.get('j1')).toBeUndefined();
  });

  it('berhenti berlangganan, pendengar yang rusak tidak mengganggu yang lain', () => {
    const store = new ProgressStore();
    const received: string[] = [];
    store.subscribe('j1', () => {
      throw new Error('koneksi tertutup');
    });
    const stop = store.subscribe('j1', () => received.push('a'));
    store.startAttempt('j1', 1);
    stop();
    store.startAttempt('j1', 1);
    expect(received).toEqual(['a']);
  });

  it('store bersama memakai data yang sama di instance mana pun (lintas bundle Next.js)', () => {
    sharedProgressStore().startAttempt('bersama', 3);
    expect(sharedProgressStore().get('bersama')?.attempt).toBe(3);
    sharedProgressStore().finish('bersama');
  });
});

describe('sseEvent', () => {
  it('format event SSE dengan data JSON satu baris', () => {
    expect(sseEvent('progress', { chars: 1, preview: 'a\nb' })).toBe(
      'event: progress\ndata: {"chars":1,"preview":"a\\nb"}\n\n',
    );
  });
});
