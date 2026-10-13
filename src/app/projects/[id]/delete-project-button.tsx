'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!window.confirm(`Hapus proyek "${name}" beserta semua datanya?`)) return;
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
    <div>
      <button
        type="button"
        onClick={remove}
        disabled={deleting}
        className="min-h-11 cursor-pointer text-sm font-semibold text-high hover:underline disabled:opacity-50"
      >
        {deleting ? 'Menghapus…' : 'Hapus proyek'}
      </button>
      {error && (
        <p className="mt-2 text-sm text-high" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
