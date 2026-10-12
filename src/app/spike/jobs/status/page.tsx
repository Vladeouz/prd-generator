// Spike T-002, dihapus bersama spikes/ di T-019.
import Link from 'next/link';
import { StatusPanel } from '../../../../../spikes/jobs/status-panel.tsx';

export default function SpikeJobsStatusPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold" id="status-title">
        Status job (halaman lain)
      </h1>
      <Link href="/spike/jobs" className="text-blue-700 underline">
        Kembali
      </Link>
      <StatusPanel canStart={false} />
    </main>
  );
}
