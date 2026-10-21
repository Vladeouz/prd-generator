## Struktur repo

```
.
├── CLAUDE.md                  # aturan kerja agent
├── package.json               # script root: prereq, check, lint, format, contract:generate, contract:check, init-project
├── pnpm-workspace.yaml        # workspace apps/*, packages/*; allowBuilds
├── biome.json .editorconfig .gitattributes .nvmrc .env.example
├── docker-compose.yml docker/firebase-emulator/Dockerfile
├── firebase.json .firebaserc storage.rules
├── scripts/                   # prereq.mjs, check.mjs, contract.mjs, init-project.mjs
├── .github/workflows/ci.yml
├── docs/                      # PRD.md, TASKS.md, logs/ (proyek), conventions.md, template-build/
├── apps/api/                  # API Hono (lihat bagian API dan Clean Architecture API)
├── packages/contract/         # openapi.json + package Dart api_client (hasil generate)
└── apps/app/                  # Flutter (lihat bagian Flutter)
```

pnpm workspaces tanpa Turborepo (D-09). Paket: `api` (`apps/api`), `app` (`apps/app`, Flutter, bukan paket pnpm), dan `api_client` (`packages/contract/dart`, Dart).

## Job (pg-boss)

D-05: pg-boss berjalan di proses API, hanya bila `RUN_WORKER=true`. Implementasi di `apps/api/src/core/jobs/boss.ts`, contoh job di `apps/api/src/core/jobs/heartbeat.job.ts`.

- Satu job adalah `JobDefinition` (`name`, `handler`, `cron` opsional) yang dibuat fungsi `xxxJob(deps)` di file `<nama>.job.ts`, lalu didaftarkan di array `jobs` pada `startBoss()` di `src/server.ts`. Job milik fitur ditaruh di `features/<fitur>/jobs/`; `core/jobs` hanya untuk job sistem.
- Nama queue `<area>.<aksi>` (`system.heartbeat`). Jadwal cron 5 field, zona UTC (`*/5 * * * *`).
- `startBoss()` mengembalikan `null` tanpa membuka koneksi bila `runWorker` false. Bila true: start, lalu untuk setiap job `createQueue`, `schedule` (bila ada `cron`), dan `work`. Gagal di tengah jalan menghentikan pg-boss lalu melempar ulang error; `server.ts` keluar dengan exit code 1.
- pg-boss memakai pool sendiri dari `DATABASE_URL` dan schema `pgboss` (dibuat pg-boss, bukan migrasi Drizzle). Listener `error` selalu dipasang dan menulis ke log.
- Handler menerima array job (`Job<T>[]`) dan memakai logger yang diteruskan ke fungsi job, dengan field `job` dan `jobId`.

### Shutdown

`createShutdown()` di `apps/api/src/core/shutdown.ts`, dipasang untuk `SIGINT` dan `SIGTERM` di `src/server.ts`. Urutan:

1. `server.close()`: tolak koneksi baru dan tunggu request yang sedang berjalan. Koneksi keep-alive yang idle ditutup setiap 100 ms; tanpa itu Node menunggu `keepAliveTimeout` (beberapa detik).
2. `boss.stop({ graceful: true })`: tunggu job yang sedang berjalan.
3. Tutup koneksi lain di `closers` (pool database, firebase-admin). Koneksi baru yang perlu ditutup saat shutdown ditambahkan di sini.
4. `exit(0)`; bila ada langkah yang gagal, error dicatat, langkah berikutnya tetap jalan, dan exit code 1. Sinyal kedua tidak memulai shutdown baru.

Test: `test/int/jobs/boss.int.test.ts` (start, jadwal, job diproses, `RUN_WORKER` mati), `test/int/jobs/shutdown.int.test.ts` (urutan dengan server HTTP dan pg-boss sungguhan, fungsi shutdown dipanggil langsung tanpa sinyal). Koneksi pg-boss di `pg_stat_activity` memakai `application_name` `pgboss:<id>`.

## Autentikasi

