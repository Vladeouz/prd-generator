'use client';
// Keputusan atas temuan review (FR-06, FR-07): setiap temuan punya 2–3 opsi dengan konsekuensinya,
// dan rekomendasi sudah terpilih. Tersimpan sebagai keputusan RV-xx (review kritis) atau RV2-xx
// (review kedua; opsi `changes_prd` membuat PRD ditulis ulang).
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { ConfirmPanel } from '../../../components/ui/confirm-panel.tsx';
import { EmptyState } from '../../../components/ui/states.tsx';
import { StickyActionBar } from '../../../components/ui/sticky-action-bar.tsx';
import { CATEGORY_TEXT, SEVERITY_TEXT } from '../../../stages/stage-5/review-text.ts';
import type { Finding } from '../../../stages/stage-5/validate.ts';

type DecisionFinding = Omit<Finding, 'category' | 'options'> & {
  category: string;
  options: { label: string; consequence: string; changes_prd?: boolean }[];
};

type Props = {
  projectId: string;
  origin: 'review1' | 'review2';
  findings: DecisionFinding[];
  /** Nama tahap berikutnya di samping tombol simpan, boleh dengan perkiraan durasinya. */
  next: string;
  /** Pesan bila keputusan membuat PRD ditulis ulang. */
  regenerateMessage?: string;
  /** Konfirmasi sebelum menyimpan keputusan yang membuat PRD ditulis ulang (FR-10). */
  regenerateConfirmation?: string;
  /** Opsi tersimpan per kode temuan; temuan tanpa pilihan tersimpan memakai rekomendasi. */
  saved: Record<string, string>;
  savedMessage: string;
};

export function DecisionForm({
  projectId,
  origin,
  findings,
  next,
  regenerateMessage,
  regenerateConfirmation,
  saved,
  savedMessage,
}: Props) {
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
  const [confirming, setConfirming] = useState(false);
  const submitButton = useRef<HTMLButtonElement>(null);

  function cancel() {
    setConfirming(false);
    requestAnimationFrame(() => submitButton.current?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (fixes > 0 && regenerateConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSaving(true);
    setErrors({});
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/decisions/${origin}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          choices: findings.map((f) => ({ findingId: f.id, option: chosen[f.id] })),
        }),
      });
      const body = await response.json();
      if (response.ok) {
        setMessage(body.regenerate && regenerateMessage ? regenerateMessage : savedMessage);
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
  const fixes = findings.filter((f) =>
    f.options.some((o) => o.label === chosen[f.id] && o.changes_prd === true),
  ).length;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-testid={`decisions-${origin}`}>
      {findings.length === 0 && (
        <EmptyState title="Tidak ada temuan" data-testid="no-findings">
          Review tidak menemukan masalah. Simpan untuk melanjutkan ke {next}.
        </EmptyState>
      )}
      {findings.map((f) => (
        <Card
          key={f.id}
          as="article"
          size="main"
          aria-labelledby={`${f.id}-finding`}
          className="flex flex-col gap-3.5"
          data-testid={`finding-${f.id}`}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[13px] font-semibold">{f.id}</span>
            <Badge tone={f.severity} size="sm">
              {SEVERITY_TEXT[f.severity]}
            </Badge>
            <span className="font-mono text-xs text-ink-muted">
              {CATEGORY_TEXT[f.category] ?? f.category}
            </span>
          </div>
          <h3 id={`${f.id}-finding`} className="text-lg leading-[1.4] font-bold">
            {f.finding}
          </h3>
          <div className="flex flex-col gap-1 rounded-control border border-line-subtle bg-canvas px-3.5 py-3">
            <span className="text-xs font-bold tracking-[0.06em] text-ink-muted uppercase">
              Bukti
            </span>
            <p className="font-mono text-[13px] break-words text-ink-secondary">{f.evidence}</p>
          </div>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-sm font-semibold">Keputusanmu</legend>
            {f.options.map((option) => (
              <label
                key={option.label}
                className="flex cursor-pointer gap-3 rounded-control border-[1.5px] border-line bg-canvas p-3.5 text-sm has-checked:border-accent has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-accent"
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
                    {option.changes_prd && (
                      <Badge tone="medium" size="sm">
                        Mengubah PRD
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

      {confirming && regenerateConfirmation && (
        <ConfirmPanel
          confirmLabel="Ya, simpan dan tulis ulang PRD"
          confirmType="submit"
          onCancel={cancel}
          data-testid="regenerate-confirmation"
        >
          {regenerateConfirmation}
        </ConfirmPanel>
      )}
      <StickyActionBar
        next={next}
        summary={
          <>
            <span className="font-semibold text-ink">{findings.length} temuan diputuskan</span>
            {changed > 0 && ` · ${changed} berbeda dari rekomendasi`}
            <span className="block">Menjadi bagian Assumptions &amp; Decisions di PRD.</span>
            {origin === 'review2' && fixes > 0 && (
              <span className="block" data-testid="regenerate-note">
                {fixes} perbaikan dipilih: PRD ditulis ulang sekali (sekitar 5–10 menit).
              </span>
            )}
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
        <Button ref={submitButton} type="submit" disabled={saving} size="lg">
          {saving ? 'Menyimpan…' : 'Simpan keputusan'}
        </Button>
      </StickyActionBar>
    </form>
  );
}
