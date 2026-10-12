// Nama tahap untuk UI (Bahasa Indonesia), sesuai urutan alur 8 tahap.
import type { PROJECT_STAGES } from '../core/db/schema.ts';

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const STAGE_LABELS: Record<ProjectStage, string> = {
  stage2: 'Klarifikasi produk',
  stage3: 'Klarifikasi teknis',
  stage4: 'Struktur fitur',
  stage5: 'Review kritis',
  stage6: 'PRD',
  review2: 'Review kedua',
  stage7: 'TASKS',
  export: 'Export',
};