- Semua route `/v1/*` dilindungi middleware `authenticate` (`apps/api/src/core/auth/authenticate.ts`) yang dipasang sekali di `app.ts` (`app.use('/v1/*', …)`); route tidak memasang auth sendiri. Route publik hanya di luar `/v1` dan wajib didaftarkan di `PUBLIC_ROUTES` pada `test/int/security/all-routes-require-auth.int.test.ts`.
- Header `Authorization: Bearer <ID token>`. Header tidak ada atau bukan Bearer → `401` `Missing bearer token`; token tidak valid, kedaluwarsa, atau untuk project lain → `401` `Invalid or expired token`. Kegagalan verifikasi yang bukan kesalahan token (`auth/internal-error`, misalnya sertifikat Google tidak bisa diambil) → `500`.
- Penolakan token dicatat `authenticate` di level `warn` dengan pesan `rejected ID token` dan field `reason` berisi kode error firebase-admin (`auth/id-token-expired`, `auth/argument-error`, `auth/id-token-revoked`, …), agar penyebab `401` bisa didiagnosis dari log. Hanya `code` yang dicatat, tidak pernah token, klaimnya, atau `message` firebase-admin (pesan itu bisa mengutip klaim `aud`/`iss`/`sub`). Header yang tidak ada atau bukan Bearer tidak dicatat. Dijaga `test/unit/core/auth/authenticate.test.ts` dan `test/int/users/me.int.test.ts` › mencatat kode error firebase-admin.
- Verifikasi lewat port `TokenVerifier` (`core/auth/firebase-admin.ts`), implementasinya `createFirebaseTokenVerifier(auth)`. `verify(token)` mengembalikan `{ ok: true, identity }` atau `{ ok: false, reason }` (token ditolak, `reason` = kode error firebase-admin); `auth/internal-error` dan error selain `FirebaseAuthError` dilempar ulang (→ `500`). firebase-admin diinisialisasi dengan `projectId` saja (tanpa service account) lewat `createFirebaseAdmin(projectId)` dengan nama app unik.
- Setelah token valid, use case `syncUser` (`features/users/usecases/sync-user.ts`) melakukan upsert `users` (`ON CONFLICT (firebase_uid)`) dengan email lowercase, `display_name` dari klaim `name`, dan `last_seen_at`; token adalah sumber kebenaran email dan nama. Hasilnya tersedia di handler sebagai `c.var.user` (entity `User`).
- Route terautentikasi memakai `security: bearerSecurity` dan `401: errorResponse(…)` di `createRoute`. Contoh: `apps/api/src/features/users/http/me.route.ts`.

## Port push dan storage

D-06: layanan luar yang tidak punya emulator atau aturannya berbeda per proyek dipakai lewat port (interface) di `apps/api/src/core/ports/`, dengan adapter di `core/ports/adapters/`. Use case hanya mengimpor port, tidak pernah firebase-admin.

