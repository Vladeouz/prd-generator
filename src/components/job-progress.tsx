// Progres nyata job yang berjalan (FR-02, D-12): dari event `progress` `GET /api/jobs/{id}/stream`,
// bukan dari waktu. Teks yang berganti terus tidak diumumkan pembaca layar; status job diumumkan
// di banner.
import type { JobProgress } from '../jobs/progress.ts';
import { ProgressBar } from './ui/progress-bar.tsx';

const number = new Intl.NumberFormat('id-ID');

/** Detail fase tahap 7 yang berjalan bersamaan, misalnya "Fase selesai: 2 dari 5 (1 gagal) · ". */
function phasesText(progress: JobProgress | null): string {
  if (!progress?.phasesTotal) return '';
  const failed = progress.phasesFailed ? ` (${progress.phasesFailed} gagal)` : '';
  return `Fase selesai: ${progress.phasesDone ?? 0} dari ${progress.phasesTotal}${failed} · `;
}

/**
 * Keterangan progres, misalnya "Langkah 2 dari 2 · Fase selesai: 3 dari 5 · 12.345 karakter
 * diterima".
 */
export function progressSummary(progress: JobProgress | null): string {
  const step =
    (progress?.step && progress.totalSteps
      ? `Langkah ${progress.step} dari ${progress.totalSteps} · `
      : '') + phasesText(progress);
  if (!progress) return `${step}Menunggu Claude Code mulai menjawab…`;
  if (progress.chars > 0) return `${step}${number.format(progress.chars)} karakter diterima`;
  if (progress.thinkingTokens) {
    return `${step}Claude sedang berpikir (±${number.format(progress.thinkingTokens)} token) sebelum menulis…`;
  }
  return `${step}Menunggu Claude Code mulai menjawab…`;
}

/**
 * Bilah progres: bernilai bila jumlah langkah diketahui (tahap 7), selain itu tidak tentu. Di
 * langkah detail fase, fase yang sudah selesai atau gagal ikut mengisi langkah itu.
 */
export function stepFraction(progress: JobProgress | null): number | undefined {
  if (!progress?.step || !progress.totalSteps) return undefined;
  const phases = progress.phasesTotal
    ? ((progress.phasesDone ?? 0) + (progress.phasesFailed ?? 0)) / progress.phasesTotal
    : 0;
  return (progress.step - 1 + phases) / progress.totalSteps;
}

type Props = { label: string; progress: JobProgress | null };

export function JobProgressView({ label, progress }: Props) {
  const fraction = stepFraction(progress);
  return (
    <div className="flex flex-col gap-2.5" data-testid="job-progress">
      <p className="text-sm text-ink-secondary" data-testid="job-progress-summary">
        {progressSummary(progress)}
        {progress && progress.attempt > 1 && ` · percobaan ${progress.attempt}`}
      </p>
      <ProgressBar
        label={
          fraction === undefined
            ? `Progres ${label.toLowerCase()}`
            : `Langkah ${progress?.step} dari ${progress?.totalSteps}`
        }
        value={fraction}
      />
      {progress?.preview && (
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs text-ink-muted">Teks terakhir yang diterima</figcaption>
          <pre
            className="max-h-32 overflow-hidden whitespace-pre-wrap break-words rounded-control border border-line bg-canvas px-3 py-2 font-mono text-xs text-ink-secondary"
            data-testid="job-preview"
          >
            {progress.preview}
          </pre>
        </figure>
      )}
    </div>
  );
}
