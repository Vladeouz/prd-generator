import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

const CONTROL =
  'w-full rounded-control border border-line bg-canvas px-3.5 text-ink aria-invalid:border-high';

type Common = {
  id: string;
  label: string;
  /** Keterangan di bawah input, misalnya penghitung karakter. */
  hint?: ReactNode;
  error?: string;
};

type Props =
  | (Common & { multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
  | (Common & { multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>);

/** Label + input atau textarea + keterangan + pesan error yang terhubung lewat `aria-describedby`. */
export function Field(props: Props) {
  const { id, label, hint, error } = props;
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean);
  const aria = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described.length ? described.join(' ') : undefined,
  };

  let control: ReactNode;
  if (props.multiline) {
    const { id: _, label: _l, hint: _h, error: _e, multiline: _m, className, ...rest } = props;
    control = (
      <textarea
        id={id}
        className={`${CONTROL} resize-y py-3.5 ${className ?? ''}`}
        {...aria}
        {...rest}
      />
    );
  } else {
    const { id: _, label: _l, hint: _h, error: _e, multiline: _m, className, ...rest } = props;
    control = (
      <input id={id} className={`${CONTROL} h-11 ${className ?? ''}`} {...aria} {...rest} />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-muted">
        {label}
      </label>
      {control}
      {hint && (
        <div id={`${id}-hint`} className="text-[13px] text-ink-muted">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-high">
          {error}
        </p>
      )}
    </div>
  );
}
