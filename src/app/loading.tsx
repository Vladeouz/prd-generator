import { LoadingState } from '../components/ui/states.tsx';
import { PageShell } from './page-shell.tsx';

export default function Loading() {
  return (
    <PageShell>
      <LoadingState label="Memuat halaman…" />
    </PageShell>
  );
}
