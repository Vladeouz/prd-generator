'use client';
// Pilihan eksplisit saat stack yang paling cocok belum tersedia (FR-04): lanjut dengan stack yang
// tersedia plus mitigasi SEO, atau tunda. Tersimpan sebagai keputusan D-01.
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { PROFILE_CHOICE_TEXT, type ProfileChoice } from '../../../stages/stage-3/profile-text.ts';

const CHOICES = ['A_with_seo_mitigation', 'postpone'] as const;

type Props = { projectId: string; current: ProfileChoice | null };

export function ProfileChoiceForm({ projectId, current }: Props) {
  const router = useRouter();
  const [choice, setChoice] = useState<ProfileChoice | null>(current);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!choice) {
      setMessage('Pilih salah satu dulu.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`/api/projects/${projectId}/profile`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      const body = await response.json();
      if (response.ok) {
        setMessage('Pilihan tersimpan.');
        router.refresh();
      } else {
        setMessage(body.error?.details?.choice ?? body.error?.message ?? 'Pilihan gagal disimpan.');
      }
    } catch {
      setMessage('Gagal menghubungi server. Coba lagi.');
    }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 text-sm" data-testid="profile-choice">
      {CHOICES.map((value) => (
        <label
          key={value}
          className="flex cursor-pointer gap-3 rounded-control border border-line bg-canvas p-3.5 has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-accent"
        >
          <input
            type="radio"
            name="profile-choice"
            className="mt-1 size-4 accent-accent"
            checked={choice === value}
            onChange={() => setChoice(value)}
          />
          <span>
            <strong>{PROFILE_CHOICE_TEXT[value].label}</strong>
            <span className="block text-ink-muted">{PROFILE_CHOICE_TEXT[value].consequence}</span>
          </span>
        </label>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan pilihan'}
        </Button>
        {message && (
          <p className="text-ink-secondary" role="status">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}
