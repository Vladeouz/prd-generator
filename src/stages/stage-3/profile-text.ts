// Teks pilihan stack untuk user dan keputusan D-01 (FR-04), tanpa istilah internal. Terpisah dari
// profile.ts agar bisa dipakai komponen klien tanpa membawa kode server.
import type { PROFILE_CHOICES } from '../../core/db/schema.ts';

export type ProfileChoice = (typeof PROFILE_CHOICES)[number];

/** Teks pilihan untuk user dan keputusan D-01; tanpa istilah internal. */
export const PROFILE_CHOICE_TEXT: Record<ProfileChoice, { label: string; consequence: string }> = {
  A: {
    label: 'Pakai stack yang tersedia',
    consequence:
      'Aplikasi dibuat dengan Flutter untuk web, Android, dan iOS dari satu codebase, dengan backend API terpisah.',
  },
  A_with_seo_mitigation: {
    label: 'Lanjut dengan stack yang tersedia, ditambah mitigasi SEO',
    consequence:
      'Website dibuat dengan Flutter web, yang kurang ramah SEO. PRD menambahkan mitigasi: judul dan meta tag per halaman, sitemap, dan halaman publik yang bisa di-prerender. Peringkat di Google tetap bisa lebih rendah daripada website yang dibuat khusus untuk SEO.',
  },
  postpone: {
    label: 'Tunda proyek sampai stack website yang ramah SEO tersedia',
    consequence:
      'Proyek berhenti di klarifikasi teknis. Struktur fitur, PRD, dan TASKS tidak dibuat sampai pilihan ini diubah.',
  },
};
