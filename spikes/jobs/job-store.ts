// Spike T-002: penyimpanan job di memori proses server Next.js, dengan salinan di file JSON di folder
// sementara OS agar perilaku setelah server mati bisa diamati.
//
// Yang diamati:
// - `moduleId` berubah setiap kali modul ini dievaluasi ulang (hot reload, atau salinan modul per
//   route bundle). State disimpan di `globalThis` agar tidak hilang karena itu.
// - Saat store dibuat pertama kali di sebuah proses, job yang tercatat `running` di file ditandai
//   `interrupted`, beserta apakah proses anaknya masih hidup (yatim).
import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type SpikeJobStatus = 'running' | 'succeeded' | 'failed' | 'interrupted';

export type SpikeJob = {
  id: string;
  status: SpikeJobStatus;
  total: number;
  elapsed: number;
  serverPid: number;
  workerPid: number | null;
  startedByModule: string;
  startedAt: string;
  finishedAt: string | null;
  exit: string | null;
  orphanAliveAtStartup: boolean | null;
  logFile: string;
};

type Store = {
  createdAt: string;
  createdByModule: string;
  jobs: Map<string, SpikeJob>;
  children: Map<string, ChildProcess>;
};

export class SpikeJobConflict extends Error {}

export const STATE_DIR = join(tmpdir(), 'prd-generator-spike-jobs');
const STATE_FILE = join(STATE_DIR, 'jobs.json');
const WORKER = join(process.cwd(), 'spikes', 'jobs', 'fake-worker.mjs');

export const moduleId = randomUUID().slice(0, 8);
export const moduleLoadedAt = new Date().toISOString();

const globalKey = Symbol.for('prd-generator.spike-jobs');
const globalStore = globalThis as typeof globalThis & { [globalKey]?: Store };

function isAlive(pid: number | null) {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function save(store: Store) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify([...store.jobs.values()], null, 2));
}

function load(): SpikeJob[] {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : [];
}

export function getStore(): Store {
  const existing = globalStore[globalKey];
  if (existing) return existing;

  const store: Store = {
    createdAt: new Date().toISOString(),
    createdByModule: moduleId,
    jobs: new Map(),
    children: new Map(),
  };
  for (const job of load()) {
    if (job.status === 'running') {
      job.status = 'interrupted';
      job.finishedAt = new Date().toISOString();
      job.orphanAliveAtStartup = isAlive(job.workerPid);
    }
    store.jobs.set(job.id, job);
  }
  save(store);
  globalStore[globalKey] = store;
  return store;
}

export function listJobs() {
  return [...getStore().jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function startJob(seconds: number): SpikeJob {
  const store = getStore();
  // Cek dan set tanpa await di antaranya: atomik di satu event loop.
  const active = [...store.jobs.values()].find((job) => job.status === 'running');
  if (active) {
    throw new SpikeJobConflict(`Job ${active.id} masih berjalan.`);
  }

  const id = randomUUID().slice(0, 8);
  mkdirSync(STATE_DIR, { recursive: true });
  const job: SpikeJob = {
    id,
    status: 'running',
    total: seconds,
    elapsed: 0,
    serverPid: process.pid,
    workerPid: null,
    startedByModule: moduleId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exit: null,
    orphanAliveAtStartup: null,
    logFile: join(STATE_DIR, `${id}.log`),
  };
  store.jobs.set(id, job);

  const child = spawn(process.execPath, [WORKER, id, String(seconds), job.logFile], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  job.workerPid = child.pid ?? null;
  store.children.set(id, child);

  let buffer = '';
  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const progress = JSON.parse(line) as { elapsed: number };
      job.elapsed = progress.elapsed;
    }
    save(store);
  });
  child.on('exit', (code, signal) => {
    job.status = code === 0 ? 'succeeded' : 'failed';
    job.exit = String(code ?? signal);
    job.finishedAt = new Date().toISOString();
    store.children.delete(id);
    save(store);
  });
  save(store);
  return job;
}
