// Spike T-002: proses anak palsu pengganti `claude -p`. Berjalan selama <detik>, menulis progres
// setiap detik ke stdout (dibaca server) dan ke file log (tetap terisi walau server sudah mati).
//
//   node spikes/jobs/fake-worker.mjs <jobId> <detik> <file log>
//
// Error pada stdout (pipe ke server putus) dicatat lalu diabaikan, meniru `claude -p` yang baru
// menulis ke stdout di akhir: proses tetap berjalan sampai selesai walau server sudah mati.
import { appendFileSync } from 'node:fs';

const [id, seconds, logFile] = process.argv.slice(2);
const total = Number(seconds);
const log = (entry) =>
  appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);

process.stdout.on('error', (error) => log({ event: 'stdout-error', code: error.code }));
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
  process.on(signal, () => {
    log({ event: 'signal', signal });
    process.exit(130);
  });
}

log({ event: 'start', id, pid: process.pid, ppid: process.ppid, total });
let elapsed = 0;
const timer = setInterval(() => {
  elapsed += 1;
  const progress = { event: 'progress', elapsed, total };
  log(progress);
  if (process.stdout.writable) {
    process.stdout.write(`${JSON.stringify(progress)}\n`);
  }
  if (elapsed >= total) {
    clearInterval(timer);
    log({ event: 'done' });
    process.exit(0);
  }
}, 1000);
