import type { ReactNode } from 'react';
import { AppHeader } from '../components/ui/app-header.tsx';

/** Kerangka halaman untuk keadaan memuat, error, dan tidak ditemukan: header dan konten sempit. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main
        id="konten"
        className="mx-auto flex max-w-[760px] flex-col gap-5 px-5 pt-12 pb-24 sm:px-8"
      >
        {children}
      </main>
    </>
  );
}
