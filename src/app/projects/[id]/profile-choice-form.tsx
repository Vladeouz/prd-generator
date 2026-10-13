'use client';
// Pilihan eksplisit saat stack yang paling cocok belum tersedia (FR-04): lanjut dengan stack yang
// tersedia plus mitigasi SEO, atau tunda. Tersimpan sebagai keputusan D-01.
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
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
    <form onSubmit={submit} className="mt-3 space-y-2 text-sm" data-testid="profile-choice">
      {CHOICES.map((value) => (
        <label key={value} className="flex gap-2">
          <input
            type="radio"
            name="profile-choice"
            checked={choice === value}
            onChange={() => setChoice(value)}
          />
          <span>
            <strong>{PROFILE_CHOICE_TEXT[value].label}</strong>
            <span className="block text-slate-600">{PROFILE_CHOICE_TEXT[value].consequence}</span>
          </span>
        </label>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : 'Simpan pilihan'}
        </button>
        {message && <p className="text-slate-700">{message}</p>}
      </div>
    </form>
  );
}
