# Task UI/UX tambahan

Sisipkan dua task ini ke `docs/TASKS.md`, lalu sesuaikan dua dependensi:

- T-020 diletakkan tepat **sebelum T-010**, dan `depends_on` T-010 menjadi `T-009, T-020`.
- T-021 diletakkan tepat **sebelum T-017**, dan `depends_on` T-017 menjadi `T-016, T-021`.

---

- [ ] T-020 Fondasi desain: token, komponen dasar, dan tata letak
  - layer: app · depends_on: T-009 · refs: `docs/design/design.md`, NFR-03
  - files: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/**`, `src/app/page.tsx`, `src/app/projects/**`, `src/app/settings/**`, test terkait
  - done when: semua token warna, tipografi, radius, dan jarak di `docs/design/design.md` didefinisikan sebagai CSS custom property untuk mode gelap dan terang, dan komponen tidak memakai nilai warna mentah (dibuktikan dengan pencarian `#[0-9a-fA-F]{3,6}` di `src/components` dan `src/app` yang hanya menemukan `globals.css`); komponen dasar di `design.md` ada dengan test komponen; tombol tema berganti antara gelap dan terang dan pilihannya bertahan setelah dimuat ulang; beranda, halaman proyek (tahap 2 dan 3), dan pengaturan dibangun ulang dengan komponen dan tata letak `design.md`, mengikuti `docs/design/mockups/Main.dc.html` dan `Questions.dc.html`; `StickyActionBar` menyebut tahap berikutnya di samping tombol simpan; test komponen dan integration test yang sudah ada tetap lulus; **(manual)** user membandingkan beranda dan layar tahap 2 di Chrome dengan mockup dalam kedua tema, dan memastikan tampilan di lebar 390 px tetap terbaca tanpa geser ke samping; `pnpm check` hijau

- [ ] T-021 Penyempurnaan UI/UX dan aksesibilitas
  - layer: app · depends_on: T-016 · refs: `docs/design/design.md`
  - files: `src/components/**`, `src/app/**`, test terkait
  - done when: layar review kritis dan PRD mengikuti `docs/design/mockups/Review.dc.html` dan `Prd.dc.html`; setiap layar punya keadaan kosong, memuat, dan error yang jelas dalam Bahasa Indonesia; semua elemen interaktif bisa dipakai dengan keyboard dan punya fokus yang terlihat; kontras teks memenuhi `design.md` di kedua tema (diperiksa dengan alat pemeriksa kontras dan hasilnya dicatat di log); **(manual)** user menjalankan satu proyek dari beranda sampai ekspor dengan runner palsu (`CLAUDE_COMMAND`) di kedua tema dan lebar 390 px, lalu mengonfirmasi tampilannya; `pnpm check` hijau
