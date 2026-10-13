'use client';
// Form jawaban pertanyaan klarifikasi (FR-03): pilih opsi, isi "Lainnya", atau lewati
// (memakai jawaban default). Default untuk topik tebakan diberi keterangan.
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
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
  /** Nama tahap berikutnya, disebut di pesan setelah jawaban tersimpan. */
  nextStageLabel: string;
};

export function QuestionForm({
  projectId,
  stage,
  questions,
  guessTopics,
  saved,
  nextStageLabel,
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
  const [saving, setSaving] = useState(false);

  const update = (id: string, patch: Partial<State>) =>
    setStates((current) => ({ ...current, [id]: { ...(current[id] as State), ...patch } }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage('');
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
        setMessage(`Jawaban tersimpan. Tahap berikutnya: ${nextStageLabel} — siap dijalankan.`);
        router.refresh();
      } else {
        setErrors(body.error?.details ?? {});
        setMessage(body.error?.message ?? 'Jawaban gagal disimpan.');
      }
    } catch {
      setMessage('Gagal menghubungi server. Coba lagi.');
    }
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="space-y-6" data-testid={`questions-${stage}`}>
      {questions.map((q, index) => {
        const state = states[q.id] as State;
        const name = `${stage}-${q.id}`;
        const defaultText = asList(q.recommended_default).join(', ');
        const guess = guessTopics.includes(q.topic);
        return (
          <fieldset key={q.id} className="rounded border border-slate-200 bg-white p-4">
            <legend className="px-1 font-medium">
              {index + 1}. {q.question}
            </legend>
            <p className="text-xs text-slate-500">{q.why_it_matters}</p>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex gap-2">
                <input
                  type="radio"
                  name={`${name}-mode`}
                  checked={state.mode === 'skip'}
                  onChange={() => update(q.id, { mode: 'skip' })}
                />
                <span>
                  Lewati, pakai default: <strong>{defaultText}</strong>
                  {guess && (
                    <span className="ml-1 text-amber-700" data-testid="guess-note">
                      (tebakan, ubah bila tidak sesuai)
                    </span>
                  )}
                </span>
              </label>
              {q.type === 'text' ? (
                <label className="block">
                  <span className="flex gap-2">
                    <input
                      type="radio"
                      name={`${name}-mode`}
                      checked={state.mode === 'option'}
                      onChange={() => update(q.id, { mode: 'option' })}
                    />
                    Jawab sendiri
                  </span>
                  <textarea
                    value={state.text}
                    onChange={(e) => update(q.id, { mode: 'option', text: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                  />
                </label>
              ) : (
                q.options.map((option) => {
                  const checked = state.mode === 'option' && state.selected.includes(option);
                  return (
                    <label key={option} className="flex gap-2">
                      <input
                        type={q.type === 'multi' ? 'checkbox' : 'radio'}
                        name={q.type === 'multi' ? `${name}-${option}` : `${name}-mode`}
                        checked={checked}
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
                      />
                      {option}
                    </label>
                  );
                })
              )}
              {q.type !== 'text' && (
                <label className="block">
                  <span className="flex gap-2">
                    <input
                      type="radio"
                      name={`${name}-mode`}
                      checked={state.mode === 'other'}
                      onChange={() => update(q.id, { mode: 'other' })}
                    />
                    Lainnya
                  </span>
                  {state.mode === 'other' && (
                    <input
                      value={state.other}
                      onChange={(e) => update(q.id, { other: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
                      placeholder="Tulis jawabanmu"
                    />
                  )}
                </label>
              )}
            </div>
            {errors[q.id] && <p className="mt-2 text-sm text-red-700">{errors[q.id]}</p>}
          </fieldset>
        );
      })}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : 'Simpan jawaban'}
        </button>
        {message && <p className="text-sm text-slate-700">{message}</p>}
      </div>
    </form>
  );
}
