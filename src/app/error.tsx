'use client';
// Error tak terduga saat halaman dirender (misalnya database tidak bisa dibuka). Header tidak ikut
// dirender, karena bisa jadi header itulah yang gagal.
import Link from 'next/link';
import { Button, buttonClass } from '../components/ui/button.tsx';
import { ErrorState } from '../components/ui/states.tsx';

type Props = { error: Error & { digest?: string }; reset: () => void };

export default function ErrorPage({ error, reset }: Props) {
  return (
    <main
      id="konten"
      className="mx-auto flex max-w-[760px] flex-col gap-5 px-5 pt-12 pb-24 sm:px-8"
    >
      <ErrorState
        title="Terjadi kesalahan"
        actions={
          <>
            <Button onClick={reset}>Coba lagi</Button>
            <Link href="/" className={buttonClass('secondary')}>
              Kembali ke daftar proyek
            </Link>
          </>
        }
      >
        <p>
          Halaman ini gagal dimuat. Data proyekmu tetap tersimpan. Coba lagi, atau periksa terminal
          tempat <code className="font-mono">pnpm dev</code> berjalan untuk melihat penyebabnya.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-ink-muted">Kode error: {error.digest}</p>
        )}
      </ErrorState>
    </main>
  );
}