- Adapter `none` (`adapters/none.ts`) adalah default bila env adapter tidak di-set: server tetap start, tetapi setiap pemakaian port melempar `PortNotConfiguredError` yang menyebut env yang harus di-set (`PushSender is not configured: set PUSH_ADAPTER to fcm or fake`). Di route, error ini menjadi `500 INTERNAL_ERROR` dan pesannya tercatat di log. Proyek yang tidak memakai push atau storage cukup membiarkannya `none`.
- Adapter `fake` hanya untuk development dan test; `loadEnv()` menolaknya bila `NODE_ENV=production` (sama seperti host emulator), sehingga server tidak start.
- `PushSender.send({ token, title, body, data? })` (`push-sender.ts`) → `{ status: 'sent', messageId }` atau `{ status: 'invalid-token' }` (token tidak terdaftar atau formatnya salah; pemanggil menghapus token itu). Kegagalan lain dilempar. Adapter: `fake-push.ts` (mencatat pesan di `sent`, `markInvalid(token)` untuk mensimulasikan token mati) dan `fcm-push.ts` (firebase-admin messaging; tidak ada emulator FCM, jadi hanya diuji dengan mock; di produksi butuh Application Default Credentials).
- `FileStorage` (`file-storage.ts`): `save(path, data, { contentType })` menimpa file lama, `read(path)` → `{ data, contentType }` atau `null`, `delete(path)` tidak error bila file tidak ada. Adapter: `fake-storage.ts` (di memori, `paths()` untuk test) dan `firebase-storage.ts` (bucket firebase-admin; memakai Storage Emulator bila `FIREBASE_STORAGE_EMULATOR_HOST` di-set). Akses lewat firebase-admin tidak terikat `storage.rules`.
- Path file relatif dengan segmen dipisah `/` (`users/<id>/avatar.png`), divalidasi `assertValidFilePath` di setiap adapter: tanpa `/` di awal atau akhir, segmen kosong, `.`/`..`, backslash, karakter kontrol, maksimal 1024 karakter. Path tidak valid → `InvalidFilePathError` sebelum ada request ke Storage.
- Adapter dipilih dari env oleh `createPorts(env, firebaseApp)` (`core/ports/create-ports.ts`) di `src/server.ts`, lalu masuk ke `createApp` lewat `AppDeps.ports` untuk dirakit ke use case. Klien firebase-admin hanya dibuat untuk adapter yang dipakai. Server mencatat adapter yang dipilih di log `API listening`.
- Test: `createTestApp()` memakai kedua adapter palsu; test yang perlu memeriksa pesan atau file memberi `ports` sendiri. Integration test Storage Emulator di `test/int/ports/firebase-storage.int.test.ts` memakai prefix acak per run dan menghapus file-nya sendiri (emulator tidak dibersihkan).
- Layanan luar baru (email, SMS, pembayaran) mengikuti pola yang sama: port + adapter `none` (default, melempar saat dipakai) + adapter `fake` (ditolak di produksi) + adapter sungguhan + pilihan `XXX_ADAPTER` di env.

## Pagination

Helper di `apps/api/src/core/http/pagination.ts`. Contoh route: `listNotesRoute` di `apps/api/src/features/notes/http/notes.route.ts`; contoh repository: `listByUser` di `features/notes/infrastructure/drizzle-note-repository.ts`.

- Query `?limit=20&cursor=<opaque>`: pakai `PaginationQuerySchema` sebagai `request.query`, atau `PaginationQuerySchema.extend({ ... })` bila route punya filter. `limit` 1–100, default 20. Handler menerima `cursor` yang sudah di-decode (`{ createdAt, id }` atau `undefined`).
- Cursor rusak → `422 VALIDATION_ERROR` dengan `details.cursor` (`custom`, `Invalid cursor`). Hanya bentuk kanonis hasil `encodeCursor` yang diterima.
- Respons `{ items, nextCursor }` dengan skema `pageSchema(ItemSchema, '<Item>Page')`; nama kedua menjadi nama komponen OpenAPI dan kelas Dart. `nextCursor` `null` di halaman terakhir.
- Cursor adalah base64url dari `createdAt|id`, urutan `created_at DESC, id DESC`. Repository mengambil `limit + 1` baris dengan kondisi `(created_at, id) < (cursor.createdAt, cursor.id)`, lalu `buildPage(rows, limit, positionOf)` membuang baris tambahan dan membentuk `nextCursor`.
- **Presisi timestamp.** Semua timestamp berpresisi milidetik (lihat Database), sama dengan `Date`, jadi repository memberi `positionOf` nilai `createdAt` (`Date`) dari baris apa adanya dan membandingkan `(created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)`. Baris yang jatuh di milidetik yang sama diurutkan `id DESC` tanpa duplikat (dijaga `test/int/notes/notes.int.test.ts` › tidak ada duplikat bila beberapa note jatuh di milidetik yang sama). Decoder cursor tetap menerima 0–6 digit pecahan.
- Index pagination per pemilik: `index(...).on(table.userId, table.createdAt.desc().nullsFirst(), table.id.desc().nullsFirst())`. `nullsFirst()` wajib: tanpa itu Drizzle menulis `DESC NULLS LAST`, yang tidak cocok dengan `ORDER BY ... DESC`, sehingga PostgreSQL tetap melakukan `Sort` (dicek dengan `EXPLAIN` di `test/int/notes/notes-schema.int.test.ts`).
- Jangan menambah `.openapi()` pada `limit`: override itu menghapus `minimum`, `maximum`, dan `default` dari OpenAPI (dijaga test).

