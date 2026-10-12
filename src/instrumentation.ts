// Dipanggil Next.js sekali setiap instance server dibuat, sebelum menerima request. Membuat antrean
// job, yang menandai job dari proses server sebelumnya sebagai `interrupted` (FR-02, spike T-002).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // `next build` juga memuat instrumentation; database tidak boleh disentuh saat build.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { getJobQueue } = await import('./jobs/instance.ts');
  const interrupted = getJobQueue().markInterrupted();
  if (interrupted > 0) {
    console.warn(`${interrupted} job ditandai interrupted karena server sebelumnya berhenti.`);
  }
}
