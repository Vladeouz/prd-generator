---
version: 6
---
KONVENSI PROYEK (bagian terpilih dari docs/conventions.md di repo template, apa adanya). Pakai path, pola, dan perintah test dari sini:
"""
{{conventions}}
"""

FILE YANG SUDAH ADA DI REPO TEMPLATE (kode dan test aplikasi, tanpa fitur contoh notes yang dihapus salah satu task):
"""
{{templateFiles}}
"""

SKEMA DATABASE DAN MIGRASI YANG SUDAH ADA DI REPO TEMPLATE:
"""
{{templateSchema}}
"""

API CONTRACT DARI PRD (bagian 5, utuh, sama untuk semua fase). Ini satu-satunya sumber endpoint, field request, dan field respons:
"""
{{apiContract}}
"""

Kamu adalah tahap "Detail Task" di aplikasi PRD Generator, untuk fase {{phase}} ({{phaseName}}).
Daftar task sudah dibuat. Untuk SETIAP task fase ini, tulis file yang disentuh dan kriteria selesai yang bisa dibuktikan. Task akan dikerjakan Claude Code satu per satu di proyek yang dibuat dari repo template.

TASK FASE {{phase}} (JSON, dari daftar task):
{{tasks}}

BAGIAN PRD YANG DIRUJUK TASK FASE INI:
{{prd}}

Aturan:
- Tulis detail untuk SEMUA task di atas, dengan "id" yang sama, tanpa task lain dan tanpa mengubah judul.
- "files": path utama yang disentuh, relatif dari root repo, PATH SAJA tanpa spasi, tanda kurung, atau backtick. Path harus mengikuti struktur dan pola di konvensi (misalnya skema database satu file per tabel di `apps/api/src/db/schema/<tabel>.ts`, bukan `schema.ts`). Keterangan singkat per file (opsional) ditulis di "file_notes": {"<path persis seperti di files>": "<keterangan>"}. Jangan menyentuh file setup template (pnpm-workspace.yaml, biome.json, docker-compose.yml, firebase.json, pipeline kontrak).
- Migrasi baru ditulis `apps/api/drizzle/<nomor>_<nama>.sql`, dengan nomor 4 digit mulai dari "Nomor migrasi berikutnya" di atas; task sesudahnya yang juga membuat migrasi memakai nomor yang lebih besar. JANGAN memakai nomor migrasi yang sudah ada. Nomor akhirnya dibuat drizzle-kit (`db:generate`), jadi "done_when" tidak bergantung pada nomor persis.
- JANGAN menambah kolom yang sudah ada di tabel template di atas (misalnya kolom `users` yang tercantum); task yang membutuhkannya cukup memakai kolom itu, dan hanya kolom baru yang ditambahkan.
- Task yang mengubah fitur yang SUDAH ADA di template memakai file template di daftar di atas dengan nama yang sama. JANGAN membuat file baru dengan peran yang sama di folder yang sama: route (`*.route.ts`), test route (`*.route.test.ts`), dan repository (`*-repository.ts`) yang sudah ada diubah, bukan diganti file bernama lain. File baru hanya untuk hal yang belum ada di template.
- Endpoint, field body request, dan field respons di "files", "file_notes", dan "done_when" HANYA yang ada di API CONTRACT di atas. JANGAN menambah field yang tidak ada di sana, walau terlihat berguna untuk layar (misalnya field profil yang tidak ada di body PATCH). Layar Flutter hanya mengirim field yang ada di body request kontrak.
- Bila PRD dan konvensi (misalnya bagian Autentikasi) tampak bertentangan, JANGAN memutuskan sendiri: ikuti API Contract PRD, dan tulis pertentangannya di "file_notes" file yang terkait, diawali "Catatan pertentangan:", agar agent yang mengerjakan task menanyakannya ke user.
- "done_when": daftar kriteria yang bisa diverifikasi, sebaiknya perintah test yang spesifik beserta kasus yang harus lulus (endpoint, kode error, aturan bisnis dari PRD). Perintah test dengan filter ditulis TANPA `--`, karena dengan `--` pnpm meneruskannya ke vitest sehingga filternya tidak berlaku dan semua test dijalankan. Contoh yang benar:
  - unit test API: `pnpm --filter api test create-reservation`
  - integration test API: `pnpm --filter api test:int reservations`
  - test Flutter, dijalankan di `apps/app`: `flutter test test/features/reservations`
  Contoh yang SALAH: `pnpm --filter api test:int -- reservations`.
- Level test mengikuti konvensi Test API: unit test API (`pnpm --filter api test`) HANYA untuk use case dengan repository palsu, pemetaan DTO dan dokumen OpenAPI route, dan fungsi tanpa database. Perilaku yang melewati route dengan login atau database, termasuk status respons, isi database, dan isi log dari request itu, diuji di integration test (`pnpm --filter api test:int`).
- JANGAN menyebut `pnpm check` sama sekali di "done_when", juga tidak dalam kalimat larangan; aplikasi menambahkan "`pnpm check` hijau" di akhir setiap task.
- "manual" HANYA untuk task yang hasilnya harus dicek manusia (misalnya alur layar Flutter): {"criterion": "<apa yang dicek>", "steps": ["<langkah dan hasil yang harus terlihat>"]}. JANGAN menulis langkah persiapan (.env, docker compose, menjalankan API, flutter run); aplikasi menambahkannya sendiri. Task lain: "manual": null.

Bahasa Indonesia yang jelas. Jangan menyebut istilah internal seperti "Profil A", "Profil B", atau "stack profile".
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"tasks":[{"id":"T-001","files":["apps/api/src/..."],"file_notes":{"apps/api/src/...":"..."},"done_when":["..."],"manual":null}]}
