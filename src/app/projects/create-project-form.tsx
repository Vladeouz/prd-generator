'use client';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
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
    <form onSubmit={submit} className="space-y-4 rounded border border-slate-200 bg-white p-6">
      <div>
        <label htmlFor="project-name" className="block text-sm font-medium">
          Nama proyek
        </label>
        <input
          id="project-name"
          name="name"
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
        {errors.name && <p className="mt-1 text-sm text-red-700">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor="project-idea" className="block text-sm font-medium">
          Ide proyek
        </label>
        <textarea
          id="project-idea"
          name="idea"
          required
          rows={5}
          maxLength={IDEA_MAX}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder="Contoh: Aplikasi membership untuk sebuah gym."
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
        <p className="mt-1 text-xs text-slate-500" id="idea-counter">
          {idea.length}/{IDEA_MAX} karakter
        </p>
        {errors.idea && <p className="mt-1 text-sm text-red-700">{errors.idea}</p>}
      </div>
      {errors.form && !errors.name && !errors.idea && (
        <p className="text-sm text-red-700">{errors.form}</p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Menyimpan…' : 'Buat proyek'}
      </button>
    </form>
  );
}
