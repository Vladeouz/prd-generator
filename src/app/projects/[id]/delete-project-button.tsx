'use client';
// Menghapus proyek dengan konfirmasi di halaman (bukan `window.confirm`), agar konsisten dengan
// konfirmasi lain dan bisa dipakai dengan keyboard.
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ConfirmPanel } from '../../../components/ui/confirm-panel.tsx';

export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function cancel() {
    setConfirming(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function remove() {
    setConfirming(false);
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (response.status === 204) {
        router.push('/');
        router.refresh();
        return;
      }
      const body = await response.json();
      setError(body.error?.message ?? 'Proyek gagal dihapus.');
    } catch {
      setError('Gagal menghubungi server. Coba lagi.');
    }
    setDeleting(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <ConfirmPanel
          tone="high"
          confirmLabel="Ya, hapus"
          onConfirm={remove}
          onCancel={cancel}
          data-testid="delete-confirmation"
        >
          Hapus proyek “{name}” beserta semua jawaban, keputusan, dan dokumennya? Tindakan ini tidak
          bisa dibatalkan.
        </ConfirmPanel>
      ) : (
        <button
          ref={trigger}
          type="button"
          onClick={() => setConfirming(true)}
          disabled={deleting}
          className="min-h-11 cursor-pointer self-start text-sm font-semibold text-high hover:underline disabled:opacity-50"
        >
          {deleting ? 'Menghapus…' : 'Hapus proyek'}
        </button>
      )}
      {error && (
        <p className="text-sm text-high" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
