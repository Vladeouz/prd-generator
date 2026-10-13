'use client';
// Form jawaban pertanyaan klarifikasi (FR-03): pilih opsi, isi "Lainnya", atau lewati
// (memakai jawaban default). Default untuk topik tebakan diberi keterangan.
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Chip } from '../../../components/ui/chip.tsx';
import { StickyActionBar } from '../../../components/ui/sticky-action-bar.tsx';
import type { AnswerValue, StoredAnswer } from '../../../stages/answers.ts';
import type { Question } from '../../../stages/questions.ts';

type Mode = 'skip' | 'option' | 'other';
type State = { mode: Mode; selected: string[]; other: string; text: string };

const asList = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

function initialState(question: Question, saved: StoredAnswer | undefined): State {
  const empty: State = { mode: 'skip', selected: [], other: '', text: '' };
  if (saved?.source !== 'user') return empty;
  if (question.type === 'text')
    return { ...empty, mode: 'option', text: asList(saved.value)[0] ?? '' };
  const values = asList(saved.value);
  return values.every((value) => question.options.includes(value))
    ? { ...empty, mode: 'option', selected: values }
    : { ...empty, mode: 'other', other: values.join(', ') };
}

function toValue(question: Question, state: State): AnswerValue {
  if (state.mode === 'skip') return null;
  if (state.mode === 'other') return { lainnya: state.other };
  if (question.type === 'text') return state.text;
  if (question.type === 'single') return state.selected[0] ?? '';
  return state.selected;
}

type Props = {
  projectId: string;
  stage: string;
  questions: Question[];
  guessTopics: readonly string[];
  saved: StoredAnswer[];
  /** Pesan setelah jawaban tersimpan, misalnya tahap berikutnya. */
  savedMessage: string;
  /** Nama tahap berikutnya, ditulis di samping tombol simpan. */
  nextStage: string;
};

export function QuestionForm({
  projectId,
  stage,
  questions,
  guessTopics,
  saved,
  savedMessage,
  nextStage,
}: Props) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, State>>(() =>
    Object.fromEntries(
      questions.map((q) => [
        q.id,
        initialState(
          q,
          saved.find((a) => a.questionId === q.id),
        ),
      ]),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (id: string, patch: Partial<State>) =>
    setStates((current) => ({ ...current, [id]: { ...(current[id] as State), ...patch } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/answers/${stage}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          answers: questions.map((q) => ({
            questionId: q.id,
            value: toValue(q, states[q.id] as State),
          })),
        }),
      });
      const body = await response.json();
      if (response.ok) {
        setMessage(savedMessage);
        router.refresh();
      } else {
        setErrors(body.error?.details ?? {});
        setMessage(body.error?.message ?? 'Jawaban gagal disimpan.');
        setFailed(true);
      }
    } catch {
      setMessage('Gagal menghubungi server. Coba lagi.');
      setFailed(true);
    }
    setSaving(false);
  }

  const skipped = questions.filter((q) => (states[q.id] as State).mode === 'skip').length;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" data-testid={`questions-${stage}`}>
      {questions.map((q, index) => {
        const state = states[q.id] as State;
        const name = `${stage}-${q.id}`;
        const defaultText = asList(q.recommended_default).join(', ');
        const guess = guessTopics.includes(q.topic);
        return (
          <Card
            key={q.id}
            size="main"
            role="group"
            aria-labelledby={`${name}-question`}
            className="flex flex-col gap-3.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-muted">
                    Q{index + 1} · {q.topic.replaceAll('_', ' ')}
                  </span>
                  {guess && (
                    <Badge tone="medium" size="sm" data-testid="guess-note">
                      Default berupa tebakan
                    </Badge>
                  )}
                </div>
                <h3 id={`${name}-question`} className="text-lg leading-[1.4] font-bold">
                  {q.question}
                </h3>
                <p className="text-[13px] text-ink-muted">{q.why_it_matters}</p>
              </div>
              <Chip
                kind="single"
                look="outline"
                name={`${name}-mode`}
                checked={state.mode === 'skip'}
                onChange={() => update(q.id, { mode: 'skip', selected: [] })}
                aria-label={`Lewati, pakai default: ${defaultText}`}
              >
                Lewati
              </Chip>
            </div>

            {q.type === 'text' ? (
              <div className="flex flex-col gap-2">
                <Chip
                  kind="single"
                  name={`${name}-mode`}
                  checked={state.mode === 'option'}
                  onChange={() => update(q.id, { mode: 'option' })}
                  className="self-start"
                >
                  Jawab sendiri
                </Chip>
                <textarea
                  value={state.text}
                  onChange={(e) => update(q.id, { mode: 'option', text: e.target.value })}
                  rows={2}
                  aria-label={`Jawabanmu untuk: ${q.question}`}
                  className="w-full rounded-control border border-line bg-canvas px-3.5 py-2.5"
                />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2.5">
                {q.options.map((option) => (
                  <Chip
                    key={option}
                    kind={q.type === 'multi' ? 'multi' : 'single'}
                    name={q.type === 'multi' ? `${name}-${option}` : `${name}-mode`}
                    checked={state.mode === 'option' && state.selected.includes(option)}
                    onChange={() => {
                      if (q.type === 'single') {
                        update(q.id, { mode: 'option', selected: [option] });
                        return;
                      }
                      const base = state.mode === 'option' ? state.selected : [];
                      const selected = base.includes(option)
                        ? base.filter((value) => value !== option)
                        : [...base, option];
                      update(q.id, { mode: selected.length ? 'option' : 'skip', selected });
                    }}
                  >
                    {option}
                  </Chip>
                ))}
                <Chip
                  kind="single"
                  look="dashed"
                  name={`${name}-mode`}
                  checked={state.mode === 'other'}
                  onChange={() => update(q.id, { mode: 'other', selected: [] })}
                >
                  + Lainnya
                </Chip>
              </div>
            )}
            {state.mode === 'other' && (
              <input
                value={state.other}
                onChange={(e) => update(q.id, { other: e.target.value })}
                aria-label={`Jawaban lain untuk: ${q.question}`}
                className="h-11 w-full rounded-control border border-line bg-canvas px-3.5"
                placeholder="Tulis jawabanmu"
              />
            )}

            <p className="text-[13px] text-ink-muted">
              Default bila dilewati: <span className="text-ink">{defaultText}</span>
            </p>
            {q.default_reason && (
              <p className="text-[13px] text-ink-muted" data-testid="default-reason">
                Alasan default: {q.default_reason}
              </p>
            )}
            {errors[q.id] && <p className="text-sm text-high">{errors[q.id]}</p>}
          </Card>
        );
      })}

      <StickyActionBar
        next={nextStage}
        summary={
          <>
            <span className="font-semibold text-ink">
              {questions.length - skipped} dari {questions.length} dijawab
            </span>
            {skipped > 0 && ` · ${skipped} dilewati, pakai default`}
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
          {saving ? 'Menyimpan…' : 'Simpan jawaban'}
        </Button>
      </StickyActionBar>
    </form>
  );
}
