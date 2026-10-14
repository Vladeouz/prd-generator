'use client';
// Keputusan atas temuan review kritis (FR-06): setiap temuan punya 2–3 opsi dengan konsekuensinya,
// dan rekomendasi sudah terpilih. Tersimpan sebagai keputusan RV-xx.
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { StickyActionBar } from '../../../components/ui/sticky-action-bar.tsx';
import { CATEGORY_TEXT, SEVERITY_TEXT } from '../../../stages/stage-5/review-text.ts';
import type { Finding } from '../../../stages/stage-5/validate.ts';

type Props = {
  projectId: string;
  findings: Finding[];
  /** Opsi tersimpan per kode temuan; temuan tanpa pilihan tersimpan memakai rekomendasi. */
  saved: Record<string, string>;
  savedMessage: string;
};

export function DecisionForm({ projectId, findings, saved, savedMessage }: Props) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      findings.map((f) => {
        const label = saved[f.id];
        const valid = label !== undefined && f.options.some((o) => o.label === label);
        return [f.id, valid ? label : f.recommended_option];
      }),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/decisions/review1`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          choices: findings.map((f) => ({ findingId: f.id, option: chosen[f.id] })),
        }),
      });
      const body = await response.json();
      if (response.ok) {
        setMessage(savedMessage);
        router.refresh();
      } else {
        setErrors(body.error?.details ?? {});
        setMessage(body.error?.message ?? 'Keputusan gagal disimpan.');
        setFailed(true);
      }
    } catch {
      setMessage('Gagal menghubungi server. Coba lagi.');
      setFailed(true);
    }
    setSaving(false);
  }

  const changed = findings.filter((f) => chosen[f.id] !== f.recommended_option).length;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-testid="decisions-review1">
      {findings.map((f) => (
        <Card
          key={f.id}
          as="article"
          size="main"
          aria-labelledby={`${f.id}-finding`}
          className="flex flex-col gap-3.5"
          data-testid={`finding-${f.id}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-muted">{f.id}</span>
            <Badge tone={f.severity} size="sm">
              {SEVERITY_TEXT[f.severity]}
            </Badge>
            <Badge size="sm">{CATEGORY_TEXT[f.category] ?? f.category}</Badge>
          </div>
          <h3 id={`${f.id}-finding`} className="text-[17px] leading-[1.45] font-bold">
            {f.finding}
          </h3>
          <div className="rounded-control border border-line-subtle bg-canvas px-3.5 py-3 text-[13px]">
            <span className="font-semibold text-ink-muted">Bukti</span>
            <p className="mt-1 text-ink-secondary">{f.evidence}</p>
          </div>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-[13px] font-semibold text-ink-muted">Keputusanmu</legend>
            {f.options.map((option) => (
              <label
                key={option.label}
                className="flex cursor-pointer gap-3 rounded-control border border-line bg-canvas p-3.5 text-sm has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name={`decision-${f.id}`}
                  value={option.label}
                  className="mt-1 size-4 accent-accent"
                  checked={chosen[f.id] === option.label}
                  onChange={() => setChosen((current) => ({ ...current, [f.id]: option.label }))}
                />
                <span className="flex flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{option.label}</strong>
                    {option.label === f.recommended_option && (
                      <Badge tone="accent" size="sm">
                        Rekomendasi
                      </Badge>
                    )}
                  </span>
                  <span className="text-ink-muted">{option.consequence}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {errors[f.id] && <p className="text-sm text-high">{errors[f.id]}</p>}
        </Card>
      ))}

      <StickyActionBar
        next="PRD"
        summary={
          <>
            <span className="font-semibold text-ink">{findings.length} temuan diputuskan</span>
            {changed > 0 && ` · ${changed} berbeda dari rekomendasi`}
            <span className="block">Menjadi bagian Assumptions &amp; Decisions di PRD.</span>
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
          {saving ? 'Menyimpan…' : 'Simpan keputusan'}
        </Button>
      </StickyActionBar>
    </form>
  );
}
