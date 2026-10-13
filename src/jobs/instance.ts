// Antrean job milik proses server, disimpan di globalThis agar hot reload tidak membuat antrean
// kedua (temuan spike T-002). Dibuat pertama kali oleh src/instrumentation.ts saat server start,
// yang juga memanggil `markInterrupted()` sekali per proses.
import { CliClaudeRunner } from '../claude/cli-runner.ts';
import { systemClock } from '../core/clock.ts';
import { getDb } from '../core/db/client.ts';
import { createStageRegistry } from '../stages/registry.ts';
import { JobQueue } from './job-queue.ts';

const globalKey = Symbol.for('prd-generator.job-queue');
const globalQueue = globalThis as typeof globalThis & { [globalKey]?: JobQueue };

export function getJobQueue(): JobQueue {
  let queue = globalQueue[globalKey];
  if (!queue) {
    queue = new JobQueue({
      db: getDb(),
      // CLAUDE_COMMAND (opsional) mengganti perintah `claude`, misalnya script palsu untuk uji UI.
      runner: new CliClaudeRunner({ command: process.env.CLAUDE_COMMAND || undefined }),
      clock: systemClock,
      stages: {},
    });
    globalQueue[globalKey] = queue;
  }
  // Dibuat ulang setiap kali: prompt di prompts/ dan definisi tahap yang diubah langsung terpakai
  // tanpa restart server, walau antreannya sendiri bertahan saat hot reload.
  queue.setStages(createStageRegistry());
  return queue;
}
