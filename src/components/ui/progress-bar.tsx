type Props = {
  label: string;
  /** 0 sampai 1. Tanpa nilai: progres tidak tentu (misalnya job yang durasinya hanya perkiraan). */
  value?: number;
};

export function ProgressBar({ label, value }: Props) {
  const known = value !== undefined;
  const percent = known ? Math.round(Math.min(1, Math.max(0, value)) * 100) : undefined;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={known ? 0 : undefined}
      aria-valuemax={known ? 100 : undefined}
      aria-valuenow={percent}
      className="h-2 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className={`h-full rounded-full bg-accent ${known ? '' : 'w-1/3 animate-pulse'}`}
        style={known ? { width: `${percent}%` } : undefined}
      />
    </div>
  );
}