## Database

- Drizzle ORM + `pg` (node-postgres). Skema di `apps/api/src/db/schema/`, satu file per tabel, diekspor ulang dari `schema/index.ts`. Contoh: `apps/api/src/db/schema/users.ts`.
- Tabel snake_case jamak; properti TypeScript camelCase dengan nama kolom ditulis eksplisit (`firebaseUid: text('firebase_uid')`).
- Kolom bersama dari `schema/columns.ts`: `id()` (`uuid` default `gen_random_uuid()`), `createdAt()`, `updatedAt()` (`$onUpdate`, hanya berlaku lewat `db.update()` Drizzle), `timestamptz(nama)` untuk timestamp lain. Kolom `date` memakai `mode: 'string'`.
- **Timestamp yang ditulis server diisi jam database (`now()`), tidak pernah `new Date()` host.** `defaultNow()` dan `$onUpdate(() => sql\`now()\`)` di `updatedAt()` memakai jam yang sama, jadi `updated_at` tidak pernah lebih kecil dari `created_at` atau nilai sebelumnya walau jam host API dan database berselisih. Hal yang sama berlaku untuk `set` manual (`updatedAt: sql\`now()\``, contoh: `apps/api/src/features/users/infrastructure/drizzle-user-repository.ts`) dan SQL mentah. Di dalam transaksi `now()` bernilai tetap (waktu mulai transaksi). Dijaga `test/int/db/schema.int.test.ts` › updated_at dari update() Drizzle memakai now() database.
- **Semua timestamp presisi milidetik:** `timestamptz(3)` dengan `mode: 'date'`, selalu lewat helper di `schema/columns.ts`, tidak pernah `timestamp(...)` langsung. `Date` di JavaScript hanya milidetik, jadi nilai di database, entity, respons API, dan cursor pagination selalu sama persis; nilai yang lebih presisi dibulatkan PostgreSQL ke milidetik. Dijaga `test/int/db/schema.int.test.ts` › semua kolom timestamp di schema public berpresisi milidetik (tabel baru otomatis ikut diperiksa). Akibatnya dua penulisan bisa mendapat timestamp yang sama: test yang membandingkan `updated_at` sebelum dan sesudah update mengisi nilai awal di masa lalu, bukan mengandalkan `toBeGreaterThan` antara dua `now()`.
- Constraint dan index diberi nama eksplisit `<tabel>_<kolom>_<jenis>` (`users_firebase_uid_unique`, `users_email_lowercase_check`, `notes_title_length_check`, `notes_user_id_fk`, `notes_user_id_created_at_id_index`) agar test dan penanganan error bisa merujuknya. Foreign key ditulis dengan `foreignKey({ name, columns, foreignColumns })`, bukan `.references()`, karena nama bawaan Drizzle tidak mengikuti pola ini. Enum ditulis sebagai `text` + `check`. Contoh: `apps/api/src/db/schema/notes.ts`.
- Data milik user memakai `user_id` FK ke `users.id` `ON DELETE CASCADE`. Batas panjang teks ditegakkan dengan CHECK `char_length(...)` selain skema Zod route; batas Zod sama atau lebih ketat (Zod menghitung UTF-16 code unit, `char_length` menghitung karakter), jadi input yang lolos Zod tidak pernah melanggar CHECK.
- Migrasi: ubah skema → `pnpm --filter api db:generate --name <ringkas>` → commit file `apps/api/drizzle/NNNN_<ringkas>.sql` beserta `meta/`. Migrasi yang sudah di-commit tidak diedit. `db:generate` tanpa perubahan skema harus mencetak `No schema changes`.
- `pnpm --filter api db:migrate` (`src/db/migrate.ts`) menerapkan migrasi ke `DATABASE_URL`; idempoten. Hanya butuh `DATABASE_URL` (`loadDatabaseUrl()`), bukan seluruh env server.
- Koneksi dibuat lewat `createDb(url)` dari `src/db/client.ts` (mengembalikan `{ db, pool, close }`).
- Tabel pg-boss ada di schema `pgboss`, dikelola pg-boss sendiri, bukan lewat migrasi Drizzle.

