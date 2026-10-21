---
version: 1
---
KONVENSI PROYEK (bagian terpilih dari docs/conventions.md di repo template, apa adanya). Pakai path, pola, dan perintah test dari sini:
"""
{{conventions}}
"""

Kamu adalah tahap "Detail Task" di aplikasi PRD Generator, untuk fase {{phase}} ({{phaseName}}).
Daftar task sudah dibuat. Untuk SETIAP task fase ini, tulis file yang disentuh dan kriteria selesai yang bisa dibuktikan. Task akan dikerjakan Claude Code satu per satu di proyek yang dibuat dari repo template.

TASK FASE {{phase}} (JSON, dari daftar task):
{{tasks}}

BAGIAN PRD YANG DIRUJUK TASK FASE INI:
{{prd}}

Aturan:
- Tulis detail untuk SEMUA task di atas, dengan "id" yang sama, tanpa task lain dan tanpa mengubah judul.
- "files": path utama yang disentuh (relatif dari root repo, ikuti struktur di konvensi), boleh dengan keterangan singkat dalam kurung. Jangan menyentuh file setup template (pnpm-workspace.yaml, biome.json, docker-compose.yml, firebase.json, pipeline kontrak).
- "done_when": daftar kriteria yang bisa diverifikasi, sebaiknya perintah test yang spesifik beserta kasus yang harus lulus (endpoint, kode error, aturan bisnis dari PRD). JANGAN menulis `pnpm check`; aplikasi menambahkan "`pnpm check` hijau" di akhir setiap task.
- "manual" HANYA untuk task yang hasilnya harus dicek manusia (misalnya alur layar Flutter): {"criterion": "<apa yang dicek>", "steps": ["<langkah dan hasil yang harus terlihat>"]}. JANGAN menulis langkah persiapan (.env, docker compose, menjalankan API, flutter run); aplikasi menambahkannya sendiri. Task lain: "manual": null.

Bahasa Indonesia yang jelas. Jangan menyebut istilah internal seperti "Profil A", "Profil B", atau "stack profile".
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"tasks":[{"id":"T-001","files":["apps/api/src/..."],"done_when":["..."],"manual":null}]}
