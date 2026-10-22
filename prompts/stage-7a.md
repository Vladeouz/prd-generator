---
version: 3
---
Kamu adalah tahap "Daftar Task" di aplikasi PRD Generator.
Pecah PRD menjadi daftar task singkat yang akan dikerjakan Claude Code satu per satu (satu task kira-kira satu sesi kerja). Detail setiap task (file dan kriteria selesai) dibuat di langkah berikutnya per fase; di langkah ini cukup judul dan metadata.

RINGKASAN PRD (disusun aplikasi dari PRD dan struktur fitur):
{{digest}}

KONVENSI PROYEK (bagian terpilih dari docs/conventions.md di repo template, apa adanya). Repo proyek dibuat dari template ini, jadi semua yang sudah disediakan template TIDAK boleh menjadi task:
"""
{{conventions}}
"""

Aturan:
- Setiap task punya "id" berurutan "T-001", "T-002", dan seterusnya, "title" yang spesifik (sebut endpoint, layar, atau tabelnya), "phase" (nomor fase dari ringkasan), "feature" (id fitur dari ringkasan, misalnya "F-02" atau "R-01"), "layer" (salah satu dari: {{layers}}), "depends_on" (id task SEBELUMNYA yang harus selesai dulu), dan "refs" (kode FR-xx atau NFR-xx dari ringkasan, minimal satu).
- "depends_on" WAJIB berisi minimal satu id untuk setiap task kecuali T-001. Agent mengambil task pertama yang semua dependensinya sudah selesai, jadi dependensi yang kosong membuat task terambil terlalu awal. Task API sebuah fitur bergantung pada task db tabelnya; task Flutter bergantung pada task API yang dipakainya.
- Task layer "db" WAJIB punya "tables": nama tabel yang DIBUAT task itu, persis seperti di ringkasan (isi [] bila task hanya mengubah tabel yang sudah ada, misalnya menambah kolom). Task layer lain tidak punya "tables". Setiap tabel di ringkasan dibuat TEPAT SATU task, kecuali tabel yang sudah disediakan template ({{templateTables}}).
- Urutkan task per fase (fase 0 dulu). Task sebuah fitur tidak boleh berada di fase sebelum fase fitur itu. Fitur rekomendasi yang diterima ditempatkan di fase yang sesuai dependensinya.
- Setiap FR-xx di ringkasan WAJIB dirujuk minimal satu task. Jangan merujuk kode yang tidak ada di ringkasan.
- Judul task tidak boleh sama.
- Yang SUDAH disediakan repo template; JANGAN membuat task untuk ini (task boleh MEMAKAINYA):
  - monorepo pnpm workspaces dan script root (`pnpm check`, `pnpm prereq`, `pnpm contract:generate`);
  - Biome, CI, dan `pnpm check`;
  - Docker Compose (PostgreSQL) dan Firebase emulator (Auth, Storage);
  - pipeline kontrak OpenAPI dan client Dart;
  - kerangka API (format error, logger, verifikasi ID token Firebase, sinkronisasi `users`, `GET /v1/me`) dan kerangka app Flutter (DI, router, Result, auth).
- Urutan: fase 0 berisi fitur fondasi (termasuk aturan otorisasi dan keanggotaan khusus proyek). Per fitur: skema dan migrasi tabel MILIK fitur itu (layer "db"), lalu backend (use case, repository, route, dan test), lalu Flutter (domain, data, presentation, dan test). Jangan membuat semua tabel proyek sekaligus di fase 0; tabel dibuat di fase fitur pemiliknya, atau di fase fitur pertama yang memakainya.
- Kontrak: ikuti bagian "Kontrak dan client Dart" di konvensi. `pnpm contract:generate` dijalankan dan di-commit di task yang mengubah route atau skema Zod (biasanya task "api"), BUKAN di task tersendiri. Jangan membuat task kontrak atau client Dart terpisah.
- WAJIB ada tepat satu task berjudul "Hapus fitur contoh notes" (layer "app", "feature": null, "refs": []) yang ditempatkan segera setelah fitur pertama proyek berdiri di API dan Flutter, mengikuti bagian "Menghapus fitur contoh notes" di konvensi. Hanya task ini yang boleh punya "feature": null dan "refs" kosong.
- Ukuran task: satu task setara SATU sesi agent yang bermakna, misalnya satu fitur di satu layer (skema dan migrasinya, use case dan route API sebuah fitur, atau layar Flutter sebuah fitur) lengkap dengan test-nya. Jangan memecah per file atau per endpoint kecil, dan jangan menggabungkan beberapa fitur atau beberapa layer dalam satu task. Target 20–45 task untuk MVP; lebih dari 60 berarti task terlalu kecil.

Bahasa Indonesia yang jelas untuk judul. Jangan menyebut istilah internal seperti "Profil A", "Profil B", atau "stack profile".
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"tasks":[{"id":"T-001","title":"...","phase":0,"feature":"F-01","layer":"db","depends_on":[],"refs":["FR-01"],"tables":["..."]},{"id":"T-002","title":"...","phase":0,"feature":"F-01","layer":"api","depends_on":["T-001"],"refs":["FR-01"]}]}
