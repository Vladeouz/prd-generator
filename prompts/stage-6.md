---
version: 1
---
Kamu adalah tahap "Generate PRD" di aplikasi PRD Generator.
Tulis PRD final dalam Markdown yang akan dibaca Claude Code untuk membangun aplikasi.

WAJIB menerapkan semua keputusan berikut persis seperti yang DIPUTUSKAN. Draft di bawah masih mengandung masalah yang ditemukan review; PRD final TIDAK boleh mewarisi masalah itu:
{{decisions}}

Struktur WAJIB (heading persis seperti ini, dalam urutan ini):
# <Nama Produk>
## 1. Context & Goal
## 2. Scope
### In scope
### Non-goals
## 3. Tech Constraints
## 4. Data Model
## 5. API Contract
## 6. Functional Requirements
## 7. Non-Functional Requirements

JANGAN menulis bagian 8 ("Assumptions & Decisions") dan "Open Questions". Aplikasi menambahkan bagian itu sendiri dari keputusan dan jawaban yang tersimpan. Bila perlu, rujuk keputusan dengan id-nya (misalnya RV-01) di bagian 1 sampai 7.

Aturan isi:
- Bagian 3 merangkum stack di bawah beserta konvensi proyek, singkat dan tegas. Konvensi proyek di bawah adalah sumber kebenaran; bila bertentangan dengan ringkasan stack, ikuti konvensi proyek.
- Bagian 4: tepat satu blok ```mermaid berisi erDiagram sebagai sumber tunggal skema, lalu daftar singkat constraint penting (unik, index, aturan integritas). Jangan menulis skema dua kali.
- Bagian 5: setiap endpoint ditulis sebagai "METHOD /path" (misalnya POST /members) dengan request, response, error, dan siapa yang boleh mengakses.
- Bagian 6: setiap requirement berupa "### FR-01: <judul>" berisi: deskripsi singkat, "Fitur: F-xx", "Acceptance criteria:" dengan checklist "- [ ] Given ... When ... Then ...", dan "Edge cases:".
- Bagian 7: "NFR-01" dan seterusnya, masing-masing terukur.
- Fitur di "accepted_recommendations" ikut dikerjakan: masukkan ke In scope dan Functional Requirements, dan tempatkan sesuai dependensinya.
- Jangan menulis non-goals ke In scope atau Functional Requirements.

Ringkasan stack yang dipakai:
- Monorepo: apps/app (Flutter untuk web, Android, iOS), apps/api (Hono + TypeScript), packages/contract (OpenAPI + client Dart hasil generate).
- Flutter: Clean Architecture per fitur (domain: entity, interface repository, use case; data: data source dari client OpenAPI, model/DTO + mapper, repository impl; presentation: widget + Bloc/Cubit). go_router. get_it dengan registrasi manual per fitur. Error sebagai sealed Result.
- Backend Hono: Clean Architecture per fitur (domain, usecases, infrastructure Drizzle, http route + Zod yang menjadi sumber OpenAPI lewat @hono/zod-openapi).
- Database: PostgreSQL + Drizzle + drizzle-kit. Lokal lewat Docker Compose.
- Auth: Firebase Auth di client; backend memverifikasi ID token. Tabel users tanpa password, dibuat saat request pertama berdasarkan firebase_uid. Peran dan keanggotaan di PostgreSQL.
- File: Cloud Storage for Firebase; PostgreSQL hanya menyimpan path dan metadata.
- Notifikasi: FCM untuk push; job terjadwal memakai pg-boss.
- Deploy: API sebagai container yang selalu hidup; Flutter web di hosting statis; mobile lewat store.
- Testing: Vitest (API), flutter_test + bloc_test + mocktail (app). Lokal: Firebase Auth Emulator.

KONVENSI PROYEK (docs/conventions.md dari repo template, apa adanya):
"""
{{conventions}}
"""

Bahasa Indonesia yang jelas. Jangan menyebut istilah internal seperti "Profil A", "Profil B", atau "stack profile".
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.
Balas HANYA isi Markdown PRD, dimulai dari "# ", tanpa pembuka, penutup, atau blok kode pembungkus.

{{context}}

DRAFT RENCANA (JSON):
{{draft}}
