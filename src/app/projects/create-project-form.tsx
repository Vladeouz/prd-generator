'use client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Field } from '../../components/ui/field.tsx';
import { IDEA_MAX, NAME_MAX } from '../../projects/schema.ts';

type FieldErrors = { name?: string; idea?: string; form?: string };

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [idea, setIdea] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, idea }),
      });
      const body = await response.json();
      if (response.status === 201) {
        router.push(`/projects/${body.id}`);
        return;
      }
      const details = (body.error?.details ?? {}) as Record<string, string>;
      setErrors({ name: details.name, idea: details.idea, form: body.error?.message });
    } catch {
      setErrors({ form: 'Gagal menghubungi server. Coba lagi.' });
    }
    setSubmitting(false);
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Proyek baru"
      className="flex w-full max-w-[820px] flex-col gap-3.5 rounded-card border border-line bg-surface p-5 text-left"
    >
      <Field
        id="project-name"
        label="Nama proyek"
        name="name"
        required
        maxLength={NAME_MAX}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Misalnya: Membership gym"
        error={errors.name}
      />
      <Field
        multiline
        id="project-idea"
        label="Ide"
        name="idea"
        required
        rows={5}
        maxLength={IDEA_MAX}
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
        placeholder="Ceritakan idemu dengan bahasa sehari-hari. Contoh: aplikasi membership untuk sebuah gym, admin bisa memantau member yang masa aktifnya hampir habis."
        error={errors.idea}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-muted">
          <span className="font-mono" id="idea-counter" aria-live="polite">
            {idea.length}/{IDEA_MAX} karakter
          </span>
          <span aria-hidden="true">·</span>
          <span>Tanpa API key, memakai langganan Claude-mu</span>
        </div>
        <Button type="submit" disabled={submitting} size="lg">
          {submitting ? 'Menyimpan…' : 'Buat proyek'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </div>
      {errors.form && !errors.name && !errors.idea && (
        <p className="text-sm text-high" role="alert">
          {errors.form}
        </p>
      )}
    </form>
  );
}
