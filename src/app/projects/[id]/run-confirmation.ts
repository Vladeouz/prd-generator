// Teks konfirmasi sebelum tahap 6 atau 7 dijalankan (FR-10): perkiraan durasi dan token dari
// rata-rata pemanggilan sebelumnya, atau angka uji bila belum ada. Tanpa kode server, karena
// dipakai komponen klien.
import type { StageEstimate } from '../../../projects/usage.ts';
import { formatApproxTokens } from '../format.ts';

const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

/**
 * `per`: satuan perkiraan. Tahap 6 satu pemanggilan ("per percobaan"); tahap 7 satu job berisi
 * daftar task dan detail semua fase (D-11), yang percobaan ulangnya hanya mengulang satu langkah.
 */
export function confirmationText(
  label: string,
  estimate: StageEstimate,
  per: 'percobaan' | 'tahap 7' = 'percobaan',
): string {
  const basis =
    estimate.basis === 'average'
      ? `rata-rata ${estimate.samples} pemanggilan sebelumnya`
      : 'angka awal, karena belum ada pemanggilan sebelumnya';
  const amount = `sekitar ${minutes(estimate.durationMs)} menit, ${formatApproxTokens(estimate.inputTokens)} token input dan ${formatApproxTokens(estimate.outputTokens)} token output`;
  return per === 'tahap 7'
    ? `${label} memakai kuota langganan Claude: ${amount} untuk daftar task dan detail semua fase (${basis}). Langkah yang ditolak validator dicoba ulang sekali, jadi bisa lebih lama. Lanjutkan?`
    : `${label} memakai kuota langganan Claude: ${amount} per percobaan (${basis}). Bila output ditolak validator, dicoba ulang sekali sehingga bisa dua kali lipat. Lanjutkan?`;
}

/**
 * Perkiraan untuk tombol dan banner job berjalan, dari angka yang sama dengan konfirmasi: teks durasi,
 * durasi untuk bilah progres, dan token output per percobaan.
 */
export function bannerEstimate(estimate: StageEstimate | undefined) {
  if (!estimate) return {};
  return {
    estimate: `sekitar ${minutes(estimate.durationMs)} menit`,
    estimateMs: estimate.durationMs,
    estimateTokens: `${formatApproxTokens(estimate.outputTokens)} token output`,
  };
}
