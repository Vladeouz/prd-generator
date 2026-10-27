# Desain UI — PRD Generator

Sumber: kanvas "PRD Generator — Mockup UI" yang disetujui user (2026-10-13). Markup keempat layar ada di `docs/design/mockups/` sebagai rujukan tata letak dan isi. File itu memakai format kanvas desain (`{{...}}`, `<sc-for>`), jadi dibaca, bukan dijalankan.

## Arah

Struktur dasar: tema gelap sebagai bawaan, satu warna aksen, komposer ide di tengah, jawaban berupa chip dengan "Lainnya" dan "Lewati", dan pembaca PRD dengan daftar isi.

Identitas dan isi khas aplikasi ini:

- grafit gelap dengan aksen biru, ditambah mode terang;
- Plus Jakarta Sans untuk teks dan JetBrains Mono untuk ID (`FR-01`, `RV-03`, `T-007`), angka token, dan durasi;
- stepper 8 tahap vertikal di samping, dengan status dan token per tahap;
- layar khas aplikasi ini: kartu temuan review dengan keputusan, buku keputusan, banner progres job, dan pemakaian token.

## Token

Semua warna, radius, dan jarak didefinisikan sebagai CSS custom property di `src/app/globals.css` dan dipetakan ke tema Tailwind. Komponen tidak boleh memakai nilai warna mentah.

### Warna — mode gelap (bawaan)

| Token | Nilai | Pemakaian |
| --- | --- | --- |
| `--bg` | `#0E1013` | Latar halaman, input |
| `--surface` | `#161A1F` | Kartu, panel |
| `--surface-raised` | `#1C2128` | Bilah aksi sticky |
| `--border` | `#2A3038` | Garis input, chip, kartu aktif |
| `--border-subtle` | `#22272E` | Garis kartu dan pemisah |
| `--text` | `#ECEEF1` | Teks utama |
| `--text-secondary` | `#C9CED6` | Isi dokumen, opsi |
| `--text-muted` | `#A3ABB6` | Keterangan |
| `--text-faint` | `#7D8794` | Placeholder, tahap terkunci |
| `--accent` | `#7C9CFF` | Tombol utama, chip terpilih, tahap aktif, ID |
| `--accent-soft` | `#7C9CFF` alfa 12% | Latar chip terpilih dan baris aktif |
| `--accent-line` | `#7C9CFF` alfa 33% | Garis elemen aktif |
| `--on-accent` | `#0B1430` | Teks di atas tombol aksen |
| `--success` | `#4ADE80` | Status selesai, template valid |
| `--severity-high` | `#FF8A65` | Temuan tinggi |
| `--severity-medium` | `#F5C451` | Temuan sedang, tebakan, menunggu pilihan |
| `--severity-low` | `#8AB4F8` | Temuan rendah |

Label status dan keparahan memakai warnanya sebagai teks di atas latar warna yang sama dengan alfa 14%.

### Warna — mode terang

Diturunkan dengan prinsip yang sama: latar `#F7F8FA`, surface `#FFFFFF`, garis `#D7DCE3`, teks `#14171C`, teks keterangan `#5B6472`, aksen `#3858D3` dengan teks putih (semula `#3D5FD9`, digelapkan di T-021 agar teks aksen di atas latar aksen 12% tetap 4.5:1). Warna keparahan digelapkan sampai kontras teks 4.5:1 di atas latar terangnya. Pilihan tema disimpan di `localStorage`; bawaannya mengikuti `prefers-color-scheme`.

### Tipografi

| Peran | Font | Ukuran / berat |
| --- | --- | --- |
| Judul beranda | Plus Jakarta Sans | 52 px / 800, letter-spacing −0.025em |
| Judul halaman tahap | Plus Jakarta Sans | 34 px / 800 |
| Judul kartu dan pertanyaan | Plus Jakarta Sans | 18 px / 700 |
| Teks | Plus Jakarta Sans | 15 px / 400, line-height 1.55 |
| Keterangan | Plus Jakarta Sans | 13–14 px |
| Label bagian | Plus Jakarta Sans | 12–14 px / 700, huruf besar, letter-spacing 0.06em |
| ID, token, durasi, path | JetBrains Mono | 12–13 px / 400–600 |

Font dimuat dengan `next/font/google`.

### Bentuk dan jarak

- Radius: 10–12 px untuk tombol, input, dan chip; 16 px untuk panel; 18–20 px untuk kartu utama dan komposer; penuh untuk badge.
- Jarak berbasis 4 px; antarkartu 16–20 px; padding kartu 18–22 px.
- Target sentuh minimal 44 px.

## Komponen dasar

Di `src/components/ui/`, masing-masing dengan test komponen: `Button` (utama, sekunder, teks), `Chip` (opsi tunggal dan ganda; input radio atau checkbox asli yang disembunyikan secara visual di dalam `<label>` bergaya chip, sehingga status terpilih lewat `checked` dan navigasi keyboard mengikuti perilaku bawaan form), `Badge` (status dan keparahan), `Card`, `Field` (label + input atau textarea + error), `ProgressBar`, `Stepper` (8 tahap: selesai, aktif, terkunci, gagal, berjalan; token per tahap), `StickyActionBar` (ringkasan di kiri, "Berikutnya: …" dan tombol di kanan), `AppHeader` (logo, breadcrumb proyek, total token, status template, tombol tema).

## Tata letak

- Halaman proyek: tiga kolom `Stepper` (260–300 px), konten (fleksibel, minimal 560 px), panel samping (280–320 px). Di layar sempit kolom menumpuk berurutan: konten, stepper, panel.
- Setiap layar tahap diakhiri `StickyActionBar` yang menyebut tahap berikutnya tepat di samping tombol utama.
- Pembaca PRD: daftar isi (220–260 px), dokumen (maksimal 760 px), panel pemakaian dan ekspor.

## Layar

| Layar | Mockup | Isi wajib |
| --- | --- | --- |
| Beranda | `mockups/Main.dc.html` | Komposer (nama, ide, penghitung 0/4000), tiga langkah cara kerja, daftar proyek dengan badge tahap dan token |
| Tahap pertanyaan (2 dan 3) | `mockups/Questions.dc.html` | Meter kejelasan ide, kartu pertanyaan dengan chip, "+ Lainnya", "Lewati", label tebakan, default bila dilewati, panel asumsi dan catatan teknis |
| Review kritis (5 dan review kedua) | `mockups/Review.dc.html` | Ringkasan keparahan, kartu temuan dengan bukti dan pilihan berupa radio beserta konsekuensi, label rekomendasi, buku keputusan |
| PRD, TASKS, ekspor (6–8) | `mockups/Prd.dc.html` | Banner progres job, daftar isi, dokumen, tabel keputusan bertanda "disusun aplikasi", pemakaian token per tahap, form ekspor |

Tahap 4 (struktur fitur) belum punya mockup. Ikuti pola yang sama: fitur MVP sebagai kartu per fase dengan label dependensi, dan fitur rekomendasi sebagai daftar centang yang kosong secara bawaan.

## Aksesibilitas

- Kontras teks minimal 4.5:1, dan 3:1 untuk teks 24 px ke atas, di kedua tema.
- Elemen interaktif memakai `<button>`, `<a>`, `<input>` dengan `<label>`; tombol ikon punya `aria-label`.
- Status tidak dibedakan oleh warna saja: selalu ada teks atau ikon.
- Fokus keyboard terlihat jelas (cincin aksen 2 px).
