'use client';
// Tulis PRD dan TASKS ke folder proyek turunan template (FR-09). Path tujuan diketik user; aplikasi
// tidak pernah membentuknya dari output AI (NFR-01).
import { type FormEvent, useState } from 'react';
import { Button } from '../../../components/ui/button.tsx';
import { Field } from '../../../components/ui/field.tsx';

export function ExportForm({ projectId }: { projectId: string }) {
  const [targetDir, setTargetDir] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [written, setWritten] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setWritten([]);
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetDir, overwrite }),
      });
      const body = await response.json();
      if (response.ok) {
        setWritten(body.written);
        setConflict(false);
      } else {
        setConflict(response.status === 409 && body.error?.details?.targetDir !== undefined);
        setError(
          body.error?.details?.targetDir && response.status === 422
            ? body.error.details.targetDir
            : (body.error?.message ?? 'Ekspor gagal.'),
        );
      }
    } catch {
      setError('Gagal menghubungi server. Coba lagi.');
    }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" data-testid="export-form">
      <Field
        id="export-target"
        label="Folder proyek"
        value={targetDir}
        onChange={(e) => setTargetDir(e.target.value)}
        placeholder="D:\dev\nama-proyek"
        hint="Path absolut folder proyek yang dibuat dengan pnpm init-project. Hanya docs/PRD.md dan docs/TASKS.md yang ditulis."
        error={error || undefined}
      />
      {conflict && (
        <label className="flex items-center gap-2.5 text-sm" data-testid="export-overwrite">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          Timpa docs/PRD.md yang sudah diisi
        </label>
      )}
      <div>
        <Button type="submit" disabled={saving || targetDir.trim() === ''}>
          {saving ? 'Menulis…' : 'Tulis ke folder proyek'}
        </Button>
      </div>
      {written.length > 0 && (
        <div className="text-sm" role="status" data-testid="export-written">
          <p className="text-success">Berhasil ditulis:</p>
          <ul className="mt-1 flex flex-col gap-1 font-mono text-[13px] text-ink-secondary">
            {written.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
