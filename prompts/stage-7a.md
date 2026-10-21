---
version: 1
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
- Setiap task punya "id" berurutan "T-001", "T-002", dan seterusnya, "title" yang spesifik (sebut endpoint, layar, atau tabelnya), "phase" (nomor fase dari ringkasan), "feature" (id fitur dari ringkasan, misalnya "F-02" atau "R-01"), "layer" (salah satu dari: {{layers}}), "depends_on" (id task SEBELUMNYA saja, boleh kosong), dan "refs" (kode FR-xx atau NFR-xx dari ringkasan, minimal satu).
- Urutkan task per fase (fase 0 dulu). Task sebuah fitur tidak boleh berada di fase sebelum fase fitur itu. Fitur rekomendasi yang diterima ditempatkan di fase yang sesuai dependensinya.
- Setiap FR-xx di ringkasan WAJIB dirujuk minimal satu task. Jangan merujuk kode yang tidak ada di ringkasan.
- Judul task tidak boleh sama.
- JANGAN membuat task setup yang sudah disediakan template: monorepo, Biome, Docker Compose, emulator Firebase, pipeline kontrak OpenAPI dan client Dart, CI, autentikasi dasar dan `GET /v1/me`, `pnpm check`. Task pertama langsung mengerjakan fitur produk.
- WAJIB ada tepat satu task berjudul "Hapus fitur contoh notes" (layer "app", "feature": null, "refs": []) yang ditempatkan SETELAH task fitur pertama, mengikuti bagian "Menghapus fitur contoh notes" di konvensi. Hanya task ini yang boleh punya "feature": null dan "refs" kosong.
- Pecah per lapisan bila perlu (db, api, contract, app, test), tetapi jangan terlalu kecil: target 20–45 task untuk MVP.

Bahasa Indonesia yang jelas untuk judul. Jangan menyebut istilah internal seperti "Profil A", "Profil B", atau "stack profile".
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"tasks":[{"id":"T-001","title":"...","phase":0,"feature":"F-01","layer":"db","depends_on":[],"refs":["FR-01"]}]}
