// Antrean job milik proses server, disimpan di globalThis agar hot reload tidak membuat antrean
// kedua (temuan spike T-002). Dibuat pertama kali oleh src/instrumentation.ts saat server start,
// yang juga memanggil `markInterrupted()` sekali per proses.
import { CliClaudeRunner } from '../claude/cli-runner.ts';
import { systemClock } from '../core/clock.ts';
import { claudeModel } from '../core/config/claude.ts';
import { getDb } from '../core/db/client.ts';
import { createStageRegistry } from '../stages/registry.ts';
import { JobQueue } from './job-queue.ts';

const globalKey = Symbol.for('prd-generator.job-queue');
const globalQueue = globalThis as typeof globalThis & { [globalKey]?: unknown };

/**
 * Antrean yang dibuat dari kode `JobQueue` lama (bundle instrumentation, yang tidak ikut hot reload,
 * atau modul sebelum hot reload) diganti: kalau tidak, job tetap dijalankan `runStage` lama dengan
 * definisi tahap baru (ditemukan saat verifikasi T-014: validator review kedua menerima konteks
 * `undefined`). Aman, karena semua status job ada di database: job yang sedang berjalan di antrean
 * lama tetap selesai dan menulis statusnya, dan aturan satu job aktif diperiksa di database.
 */
export function currentQueue(existing: unknown, create: () => JobQueue): JobQueue {
  return existing instanceof JobQueue ? existing : create();
}

export function getJobQueue(): JobQueue {
  const queue = currentQueue(
    globalQueue[globalKey],
    () =>
      new JobQueue({
        db: getDb(),
        // CLAUDE_COMMAND (opsional) mengganti perintah `claude`, misalnya script palsu untuk uji UI.
        // CLAUDE_MODEL (opsional, bawaan sonnet) memilih model (D-09).
        runner: new CliClaudeRunner({
          command: process.env.CLAUDE_COMMAND || undefined,
          model: claudeModel(),
        }),
        clock: systemClock,
        stages: {},
      }),
  );
  globalQueue[globalKey] = queue;
  // Dibuat ulang setiap kali: prompt di prompts/ dan definisi tahap yang diubah langsung terpakai
  // tanpa restart server.
  queue.setStages(createStageRegistry());
  return queue;
}
