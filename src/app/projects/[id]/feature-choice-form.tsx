'use client';
// Pilihan fitur rekomendasi (FR-05): semuanya tidak dicentang secara default, dan hanya yang
// dicentang ikut ke tahap berikutnya. Sisanya menjadi non-goals.
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { StickyActionBar } from '../../../components/ui/sticky-action-bar.tsx';
import type { RecommendedFeature } from '../../../stages/stage-4/validate.ts';

type Props = {
  projectId: string;
  features: RecommendedFeature[];
  /** Kode yang dicentang dari pilihan tersimpan; kosong bila belum pernah disimpan. */
  saved: string[];
  /** Pesan setelah pilihan tersimpan. */
  savedMessage: string;
};

export function FeatureChoiceForm({ projectId, features, saved, savedMessage }: Props) {
  const router = useRouter();
  const [accepted, setAccepted] = useState<string[]>(saved);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setAccepted((current) =>
      current.includes(id) ? current.filter((code) => code !== id) : [...current, id],
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/features`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accepted }),
      });
      const body = await response.json();
      if (response.ok) {
        setMessage(savedMessage);
        router.refresh();
      } else {
        setMessage(
          body.error?.details?.accepted ?? body.error?.message ?? 'Pilihan gagal disimpan.',
        );
        setFailed(true);
      }
    } catch {
      setMessage('Gagal menghubungi server. Coba lagi.');
      setFailed(true);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-testid="feature-choices">
      <section aria-labelledby="recommended-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="recommended-title" className="text-lg font-bold">
            Fitur rekomendasi
          </h2>
          <p className="text-sm text-ink-muted">
            Fitur ini tidak kamu minta. Centang yang ingin ikut dikerjakan; yang tidak dicentang
            masuk daftar yang tidak dikerjakan.
          </p>
        </div>
        {features.length === 0 ? (
          <p className="text-sm text-ink-muted">Tidak ada fitur rekomendasi.</p>
        ) : (
          features.map((feature) => (
            <label
              key={feature.id}
              className="flex cursor-pointer gap-3 rounded-control border border-line bg-surface p-3.5 text-sm has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input
                type="checkbox"
                name="recommended"
                value={feature.id}
                className="mt-1 size-4 accent-accent"
                checked={accepted.includes(feature.id)}
                onChange={() => toggle(feature.id)}
              />
              <span>
                <span className="font-mono text-xs text-ink-muted">{feature.id}</span>{' '}
                <strong>{feature.name}</strong>
                <span className="block text-ink-muted">{feature.reason}</span>
              </span>
            </label>
          ))
        )}
      </section>

      <StickyActionBar
        next="Review kritis"
        summary={
          <>
            <span className="font-semibold text-ink">
              {accepted.length} dari {features.length} fitur rekomendasi dipilih
            </span>
            {message && (
              <span
                className={`block ${failed ? 'text-high' : 'text-success'}`}
                role={failed ? 'alert' : 'status'}
              >
                {message}
              </span>
            )}
          </>
        }
      >
        <Button type="submit" disabled={saving} size="lg">
          {saving ? 'Menyimpan…' : 'Simpan pilihan fitur'}
        </Button>
      </StickyActionBar>
    </form>
  );
}
