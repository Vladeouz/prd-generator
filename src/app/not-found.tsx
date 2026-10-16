import Link from 'next/link';
import { buttonClass } from '../components/ui/button.tsx';
import { ErrorState } from '../components/ui/states.tsx';
import { PageShell } from './page-shell.tsx';

export default function NotFound() {
  return (
    <PageShell>
      <ErrorState
        title="Halaman tidak ditemukan"
        actions={
          <Link href="/" className={buttonClass('primary')}>
            Kembali ke daftar proyek
          </Link>
        }
      >
        Proyek atau halaman ini tidak ada. Mungkin proyeknya sudah dihapus.
      </ErrorState>
    </PageShell>
  );
}
