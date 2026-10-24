// Jumlah percobaan per tahap (D-08: satu percobaan ulang dengan daftar error) dan jumlah pemanggilan
// detail fase tahap 7 yang serentak. Modul tanpa kode server, sehingga bisa dipakai komponen klien.
export const MAX_ATTEMPTS = 2;

/**
 * Jumlah pemanggilan 7b serentak di job tahap 7 (T-033, NFR-06): bawaan semua fase sekaligus.
 * Dipakai job tahap 7 dan perkiraan durasinya (`stageEstimate`).
 */
export const STAGE7B_CONCURRENCY = Number.POSITIVE_INFINITY;