## Format error

Implementasi di `apps/api/src/core/http/errors.ts` dan `error-codes.ts`. Semua error memakai satu bentuk:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": { "title": [ { "code": "too_small", "message": "Too small: expected string to have >=1 characters" } ] } } }
```

| ErrorCode | HTTP | Kapan |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | JSON rusak atau request tidak bisa diproses |
| `UNAUTHENTICATED` | 401 | Header `Authorization` tidak ada, token tidak valid, atau kedaluwarsa |
| `FORBIDDEN` | 403 | User terautentikasi tetapi tidak berhak (aturan peran di proyek) |
| `NOT_FOUND` | 404 | Resource tidak ada, atau milik user lain (D-07) |
| `CONFLICT` | 409 | Pelanggaran keunikan atau state |
| `VALIDATION_ERROR` | 422 | Validasi Zod gagal pada body, path, atau query |
| `INTERNAL_ERROR` | 500 | Error tak terduga; pesan asli tidak pernah dikirim ke client |

`code` stabil dan menjadi dasar teks untuk user di Flutter (D-03). Daftar `ErrorCode` diekspor ke OpenAPI sebagai enum, sehingga client Dart punya daftar yang sama. Kode baru ditambahkan ke `error-codes.ts` (beserta status HTTP-nya), lalu `pnpm contract:generate`, lalu dipetakan di `failureCodeOf` dan `failure_messages.dart` di Flutter.

- Lempar `new AppError('NOT_FOUND', 'Note not found')` dari use case atau middleware; status HTTP diturunkan dari `code`. `message` bahasa Inggris untuk developer. `AppError` tidak membawa `details`.
- `details` hanya untuk `VALIDATION_ERROR` (`ValidationError`). Validasi Zod di route ditangani otomatis oleh `defaultHook`; validasi manual di luar route memakai `new ValidationError(validationDetails(issues, input))`.
- Kunci `details`: path digabung titik (`items.0.name`), `_root` bila tanpa path (body bukan objek, `refine` di level objek). Nilai: array `{ code, message }` dengan kode issue Zod (`invalid_type`, `too_small`, `too_big`, `invalid_format`, `custom`, …), kecuali field yang tidak dikirim (`undefined` di input mentah) memakai `{ code: 'required', message: 'Required' }`. Field yang dikirim `null` tetap `invalid_type`.
- `HTTPException` 4xx dari Hono dipetakan ke `ErrorCode` menurut status (JSON rusak → `400 BAD_REQUEST`; 4xx lain yang tidak ada di daftar → `BAD_REQUEST`). Error lain dan 5xx → `500 INTERNAL_ERROR` dengan pesan umum; error aslinya dicatat di log.
- Respons error di OpenAPI memakai `errorResponse('deskripsi')` agar semua route merujuk komponen `ErrorBody` → `ApiError` → `ErrorIssue`, `ErrorCode`.

## Clean Architecture API

Contoh lengkap: `apps/api/src/features/notes/` (fitur CONTOH yang ditiru lalu dihapus di proyek).

```
features/<fitur>/
├── domain/<entity>.ts                         # entity, input, interface repository; tanpa import Hono/Drizzle
├── usecases/<aksi>-<entity>.ts                # satu use case per file
├── infrastructure/drizzle-<entity>-repository.ts
└── http/<fitur>.route.ts                      # skema Zod, createRoute, DTO, registerXxxRoutes
```

- Arah dependency: `http` → `usecases` → `domain` ← `infrastructure`. Use case hanya mengimpor `domain`, `AppError` (`core/http/errors.ts`), port (`core/ports`), dan tipe `Page`/`CursorPosition` (`core/http/pagination.ts`); tidak pernah Hono, Drizzle, atau firebase-admin.
- Use case adalah fungsi pabrik `xxxNote({ notes })` yang mengembalikan fungsi, dengan tipe `export type XxxNote = ReturnType<typeof xxxNote>`. Dependency (repository, port, `now`) masuk lewat objek pertama agar test bisa memberi versi palsu. Contoh: `features/notes/usecases/get-note.ts`.
- Entity domain memakai `Date` untuk timestamp. Konversi ke JSON (`toISOString()`, membuang field internal seperti `userId`) hanya di `http` lewat fungsi `toXxxDto`.
- Repository dibatasi pemilik: setiap metode menerima `userId` dan memfilter `user_id` di query yang sama (bukan ambil dulu lalu cek), lalu mengembalikan `null`/`false` bila tidak ada atau milik user lain. Use case mengubahnya menjadi `AppError('NOT_FOUND', ...)` (D-07: `404`, bukan `403`).
- `createApp()` di `src/app.ts` adalah composition root: buat repository dari `db`, rakit use case, lalu `registerXxxRoutes(app, { ...useCases })`. Route menerima use case lewat parameter, bukan membuatnya sendiri.
- Route: path param `id` divalidasi `z.uuid()` (bukan UUID → `422 details.id`); body POST/PATCH memakai `request.body.required: true`; PATCH memakai skema dengan semua field opsional + `.refine()` minimal satu field (→ `details._root`); `DELETE` mengembalikan `c.body(null, 204)`. Skema request dan respons diberi nama `.openapi('Note')`, `'CreateNoteInput'`, `'UpdateNoteInput'`, `'NotePage'`.
- Teks wajib yang tidak boleh kosong memakai `.trim()` sebelum `.min()`/`.max()` (`z.string().trim().min(1).max(TITLE_MAX)`): teks berisi spasi saja → `422` `too_small`, nilai yang disimpan sudah dirapikan, dan panjang dihitung setelah dirapikan. Contoh: `Title` di `features/notes/http/notes.route.ts`, dijaga `test/int/notes/notes.int.test.ts`.

### Pola lanjutan API (belum ada file contoh di template)

Ditemukan saat fitur proyek pertama dibangun dari template; fitur notes tidak memakainya. Proyek yang pertama memakai pola ini mencatat filenya di sini sebagai file contoh.

- **Pelanggaran keunikan → `409 CONFLICT`.** Keunikan ditegakkan constraint database bernama (`<tabel>_<kolom>_unique`, misalnya unique index `(user_id, lower(name))` untuk nama unik per user tanpa membedakan huruf besar-kecil), bukan cek "ambil dulu lalu insert" yang rawan balapan. Repository menangkap SQLSTATE `23505` dengan nama constraint itu dan melempar error domain yang didefinisikan di `domain/<entity>.ts`; use case mengubahnya menjadi `AppError('CONFLICT', …)`. Repository tidak mengimpor `AppError`, dan use case tidak mengenal kode PostgreSQL. Error lain dilempar ulang apa adanya. Interface repository di `domain/` menyebut error itu di komentar metodenya.

  ```ts
  // domain/<entity>.ts
  export class ItemNameTakenError extends Error {
    constructor() {
      super('Item name already exists');
      this.name = 'ItemNameTakenError';
    }
  }

  // infrastructure/drizzle-<entity>-repository.ts: bungkus insert dan update.
  // Drizzle membungkus error `pg` di `cause`.
  async function mapNameTaken<T>(query: PromiseLike<T>): Promise<T> {
    try {
      return await query;
    } catch (error) {
      const pg = (error as { cause?: unknown }).cause ?? error;
      const { code, constraint } = pg as { code?: string; constraint?: string };
      if (code === '23505' && constraint === 'items_user_id_name_unique') {
        throw new ItemNameTakenError();
      }
      throw error;
    }
  }

  // usecases/create-<entity>.ts
  try {
    return await items.create(input);
  } catch (error) {
    if (error instanceof ItemNameTakenError) throw new AppError('CONFLICT', 'Item name already exists');
    throw error;
  }
  ```

  Test: unit test use case dengan repository palsu yang melempar error domain yang sama; integration test untuk tambah dan ubah dengan nama yang sudah ada → `409`, termasuk beda huruf besar-kecil bila berlaku. Di Flutter, `CONFLICT` sampai sebagai `FailureCode.conflict` (lihat Teks kegagalan khusus fitur di field).
- **Endpoint aksi non-CRUD** (aksi atas banyak resource sekaligus, misalnya "hapus semua yang selesai"): `POST /v1/<resource>/<aksi>` dengan aksi kebab-case, `operationId` kata kerja camelCase (`clearDoneItems`). Respons skema bernama `<Operasi>Result` dengan huruf pertama kapital (`.openapi('ClearDoneItemsResult')`, berisi misalnya `{ deletedCount }`), sehingga kelas Dart-nya bernama sama. Aksi yang tidak menemukan apa pun tetap `200` (idempoten, `deletedCount: 0`), bukan `404`. Route tanpa body dan tanpa param hanya mendokumentasikan `401`. Repository menjalankan aksi dalam satu query yang dibatasi pemilik (`DELETE … WHERE user_id = $1 AND … RETURNING id`).

### Aturan bisnis: API vs client

- Aturan bisnis (wajib diisi, batas panjang, keunikan, hak akses, minimal satu field) ditegakkan di API: skema Zod route, use case, dan constraint database. API adalah satu-satunya sumber kebenaran dan harus aman walau client mengirim input apa pun.
- Client (Flutter) boleh menormalisasi input sebelum dikirim (misalnya `trim` judul atau email) dan boleh menampilkan validasi lokal yang sama dengan API untuk umpan balik cepat, tetapi **tidak boleh lebih ketat dari API**: input yang diterima API tidak boleh ditolak client. Bila aturan berubah, ubah API dulu; error validasi API (`details`) tetap ditampilkan per field.

### Organisasi dan tenancy (pola, belum ada di template)

D-11: template hanya mengenal "user yang login" dengan data milik user (`notes.user_id`). Proyek yang butuh organisasi, tim, atau peran memakai pola berikut. Belum ada file contohnya; tiru fitur notes dengan `user_id` diganti `organization_id`, dan catat implementasi pertamanya di sini sebagai file contoh.

- Tabel `organizations` (`id`, `name`, timestamp) dan `memberships` (`organization_id` dan `user_id`, keduanya FK `ON DELETE CASCADE`; `role` sebagai `text` + CHECK, misalnya `owner`/`admin`/`member`; UNIQUE `(organization_id, user_id)`). Data milik organisasi memakai `organization_id` FK `ON DELETE CASCADE`, dengan index pagination `(organization_id, created_at DESC, id DESC)`.
- Path bersarang `/v1/organizations/{organizationId}/<resource>`, sehingga tetap di bawah `authenticate`. Middleware keanggotaan di `/v1/organizations/:organizationId/*` membaca membership user login dan menaruhnya di context (`c.var.membership`); `organizationId` yang bukan UUID → `422 details.organizationId`.
- Bukan anggota → `404 NOT_FOUND` (sama dengan resource milik user lain, D-07). Anggota dengan peran yang tidak cukup → `403 FORBIDDEN`. Pemeriksaan peran ada di use case (`AppError('FORBIDDEN', …)`), bukan di route, agar teruji di unit test.
- Repository dibatasi organisasi dengan cara yang sama seperti dibatasi pemilik: setiap metode menerima `organizationId` dan memfilternya di query yang sama.
- Integration test minimal: bukan anggota → `404`, peran kurang → `403`, anggota organisasi lain tidak melihat data. Route baru otomatis diperiksa `all-routes-require-auth.int.test.ts`.
- Organisasi "aktif" di Flutter disimpan di state presentation (bukan di token) dan dikirim sebagai path, bukan header.