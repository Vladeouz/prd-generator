// Antrean job milik proses server, disimpan di globalThis agar hot reload tidak membuat antrean
// kedua (temuan spike T-002). Dibuat pertama kali oleh src/instrumentation.ts saat server start,
// yang juga memanggil `markInterrupted()` sekali per proses.
import { CliClaudeRunner } from '../claude/cli-runner.ts';
import { systemClock } from '../core/clock.ts';
import { getDb } from '../core/db/client.ts';
import { JobQueue, type StageRegistry } from './job-queue.ts';

/** Definisi tahap yang tersedia; diisi oleh task tahap 2–7. */
export const stageRegistry: StageRegistry = {};

const globalKey = Symbol.for('prd-generator.job-queue');
const globalQueue = globalThis as typeof globalThis & { [globalKey]?: JobQueue };

export function getJobQueue(): JobQueue {
  let queue = globalQueue[globalKey];
  if (!queue) {
    queue = new JobQueue({
      db: getDb(),
      runner: new CliClaudeRunner(),
      clock: systemClock,
      stages: stageRegistry,
    });
    globalQueue[globalKey] = queue;
  }
  return queue;
}
