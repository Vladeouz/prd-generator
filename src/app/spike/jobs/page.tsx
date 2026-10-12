// Spike T-002, dihapus bersama spikes/ di T-019.
import Link from 'next/link';
import { StatusPanel } from '../../../../spikes/jobs/status-panel';

export default function SpikeJobsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Spike job</h1>
      <Link href="/spike/jobs/status" id="to-status" className="text-blue-700 underline">
        Ke halaman status
      </Link>
      <StatusPanel canStart />
    </main>
  );
}
