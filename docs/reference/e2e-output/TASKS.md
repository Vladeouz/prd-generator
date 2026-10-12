# TASKS — Aplikasi Membership Gym

## Fase 0 — Fondasi

- [ ] T-001 Setup monorepo dan Docker Compose
  - layer: infra · depends_on: - · refs: -
  - files: `pnpm-workspace.yaml`, `package.json`, `apps/api/package.json`, `apps/app/pubspec.yaml`, `packages/contract/package.json`, `docker-compose.yml`, `.env.example`, `firebase.json`, `README.md`
  - done when: `docker compose up -d` menjalankan PostgreSQL (port 5432) dan Firebase Auth Emulator (port 9099) sampai healthy; `pnpm install` sukses di root; `flutter create`-scaffold di `apps/app` lolos `flutter analyze`; `.env.example` berisi `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_EMULATOR_HOST`, `BOOTSTRAP_OWNER_EMAIL`

- [ ] T-002 Kerangka API Hono, format error, logger, dan `GET /health`
  - layer: api · depends_on: T-001 · refs: NFR-09, NFR-11
  - files: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/config/env.ts`, `apps/api/src/shared/http/errors.ts`, `apps/api/src/shared/logger.ts`, `apps/api/src/features/system/http/health.route.ts`, `apps/api/vitest.config.ts`, `apps/api/test/setup/`
  - done when: `pnpm --filter api test` lulus: `GET /health` → `200 {"status":"ok"}`; error handler global menghasilkan `{ error: { code, message, details? } }` untuk 404/422/500; validasi Zod menghasilkan `422 VALIDATION_ERROR` dengan `details` per field; test logger membuktikan header `Authorization`, `phone`, dan `fullName` di-redact

- [ ] T-003 Skema Drizzle dan migrasi awal
  - layer: db · depends_on: T-002 · refs: FR-02, FR-04, FR-07, FR-08, FR-13, NFR-08
  - files: `apps/api/src/db/schema/*.ts`, `apps/api/drizzle.config.ts`, `apps/api/drizzle/0000_*.sql`, `apps/api/src/db/client.ts`, `apps/api/test/setup/db.ts`
  - done when: `pnpm --filter api db:migrate` sukses ke Postgres Docker; integration test `pnpm --filter api test:int -- schema` memverifikasi semua tabel, unique constraint (termasuk partial unique `staff_invitations ... WHERE status='pending'` dan dedupe `notifications`), CHECK `end_date >= start_date`, `duration_value > 0`, `reference_price >= 0`, FK `package_id ON DELETE RESTRICT`, cascade member → periods/notifications, dan semua index di bagian 4 PRD; migrasi di-commit

- [ ] T-004 Middleware verifikasi Firebase ID token dan upsert `users`
  - layer: api · depends_on: T-003 · refs: FR-02, NFR-01, NFR-09
  - files: `apps/api/src/shared/auth/firebase-admin.ts`, `apps/api/src/shared/http/middleware/authenticate.ts`, `apps/api/src/features/auth/usecases/upsert-user.ts`, `apps/api/src/features/auth/infrastructure/user.repository.ts`, `apps/api/test/helpers/emulator-token.ts`
  - done when: `pnpm --filter api test:int -- auth` lulus dengan Firebase Auth Emulator: tanpa header → `401 UNAUTHENTICATED`; token tidak valid atau kedaluwarsa → `401` dan tidak ada baris `users` baru; token valid → satu baris `users` dengan email lowercase; dua request paralel pertama → tetap satu baris; email yang berubah di token memperbarui `users.email` dan `last_seen_at`; `/health` tetap publik

- [ ] T-005 Middleware keanggotaan gym, deklarasi peran per route, dan harness test otorisasi
  - layer: api · depends_on: T-004 · refs: FR-06, NFR-01, NFR-02
  - files: `apps/api/src/shared/http/middleware/load-membership.ts`, `apps/api/src/shared/http/define-route.ts` (wajib `access: 'public'|'authenticated'|'owner'|'owner_staff'`), `apps/api/src/shared/http/context.ts` (`gymId` dari keanggotaan), `apps/api/test/authz/route-registry.test.ts`, `apps/api/test/helpers/actors.ts`
  - done when: `pnpm --filter api test -- authz` lulus: test mengiterasi semua route terdaftar dan gagal jika ada route tanpa deklarasi akses; setiap route non-publik tanpa token → 401; route contoh `owner_staff` → `403 NO_GYM_ACCESS` untuk user tanpa gym atau staff `inactive`; route contoh `owner` → `403 FORBIDDEN_ROLE` untuk staff; helper aktor (owner, staff, staff inactive, tanpa gym, gym lain) siap dipakai test berikutnya

- [ ] T-006 Endpoint `GET /me` dan `PATCH /me/settings`
  - layer: api · depends_on: T-005 · refs: FR-01, FR-02, FR-15
  - files: `apps/api/src/features/auth/usecases/get-me.ts`, `apps/api/src/features/auth/usecases/update-settings.ts`, `apps/api/src/features/auth/http/me.routes.ts`
  - done when: `pnpm --filter api test:int -- me` lulus: `GET /me` mengembalikan `user` (`id`, `email`, `emailVerified`, `pushEnabled`), `membership` atau `null`, `gymExists`, dan `canBootstrap` (true hanya jika belum ada gym dan email = `BOOTSTRAP_OWNER_EMAIL`); `PATCH /me/settings {pushEnabled:false}` → `200` dan tersimpan; body tidak valid → 422

- [ ] T-007 Pipeline kontrak OpenAPI dan generate client Dart
  - layer: contract · depends_on: T-006 · refs: NFR-10
  - files: `apps/api/scripts/export-openapi.ts`, `packages/contract/openapi.json`, `packages/contract/dart/` (hasil generate, tidak diedit manual), `packages/contract/generate.sh`, `packages/contract/openapi-generator-config.yaml`, `package.json` (script `contract:generate`)
  - done when: `pnpm contract:generate` mengekspor spesifikasi dari route `@hono/zod-openapi` ke `packages/contract/openapi.json` lalu men-generate package Dart (dio) yang lolos `dart analyze`; spesifikasi berisi `/health`, `/me`, `/me/settings`, skema error, dan security scheme Bearer; menjalankan ulang lalu `git diff --exit-code packages/contract` tidak menghasilkan diff

- [ ] T-008 Setup gym: `POST /gym`, `GET /gym`, `PATCH /gym`
  - layer: api · depends_on: T-007 · refs: FR-03, FR-06
  - files: `apps/api/src/features/gym/domain/timezone.ts`, `apps/api/src/features/gym/usecases/{bootstrap-gym,get-gym,update-gym}.ts`, `apps/api/src/features/gym/infrastructure/gym.repository.ts`, `apps/api/src/features/gym/http/gym.routes.ts`
  - done when: `pnpm --filter api test:int -- gym` lulus: email bootstrap yang terverifikasi → `201`, timezone `Asia/Jakarta`, dan keanggotaan `owner` aktif dibuat dalam satu transaksi; email lain → `403 BOOTSTRAP_NOT_ALLOWED`; email belum terverifikasi → 403; gym sudah ada → `409 GYM_ALREADY_EXISTS`; timezone non-IANA atau nama kosong/lebih dari 100 karakter → 422; staff `PATCH /gym` → `403 FORBIDDEN_ROLE`; `PATCH /gym` memanggil hook `onTimezoneChanged` (sementara no-op, diisi di T-036); `pnpm contract:generate` di-commit

- [ ] T-009 Undangan staf dan pencocokan saat `GET /me`
  - layer: api · depends_on: T-008 · refs: FR-04
  - files: `apps/api/src/features/staff/domain/invitation.ts`, `apps/api/src/features/staff/usecases/{invite-staff,revoke-invitation,list-staff,match-invitation}.ts`, `apps/api/src/features/staff/infrastructure/*.repository.ts`, `apps/api/src/features/staff/http/staff.routes.ts`, `apps/api/src/features/auth/usecases/get-me.ts`
  - done when: `pnpm --filter api test -- staff` (unit) dan `test:int -- staff` lulus: undangan `Budi@Mail.com` tersimpan sebagai `budi@mail.com` dengan `expiresAt` +7 hari; duplikat pending → `409 INVITATION_PENDING`; sudah anggota → `409 ALREADY_MEMBER`; revoke → 204, undangan yang bukan pending → `409 INVITATION_NOT_PENDING`; `GET /me` dengan email terverifikasi membuat keanggotaan staff dan undangan menjadi `accepted` dengan `accepted_by_user_id` terisi; email belum terverifikasi, undangan revoked, atau email tanpa undangan → `membership=null`; undangan kedaluwarsa menjadi `expired`; `GET /staff` hanya menampilkan undangan pending; kontrak di-regenerate

- [ ] T-010 Kelola akses staf: `PATCH` dan `DELETE /staff/{membershipId}`
  - layer: api · depends_on: T-009 · refs: FR-05
  - files: `apps/api/src/features/staff/usecases/{set-staff-status,remove-staff}.ts`, `apps/api/src/features/staff/http/staff.routes.ts`
  - done when: `pnpm --filter api test:int -- staff-access` lulus: staf yang dinonaktifkan mendapat `403 NO_GYM_ACCESS` pada request berikutnya; staf yang diaktifkan lagi bisa mengakses data; hapus keanggotaan menghapus semua `device_tokens` user itu dalam satu transaksi, tetapi baris `users` tetap ada; target owner → `409 CANNOT_MODIFY_OWNER`; membership gym lain → 404; kontrak di-regenerate

- [ ] T-011 Master paket: CRUD `/packages`
  - layer: api · depends_on: T-008 · refs: FR-07, FR-06
  - files: `apps/api/src/features/packages/domain/package.ts`, `apps/api/src/features/packages/usecases/{list,create,update,delete}-package.ts`, `apps/api/src/features/packages/infrastructure/package.repository.ts`, `apps/api/src/features/packages/http/packages.routes.ts`
  - done when: `pnpm --filter api test:int -- packages` lulus: owner membuat "Bulanan" 1 month 250000 → `201` dengan `isActive=true` dan `isUsed=false`; nama duplikat di antara paket aktif (tanpa membedakan huruf besar/kecil) → `409 PACKAGE_NAME_EXISTS`; `durationValue` ≤ 0 atau harga negatif → 422; hapus paket yang belum dipakai → 204; paket yang sudah dipakai periode → `409 PACKAGE_IN_USE`; staff hanya melihat paket aktif walaupun `includeInactive=true`; staff `POST /packages` → `403 FORBIDDEN_ROLE`; hasil urut berdasarkan nama; paket gym lain → 404; kontrak di-regenerate

- [ ] T-012 CI: lint, test, coverage, dan cek diff kontrak
  - layer: infra · depends_on: T-011 · refs: NFR-10
  - files: `.github/workflows/ci.yml`, `apps/api/vitest.config.ts` (threshold coverage `domain/` dan `usecases/` ≥ 80%)
  - done when: workflow menjalankan service Postgres dan Firebase Auth Emulator, lalu `pnpm --filter api test`, `test:int`, dan coverage dengan threshold; `pnpm contract:generate && git diff --exit-code packages/contract` membuat build gagal jika client berbeda; `cd apps/app && flutter analyze && flutter test`; workflow hijau di branch

- [ ] T-013 Kerangka app Flutter: core `Result<T>`, DI get_it, tema, router, dan API client
  - layer: app · depends_on: T-007 · refs: NFR-12
  - files: `apps/app/lib/core/result.dart`, `apps/app/lib/core/failure.dart`, `apps/app/lib/core/di/injector.dart`, `apps/app/lib/core/router/app_router.dart`, `apps/app/lib/core/theme/app_theme.dart`, `apps/app/lib/core/network/api_client_factory.dart` (interceptor Bearer token dengan refresh otomatis dan mapping format error ke `Failure`), `apps/app/lib/main.dart`, `apps/app/pubspec.yaml` (dependency path ke `packages/contract/dart`)
  - done when: `flutter analyze` bersih; `flutter test test/core` lulus: mapping error API (401, 403 `NO_GYM_ACCESS`/`FORBIDDEN_ROLE`, 404, 409, 422 dengan `details`) ke subtipe `Failure`; sealed `Result` teruji; aplikasi bisa dijalankan di Chrome dan emulator Android dengan layar placeholder; layout tidak overflow di lebar 360 px

- [ ] T-014 Flutter auth: domain dan data
  - layer: app · depends_on: T-013 · refs: FR-01, FR-02
  - files: `apps/app/lib/features/auth/domain/{entities,repositories,usecases}/`, `apps/app/lib/features/auth/data/{datasources/firebase_auth_datasource.dart,datasources/me_remote_datasource.dart,models/,repositories/auth_repository_impl.dart}`, `apps/app/lib/features/auth/auth_feature.dart` (`registerAuthFeature()`)
  - done when: `flutter test test/features/auth/domain test/features/auth/data` lulus dengan mocktail: use case sign in, sign up (mengirim email verifikasi), resend verification, reload user, reset password, sign out, dan getMe mengembalikan `Result` tanpa melempar exception; salah password atau akun tidak ada dipetakan ke satu failure `InvalidCredentials`; error jaringan dipetakan ke `NetworkFailure`; mapper DTO `/me` ke entity `Session` teruji

- [ ] T-015 Flutter auth: presentation dan redirect go_router
  - layer: app · depends_on: T-014 · refs: FR-01, FR-04
  - files: `apps/app/lib/features/auth/presentation/bloc/auth_bloc.dart`, `apps/app/lib/features/auth/presentation/pages/{login,register,verify_email,forgot_password,no_access}_page.dart`, `apps/app/lib/core/router/app_router.dart`
  - done when: `flutter test test/features/auth/presentation` lulus: `bloc_test` untuk login sukses/gagal, register, logout, dan token refresh gagal → unauthenticated; widget/router test memastikan: belum login → `/login`; keanggotaan aktif → beranda; `canBootstrap` → setup gym; email belum terverifikasi → `/verify-email` (tombol kirim ulang dan "Saya sudah verifikasi"); lainnya → "Belum punya akses"; "Lupa password" menampilkan pesan yang sama untuk email terdaftar dan tidak terdaftar; error jaringan menampilkan tombol coba lagi

- [ ] T-016 Flutter gym: setup gym pertama dan pengaturan gym
  - layer: app · depends_on: T-015, T-008 · refs: FR-03
  - files: `apps/app/lib/features/gym/{domain,data,presentation}/`, `apps/app/lib/features/gym/gym_feature.dart`
  - done when: `flutter test test/features/gym` lulus: cubit setup gym (sukses → router ke beranda, `409 GYM_ALREADY_EXISTS`, 422 per field); halaman pengaturan gym (nama, timezone dengan picker IANA, default `Asia/Jakarta`) hanya bisa diakses owner; staff yang membuka route pengaturan diarahkan keluar

- [ ] T-017 Flutter staff: daftar, undang, revoke, aktif/nonaktif, dan hapus staf
  - layer: app · depends_on: T-015, T-010 · refs: FR-04, FR-05
  - files: `apps/app/lib/features/staff/{domain,data,presentation}/`, `apps/app/lib/features/staff/staff_feature.dart`
  - done when: `flutter test test/features/staff` lulus: `bloc_test` untuk load, invite (sukses, `409 INVITATION_PENDING`, `409 ALREADY_MEMBER`), revoke, toggle status, dan remove; setelah undangan dibuat tampil instruksi "Minta staf mendaftar di aplikasi dengan email ini"; menu staf tidak tampil untuk peran staff; aksi pada owner dinonaktifkan di UI

- [ ] T-018 Flutter packages: master paket
  - layer: app · depends_on: T-015, T-011 · refs: FR-07
  - files: `apps/app/lib/features/packages/{domain,data,presentation}/`, `apps/app/lib/features/packages/packages_feature.dart`
  - done when: `flutter test test/features/packages` lulus: `bloc_test` untuk list (owner dengan toggle tampilkan nonaktif), create/update (422 per field, `409 PACKAGE_NAME_EXISTS`), nonaktifkan, dan delete dengan `409 PACKAGE_IN_USE` yang menampilkan saran untuk menonaktifkan; staff tidak melihat tombol tambah, ubah, atau hapus

## Fase 1 — Data Member

- [ ] T-019 Domain API: perhitungan tanggal, status, `Clock`, dan normalisasi HP
  - layer: api · depends_on: T-002 · refs: FR-08, FR-10, NFR-07
  - files: `apps/api/src/shared/time/clock.ts`, `apps/api/src/shared/time/today-in-timezone.ts`, `apps/api/src/features/members/domain/{end-date.ts,member-status.ts,phone.ts}`
  - done when: `pnpm --filter api test -- domain` lulus: `computeEndDate` memakai rumus inklusif (2026-01-15 + 1 month → 2026-02-14; 2026-03-01 + 10 day → 2026-03-10; clamp 2026-01-31 + 1 month → 2026-02-27); `memberStatus(endDate, today)` adalah fungsi murni dengan ambang 7 hari (+7 → `expiring_soon`/`daysLeft=7`, +8 → `active`/8, kemarin → `expired`/-1); `todayIn('Asia/Jakarta')` untuk `2026-05-09T16:30Z` → 2026-05-09 dan `17:30Z` → 2026-05-10 (batas 23.59/00.00); `0812-3456-7890` → `+6281234567890`, `62…` → `+62…`, panjang di luar 9–15 digit ditolak

- [ ] T-020 Repository member dan periode (Drizzle) dengan transaksi `current_*`
  - layer: db · depends_on: T-019, T-011 · refs: FR-08, FR-09, NFR-08
  - files: `apps/api/src/features/members/infrastructure/{member.repository.ts,period.repository.ts,member.mapper.ts}`, `apps/api/src/features/members/domain/member.ts`
  - done when: `pnpm --filter api test:int -- member-repo` lulus: `createWithInitialPeriod` menyimpan member dan periode `initial` beserta snapshot paket dalam satu transaksi, lalu mengisi `current_period_id` dan `current_end_date`; `recomputeCurrent(memberId, tx)` memilih periode terakhir (`start_date DESC, created_at DESC`); rollback saat gagal tidak meninggalkan member tanpa periode; semua query menerima `gymId` wajib; unique `(gym_id, phone)` dipetakan ke error domain `DuplicatePhone` dengan `memberId` yang sudah ada

- [ ] T-021 Tambah member: use case dan route `POST /members`
  - layer: api · depends_on: T-020 · refs: FR-08, FR-06
  - files: `apps/api/src/features/members/usecases/create-member.ts`, `apps/api/src/features/members/http/schemas.ts` (objek `Member`, `Period`), `apps/api/src/features/members/http/members.routes.ts`
  - done when: `pnpm --filter api test -- create-member` (unit dengan repository palsu dan `Clock` mock) dan `test:int -- members-create` lulus: tanpa `endDate` dihitung otomatis; dengan `endDate` manual → `endDateAdjusted=true`; response berisi `currentEndDate`, `status`, `daysLeft`, `createdBy` = user login, dan `paymentStatus` sesuai input; `409 DUPLICATE_PHONE` dengan `details.memberId`; `422 PACKAGE_INACTIVE`; `422 END_BEFORE_START`; `startDate` masa lalu boleh dan bisa langsung `expired`; staff → 201; kontrak di-regenerate

- [ ] T-022 Detail dan edit member: `GET /members/{id}` dan `PATCH /members/{id}`
  - layer: api · depends_on: T-021 · refs: FR-09, FR-06
  - files: `apps/api/src/features/members/usecases/{get-member,update-member}.ts`, `apps/api/src/features/members/http/members.routes.ts`
  - done when: `pnpm --filter api test:int -- members-detail` lulus: detail member dengan 3 periode mengembalikan `periods` urut terbaru dan `createdBy.email`; `PATCH` nama/HP memakai validasi dan normalisasi FR-08; `409 DUPLICATE_PHONE`; member gym lain → 404 (test isolasi); staff → 200; kontrak di-regenerate

- [ ] T-023 Edit periode: `PATCH /members/{id}/periods/{periodId}`
  - layer: api · depends_on: T-022 · refs: FR-09, NFR-08
  - files: `apps/api/src/features/members/usecases/update-period.ts`, `apps/api/src/features/members/http/members.routes.ts`
  - done when: `pnpm --filter api test:int -- period-update` lulus: ubah `endDate` periode terakhir menjadi 2026-12-31 → `currentEndDate` ikut berubah dalam transaksi yang sama, `endDateAdjusted=true`, dan `updated_by_user_id` terisi; `endDate` pada periode lama → `409 PERIOD_NOT_LATEST`; `paymentStatus`/`amountPaid` periode lama bisa diubah; `endDate < startDate` → `422 END_BEFORE_START`; periode milik member lain atau gym lain → 404; invariant `current_end_date` = periode terakhir dicek setelah setiap operasi; kontrak di-regenerate

- [ ] T-024 Flutter members: domain dan data (tambah, detail, edit, dan edit periode)
  - layer: app · depends_on: T-023, T-013 · refs: FR-08, FR-09
  - files: `apps/app/lib/features/members/domain/{entities/member.dart,entities/period.dart,repositories/members_repository.dart,usecases/}`, `apps/app/lib/features/members/data/{datasources/members_remote_datasource.dart,models/,mappers/,repositories/members_repository_impl.dart}`, `apps/app/lib/features/members/members_feature.dart`
  - done when: `flutter test test/features/members/domain test/features/members/data` lulus: mapper `Member`/`Period` (tanggal `YYYY-MM-DD` ke `DateTime` tanggal saja, status enum, `daysLeft`); failure spesifik `DuplicatePhone(memberId)`, `PackageInactive`, `EndBeforeStart`, dan `PeriodNotLatest` dipetakan dari response error; tidak ada perhitungan status di client

- [ ] T-025 Flutter members: form tambah dan edit member
  - layer: app · depends_on: T-024, T-018 · refs: FR-08, FR-09, FR-07
  - files: `apps/app/lib/features/members/presentation/{bloc/member_form_cubit.dart,pages/member_form_page.dart,widgets/}`
  - done when: `flutter test test/features/members/presentation/member_form` lulus: `bloc_test` untuk sukses dan gagal (422 per field, `DUPLICATE_PHONE` menampilkan tautan ke member yang sudah ada, `END_BEFORE_START`); pratinjau tanggal berakhir diisi dari paket dan bisa di-override manual; hanya paket aktif yang tampil; tanpa paket aktif tampil "Belum ada paket, minta pemilik menambahkan paket" (untuk owner ada tautan ke halaman paket); `amountPaid` default dari `referencePrice`

- [ ] T-026 Flutter members: halaman detail dan edit periode
  - layer: app · depends_on: T-025 · refs: FR-09, FR-10
  - files: `apps/app/lib/features/members/presentation/{bloc/member_detail_cubit.dart,pages/member_detail_page.dart,widgets/period_tile.dart,widgets/edit_period_sheet.dart}`
  - done when: `flutter test test/features/members/presentation/member_detail` lulus: `bloc_test` untuk load sukses, 404 (kembali ke daftar), edit `endDate` periode terakhir, dan edit pembayaran periode lama; widget test menampilkan status dan sisa hari dari server ("Habis 3 hari lalu" untuk `daysLeft=-3`); input `endDate` hanya tersedia di periode terakhir

## Fase 2 — Status dan Perpanjangan

- [ ] T-027 Daftar member dan ringkasan: `GET /members` dan `GET /members/summary`
  - layer: api · depends_on: T-023 · refs: FR-10, FR-11
  - files: `apps/api/src/features/members/usecases/{list-members,members-summary}.ts`, `apps/api/src/features/members/infrastructure/member.query.ts`, `apps/api/src/features/members/http/members.routes.ts` (route statis didaftarkan sebelum `/{id}`)
  - done when: `pnpm --filter api test:int -- members-list` lulus: seed 4 active, 3 expiring_soon, dan 3 expired → summary `4/3/3`, total 10, dan `today` sesuai timezone gym; filter `status=expired` → 3 item; `q=budi` cocok tanpa membedakan huruf besar/kecil; `q=0812345` cocok dengan `+62812345…`; sort default `endDate_asc`, serta `endDate_desc` dan `name_asc`; 45 member dengan `pageSize=20` halaman 3 → 5 item dan `total=45`; `pageSize` > 100 → 422; filter status dihitung dari rentang tanggal di SQL; kontrak di-regenerate

- [ ] T-028 Uji kinerja daftar dan ringkasan member
  - layer: test · depends_on: T-027 · refs: NFR-04
  - files: `apps/api/scripts/seed-perf.ts`, `apps/api/test/perf/members-list.perf.ts`
  - done when: `pnpm --filter api perf:members` men-seed 5.000 member dan 20.000 periode, lalu mengukur p95 `GET /members` (dengan filter dan `q`) dan `GET /members/summary` < 500 ms, serta `POST /members` < 300 ms; `EXPLAIN` memakai index `members(gym_id, current_end_date)` dan index nama; hasil dicatat di `apps/api/test/perf/README.md`

- [ ] T-029 Perpanjangan: `POST /members/{id}/renewals`
  - layer: api · depends_on: T-023 · refs: FR-12, NFR-08
  - files: `apps/api/src/features/renewals/domain/renewal-start-date.ts`, `apps/api/src/features/renewals/usecases/renew-membership.ts`, `apps/api/src/features/renewals/http/renewals.routes.ts`
  - done when: `pnpm --filter api test -- renewal` (unit) dan `test:int -- renewals` lulus: hari ini 2026-05-10 dan end 2026-05-20 → mulai 2026-05-21, berakhir 2026-06-20; end 2026-05-10 → mulai 2026-05-11; end 2026-05-01 → mulai 2026-05-10, berakhir 2026-06-09; periode lama tidak berubah, periode baru `kind=renewal` dengan `createdBy` dan pembayaran sesuai input; `current_*` diperbarui dalam transaksi dengan `SELECT … FOR UPDATE` pada `members`; dua perpanjangan paralel menghasilkan periode kedua yang mulai setelah periode pertama; `422 PACKAGE_INACTIVE`; staff → 201; kontrak di-regenerate

- [ ] T-030 Ekspor CSV streaming: `GET /members/export`
  - layer: api · depends_on: T-027 · refs: FR-16, NFR-06, NFR-09
  - files: `apps/api/src/features/members/domain/csv.ts`, `apps/api/src/features/members/usecases/export-members.ts`, `apps/api/src/features/members/http/export.route.ts`
  - done when: `pnpm --filter api test -- csv` dan `test:int -- export` lulus: 2 member dengan 5 periode → header dan 5 baris dengan kolom sesuai PRD; `Content-Type: text/csv; charset=utf-8` dan `Content-Disposition` dengan `members-YYYYMMDD.csv` (tanggal di timezone gym); escape RFC 4180 untuk koma dan kutip; nilai yang diawali `= + - @` diberi awalan `'`; tanpa member → hanya header; staff → `403 FORBIDDEN_ROLE`; data dibaca dengan cursor atau batch lalu di-stream; ekspor 5.000 member dan 20.000 periode < 10 detik (`pnpm --filter api perf:export`)

- [ ] T-031 Hapus permanen member: `DELETE /members/{id}`
  - layer: api · depends_on: T-022 · refs: FR-17
  - files: `apps/api/src/features/members/usecases/delete-member.ts`, `apps/api/src/features/members/http/members.routes.ts`
  - done when: `pnpm --filter api test:int -- members-delete` lulus: owner → 204, lalu member, semua periode, dan notifikasi terkait hilang, dan `GET /members/{id}` → 404; hapus ulang → 404; staff → `403 FORBIDDEN_ROLE`; member gym lain → 404; kontrak di-regenerate

- [ ] T-032 Flutter members: beranda dengan ringkasan, daftar, filter, pencarian, dan paginasi
  - layer: app · depends_on: T-026, T-027 · refs: FR-11, FR-10
  - files: `apps/app/lib/features/members/domain/usecases/{list_members,get_summary}.dart`, `apps/app/lib/features/members/data/` (tambahan), `apps/app/lib/features/members/presentation/{bloc/members_list_bloc.dart,bloc/summary_cubit.dart,pages/members_home_page.dart,widgets/}`
  - done when: `flutter test test/features/members/presentation/members_list` lulus: `bloc_test` untuk load, filter status, pencarian dengan debounce, filter dan pencarian bersamaan, load halaman berikutnya, refresh, dan gagal; ringkasan 4/3/3/10 tampil; tap kartu ringkasan menerapkan filter; empty state dengan tombol "Tambah member"; pull-to-refresh dan reload saat layar dibuka ulang

- [ ] T-033 Flutter renewals: perpanjangan membership
  - layer: app · depends_on: T-029, T-032 · refs: FR-12
  - files: `apps/app/lib/features/renewals/{domain,data,presentation}/`, `apps/app/lib/features/renewals/renewals_feature.dart`
  - done when: `flutter test test/features/renewals` lulus: `bloc_test` untuk sukses (detail member dan daftar di-refresh), `PACKAGE_INACTIVE`, dan error jaringan; form hanya menampilkan paket aktif, `amountPaid` default dari `referencePrice`, dan boleh dikosongkan walaupun `paid`; setelah sukses, halaman detail menampilkan periode `renewal` baru dan status terbaru dari server

- [ ] T-034 Flutter: ekspor CSV dan hapus permanen member (khusus owner)
  - layer: app · depends_on: T-030, T-031, T-032 · refs: FR-16, FR-17, FR-06
  - files: `apps/app/lib/features/members/domain/usecases/{export_members,delete_member}.dart`, `apps/app/lib/features/members/data/` (tambahan), `apps/app/lib/features/members/presentation/widgets/{export_action.dart,delete_member_dialog.dart}`, `apps/app/lib/core/platform/file_saver.dart` (web: unduh; mobile: share sheet)
  - done when: `flutter test test/features/members/presentation/owner_actions` lulus: menu ekspor dan hapus tidak tampil untuk staff; dialog hapus baru mengaktifkan tombol jika nama yang diketik cocok; `bloc_test` untuk hapus sukses (kembali ke daftar), 404 (kembali ke daftar), dan gagal; ekspor memanggil file saver sesuai platform (dibuktikan dengan mock `kIsWeb`)

## Fase 3 — Notifikasi

- [ ] T-035 Integrasi pg-boss di proses API dan penjadwalan per timezone gym
  - layer: infra · depends_on: T-008 · refs: FR-13, FR-03
  - files: `apps/api/src/shared/jobs/boss.ts`, `apps/api/src/shared/jobs/schedules.ts`, `apps/api/src/server.ts`, `apps/api/src/features/gym/usecases/update-gym.ts` (isi hook `onTimezoneChanged`)
  - done when: `pnpm --filter api test:int -- jobs-schedule` lulus: saat start, pg-boss memakai skema di database yang sama dan mendaftarkan schedule `membership-expiry-check` dengan cron `0 8 * * *` dan tz `Asia/Jakarta`; `PATCH /gym` ke `Asia/Makassar` mendaftarkan ulang schedule dengan tz baru; shutdown graceful menghentikan pg-boss

- [ ] T-036 Job `membership-expiry-check`: pembuatan notifikasi in-app
  - layer: api · depends_on: T-035, T-029 · refs: FR-13, FR-05, NFR-05
  - files: `apps/api/src/features/notifications/domain/notification-content.ts`, `apps/api/src/features/notifications/usecases/run-expiry-check.ts`, `apps/api/src/features/notifications/infrastructure/notification.repository.ts`, `apps/api/src/features/notifications/jobs/expiry-check.worker.ts`
  - done when: `pnpm --filter api test -- expiry` (unit dengan `Clock` mock) dan `test:int -- expiry-check` lulus: member dengan `currentEndDate` di `[today, today+7]` → satu notifikasi `expiring_soon` untuk setiap keanggotaan aktif; `< today` → `expired`; staff `inactive` tidak menerima notifikasi; judul dan isi sesuai format PRD; job dijalankan dua kali pada hari yang sama atau hari berikutnya tidak membuat duplikat (`ON CONFLICT DO NOTHING`); end date baru setelah perpanjangan menghasilkan notifikasi baru; job mengembalikan daftar ID notifikasi baru per penerima; 5.000 member dan 5 penerima selesai < 60 detik (`pnpm --filter api perf:expiry`)

- [ ] T-037 Endpoint notifikasi in-app
  - layer: api · depends_on: T-036 · refs: FR-14
  - files: `apps/api/src/features/notifications/usecases/{list-notifications,unread-count,mark-read,mark-all-read}.ts`, `apps/api/src/features/notifications/http/notifications.routes.ts`
  - done when: `pnpm --filter api test:int -- notifications-api` lulus: `GET /notifications` hanya menampilkan milik user login, urut terbaru, terpaginasi, dan mendukung `unreadOnly`; `unread-count` → `{count:3}` untuk 3 notifikasi belum dibaca; `POST /{id}/read` idempoten (204 dua kali); notifikasi milik user lain → 404; `read-all` → count 0; status baca owner tidak memengaruhi staff; `read-all` didaftarkan sebelum `/{id}`; kontrak di-regenerate

- [ ] T-038 Endpoint token perangkat: `POST` dan `DELETE /device-tokens`
  - layer: api · depends_on: T-010 · refs: FR-15, FR-01
  - files: `apps/api/src/features/devices/usecases/{register-device-token,delete-device-token}.ts`, `apps/api/src/features/devices/infrastructure/device-token.repository.ts`, `apps/api/src/features/devices/http/device-tokens.routes.ts`
  - done when: `pnpm --filter api test:int -- device-tokens` lulus: token baru → `201 {id}`; token yang sama dari user lain → `200 {id}` dan `user_id` dipindahkan; `platform="web"` → 422; `DELETE` token milik sendiri → 204, token yang tidak ada → tetap 204, token milik user lain → 204 tanpa terhapus; `DELETE` memakai akses Terautentikasi (bisa dipanggil tanpa keanggotaan aktif); kontrak di-regenerate

- [ ] T-039 Job pengiriman push lewat FCM
  - layer: api · depends_on: T-036, T-038 · refs: FR-15, NFR-05
  - files: `apps/api/src/features/notifications/usecases/dispatch-push.ts`, `apps/api/src/features/notifications/infrastructure/fcm.sender.ts`, `apps/api/src/features/notifications/jobs/push-dispatch.worker.ts`
  - done when: `pnpm --filter api test -- dispatch-push` (sender FCM di-mock) dan `test:int -- push-dispatch` lulus: expiry check mengantrekan job `push-dispatch` terpisah per penerima dengan `retryLimit: 3`; 1 notifikasi baru → push dengan judul dan isi yang sama, dan data `{route:'member', memberId}`; lebih dari 1 → satu push ringkasan "<n> member perlu perhatian" per perangkat dengan data `{route:'notifications'}`; `pushEnabled=false` → tidak ada push, tetapi notifikasi in-app tetap ada; `registration-token-not-registered` → token dihapus; kegagalan FCM tidak menghapus notifikasi in-app; log hanya berisi ID

- [ ] T-040 Flutter notifications: badge, daftar, tandai dibaca, dan buka detail
  - layer: app · depends_on: T-037, T-026 · refs: FR-14
  - files: `apps/app/lib/features/notifications/{domain,data,presentation}/`, `apps/app/lib/features/notifications/notifications_feature.dart`, `apps/app/lib/features/members/presentation/pages/members_home_page.dart` (badge)
  - done when: `flutter test test/features/notifications` lulus: `bloc_test` untuk load list (sukses/gagal, paginasi), unread count, tap (mark read lalu navigasi ke `/members/{id}`), dan "Tandai semua dibaca" → count 0; badge di-refresh saat aplikasi dibuka atau kembali ke beranda; perilaku sama di web dan mobile

- [ ] T-041 Flutter push: FCM di mobile, registrasi token, pengaturan push, dan logout
  - layer: app · depends_on: T-038, T-040, T-015 · refs: FR-15, FR-01
  - files: `apps/app/lib/features/notifications/data/datasources/fcm_datasource.dart`, `apps/app/lib/features/notifications/domain/usecases/{register_device,unregister_device,set_push_enabled}.dart`, `apps/app/lib/features/notifications/presentation/pages/push_settings_page.dart`, `apps/app/lib/features/auth/presentation/bloc/auth_bloc.dart` (logout), `apps/app/lib/main.dart` (init FCM hanya jika `!kIsWeb`), `apps/app/android/`, `apps/app/ios/`
  - done when: `flutter test test/features/notifications/push` lulus: di web tidak ada permintaan izin atau panggilan `POST /device-tokens`; di mobile token didaftarkan dengan `platform` android/ios setelah izin diberikan dan didaftarkan ulang saat `onTokenRefresh`; izin ditolak → tidak ada registrasi dan pengaturan menampilkan "Izin notifikasi dimatikan di perangkat"; toggle memanggil `PATCH /me/settings`; logout memanggil `DELETE /device-tokens/{id}` sebelum sign out Firebase; tap push `member` membuka detail member dan push ringkasan membuka daftar notifikasi; cek manual di emulator Android dengan push uji dari Firebase Console

## Fase 4 — Pengerasan dan Rilis

- [ ] T-042 Matriks otorisasi dan isolasi gym untuk semua route
  - layer: test · depends_on: T-041, T-039 · refs: FR-06, NFR-01, NFR-02
  - files: `apps/api/test/authz/matrix.test.ts`, `apps/api/test/authz/isolation.test.ts`, `apps/api/test/authz/expected-access.ts`
  - done when: `pnpm --filter api test:int -- authz` lulus: setiap route terdaftar diuji tanpa token (401) serta dengan aktor owner, staff, staff inactive, dan tanpa gym, dengan hasil sesuai tabel akses PRD (staff → `FORBIDDEN_ROLE` di `POST /packages`, `GET /staff`, `GET /members/export`, `DELETE /members/{id}`, `PATCH /gym`; staff diizinkan di `POST /members`, `PATCH /members/{id}`, `POST /members/{id}/renewals`); route baru yang tidak ada di `expected-access.ts` membuat test gagal; setiap route ber-`{id}` diuji dengan resource milik gym lain → 404

- [ ] T-043 Container produksi, health check, HTTPS, dan build Flutter web
  - layer: infra · depends_on: T-042 · refs: NFR-03, NFR-11, NFR-12
  - files: `apps/api/Dockerfile`, `deploy/compose.prod.yml` (atau manifest platform), `deploy/README.md`, `apps/api/src/shared/http/middleware/https-only.ts`, `.github/workflows/release.yml`
  - done when: `docker build` untuk API sukses; container menjalankan `drizzle-kit migrate` sebelum start; `HEALTHCHECK` memakai `GET /health` dan container di-restart setelah 3 kegagalan berturut-turut (didemokan dengan mematikan DB); request HTTP di produksi ditolak atau di-redirect ke HTTPS (test middleware dengan `x-forwarded-proto`); `flutter build web --release` menghasilkan artefak untuk hosting statis; `flutter build apk` dengan `minSdk 26` dan `flutter build ios --no-codesign` dengan target iOS 15 sukses; deploy tercatat di `deploy/README.md`