// Progres terakhir job yang sedang berjalan, di memori proses server (D-12, FR-02). Tidak disimpan
// ke database: progres hanya berarti selama job berjalan, dan job yang terputus karena server
// berhenti ditandai `interrupted` saat start.
//
// Disimpan di globalThis (Symbol.for), bukan di instance `JobQueue`: Next.js bisa memuat modul ini
// lebih dari sekali (bundle instrumentation, route, hot reload), dan job yang dimulai satu route
// harus terbaca oleh route `GET /api/jobs/{id}/stream`.
import type { ClaudeProgress } from '../claude/types.ts';

/** Panjang cuplikan teks terakhir yang dikirim ke UI. */
export const PREVIEW_CHARS = 400;

/** Isi event `progress` (PRD bagian 5): `step`/`totalSteps` untuk tahap berlangkah (7b). */
export type JobProgress = {
  /** Karakter teks yang sudah diterima di pemanggilan yang sedang berjalan. */
  chars: number;
  step?: number;
  totalSteps?: number;
  /** Cuplikan teks terakhir, paling banyak `PREVIEW_CHARS` karakter. */
  preview: string;
  /** Perkiraan token thinking selama Claude berpikir sebelum teks pertama (spike T-022). */
  thinkingTokens?: number;
  /** Percobaan ke-berapa (D-08); teks dihitung ulang dari awal di setiap percobaan. */
  attempt: number;
};

export type ProgressEvent = { type: 'progress'; progress: JobProgress } | { type: 'done' };
type Listener = (event: ProgressEvent) => void;

type Store = { progress: Map<string, JobProgress>; listeners: Map<string, Set<Listener>> };

export class ProgressStore {
  private readonly store: Store;

  constructor(store: Store = { progress: new Map(), listeners: new Map() }) {
    this.store = store;
  }

  get(jobId: string): JobProgress | undefined {
    return this.store.progress.get(jobId);
  }

  /** Percobaan baru dimulai: teks dihitung dari nol, langkah dipertahankan. */
  startAttempt(jobId: string, attempt: number, step?: { step: number; totalSteps: number }) {
    const previous = this.get(jobId);
    this.set(jobId, {
      chars: 0,
      preview: '',
      attempt,
      ...(step ?? (previous?.step ? { step: previous.step, totalSteps: previous.totalSteps } : {})),
    });
  }

  /** Langkah baru dimulai (tahap 7: 7a lalu 7b per fase): teks dihitung dari nol. */
  startStep(jobId: string, step: number, totalSteps: number) {
    this.startAttempt(jobId, 1, { step, totalSteps });
  }

  /** Menerapkan satu potongan dari runner (`onProgress`). */
  report(jobId: string, item: ClaudeProgress) {
    const current = this.get(jobId) ?? { chars: 0, preview: '', attempt: 1 };
    if (item.kind === 'thinking') {
      this.set(jobId, { ...current, thinkingTokens: item.estimatedTokens });
      return;
    }
    this.set(jobId, {
      ...current,
      chars: item.chars,
      preview: (current.preview + item.text).slice(-PREVIEW_CHARS),
    });
  }

  /** Job selesai (apa pun statusnya): progres dihapus dan pendengar menerima `done`. */
  finish(jobId: string) {
    this.store.progress.delete(jobId);
    const listeners = this.store.listeners.get(jobId);
    this.store.listeners.delete(jobId);
    for (const listener of listeners ?? []) notify(listener, { type: 'done' });
  }

  /** Mendengarkan perubahan progres job; mengembalikan fungsi untuk berhenti. */
  subscribe(jobId: string, listener: Listener): () => void {
    const listeners = this.store.listeners.get(jobId) ?? new Set();
    listeners.add(listener);
    this.store.listeners.set(jobId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && this.store.listeners.get(jobId) === listeners) {
        this.store.listeners.delete(jobId);
      }
    };
  }

  private set(jobId: string, progress: JobProgress) {
    this.store.progress.set(jobId, progress);
    for (const listener of this.store.listeners.get(jobId) ?? []) {
      notify(listener, { type: 'progress', progress });
    }
  }
}

// Pendengar yang rusak (misalnya koneksi SSE yang sudah tertutup) tidak boleh menghentikan job.
function notify(listener: Listener, event: ProgressEvent) {
  try {
    listener(event);
  } catch {}
}

const globalKey = Symbol.for('prd-generator.job-progress');
const globalStore = globalThis as typeof globalThis & { [globalKey]?: Store };

/** Store progres bersama untuk seluruh proses server. Test membuat `new ProgressStore()` sendiri. */
export function sharedProgressStore(): ProgressStore {
  globalStore[globalKey] ??= { progress: new Map(), listeners: new Map() };
  return new ProgressStore(globalStore[globalKey]);
}
