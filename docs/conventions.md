# Konvensi Proyek

Rujukan konvensi untuk manusia dan agent. Melengkapi bagian 3 PRD (`docs/PRD.md`); bila bertentangan, PRD yang berlaku. Konvensi baru ditambahkan di sini bersamaan dengan kode yang pertama memakainya, beserta file contohnya. Dokumen ini masih kerangka (T-001) dan dilengkapi di T-019.

## Struktur repo

Lihat pohon folder di bagian 3 PRD. Proyek satu paket pnpm tanpa workspace; `pnpm-workspace.yaml` hanya berisi pengaturan pnpm (`allowBuilds`).

## Prasyarat lingkungan

Diperiksa `pnpm prereq` (`scripts/prereq.mjs`, logikanya di `scripts/lib/prereq-checks.mjs`), yang menampilkan tabel status beserta saran perbaikan dan tidak pernah membuat atau mengubah file. Semua wajib: Node.js 24, pnpm versi `packageManager`, Git, perintah `claude`, file `.env`, dan `TEMPLATE_DIR` (path absolut ke folder yang berisi `docs/conventions.md` dan `scripts/init-project.mjs`). `TEMPLATE_DIR` dari variabel lingkungan proses menang atas `.env`, sama dengan Next.js. Login Claude Code hanya disebut sebagai pengingat. Prasyarat baru ditambahkan ke `prereq-checks.mjs`, test-nya, dan tabel Prasyarat di `README.md`.

## Versi yang dipin

Library dipin ke versi pasti (tanpa `^` atau `~`) saat pertama dipasang, lalu dicatat di sini.

| Komponen | Versi | Dipin di |
| --- | --- | --- |
| Node.js | 24 (`.nvmrc`), `engines.node` `>=24 <25` | T-001 |
| pnpm | 12.6.0 (`packageManager`) | T-001 |
| `next` | 16.4.0 | T-001 |
| `react`, `react-dom` | 19.3.0 | T-001 |
| `typescript` | 7.0.2 | T-001 |
| `@types/node` | 24.19.2 (mengikuti Node 24) | T-001 |
| `@types/react`, `@types/react-dom` | 19.3.0 | T-001 |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.3 | T-001 |
| `@biomejs/biome` | 2.5.15 | T-001 |
| `vitest` | 5.0.3 | T-001 |
| `better-sqlite3` | 13.0.3 (SQLite 3.53.4) | T-003 |
| `drizzle-orm` | 0.45.4 | T-003 |
| `drizzle-kit` | 0.31.11 | T-003 |
| `@types/better-sqlite3` | 9.6.0 | T-003 |
| `zod` | 4.6.5 | T-004 |

Pasang dengan `pnpm add -E <nama>` (atau `-D -E`) agar versi langsung pasti. Paket yang butuh build script saat install didaftarkan di `allowBuilds` pada `pnpm-workspace.yaml` (saat ini `esbuild`, dipakai drizzle-kit); tanpa itu pnpm 12 keluar dengan `ERR_PNPM_IGNORED_BUILDS`. Build script yang tidak dibutuhkan didaftarkan dengan nilai `false` beserta alasannya di komentar: `better-sqlite3` 13 membawa binary prebuilt yang dimuat lebih dulu, sedangkan build script-nya hanya `node-gyp rebuild` yang butuh Python dan compiler C++. Jangan biarkan nilai placeholder `set this to true or false` yang ditulis pnpm.

pnpm 12 menolak versi yang rilis kurang dari sehari (`minimumReleaseAge`). Bila `pnpm add` menambah `minimumReleaseAgeExclude` ke `pnpm-workspace.yaml`, batalkan perubahan itu dan pin versi sebelumnya; jangan melonggarkan policy.

## Git

- Branch `<type>/t-xxx-<ringkas>`, type: `feat`, `fix`, `chore`, `docs`, `test`.
- Commit `<type>: <ringkasan> (T-xxx)`.
- Merge ke `master` dilakukan user setelah meninjau hasil.
- `.gitattributes` memaksa LF untuk semua file teks, kecuali `*.bat` dan `*.cmd` (CRLF). `.editorconfig` mengikuti aturan yang sama.

## Script dan perintah root

| Script | Isi |
| --- | --- |
| `pnpm prereq` | Memeriksa prasyarat lingkungan |
| `pnpm check` | Satu-satunya perintah verifikasi (lihat di bawah) |
| `pnpm dev` | `next dev` di `127.0.0.1` |
| `pnpm build`, `pnpm start` | Build produksi, lalu menjalankannya di `127.0.0.1` |
| `pnpm lint`, `pnpm format` | Biome: periksa, atau perbaiki otomatis |
| `pnpm typecheck` | `next typegen` lalu `tsc --noEmit` |
| `pnpm test:unit` | Vitest, `test/unit/**/*.test.ts` |
| `pnpm test:int` | Vitest, `test/int/**/*.int.test.ts` (`vitest.int.config.ts`) |
| `pnpm claude:smoke` | Satu pemanggilan `claude` sungguhan dengan prompt kecil (memakai kuota; hanya untuk verifikasi manual) |
| `pnpm db:generate` | `drizzle-kit generate`: membuat migrasi di `drizzle/` dari `src/core/db/schema.ts` |

- Semua script otomatisasi ditulis dalam Node (`.mjs`) di `scripts/`, bukan shell. Nama file sama dengan nama script-nya (`pnpm prereq` → `scripts/prereq.mjs`); modul pendukung di `scripts/lib/`.
- Script memanggil perintah eksternal lewat `spawnSync(perintah, { shell: true })` agar `pnpm.cmd`, `claude.cmd`, dan sejenisnya ditemukan di Windows.
- Nama script tidak boleh sama dengan perintah bawaan pnpm (misalnya `test`, `init`, `doctor`), karena perintah bawaan selalu menang. Cek dengan `pnpm help <nama>`: bila keluar `unrecognized subcommand`, nama itu aman. Pengecualian: `start`, karena perintah bawaan `pnpm start` memang menjalankan `scripts.start`. Karena itu unit test memakai `test:unit`, bukan `test`.
- Server (`dev`, `start`) selalu dengan `--hostname 127.0.0.1` (NFR-01).

### `pnpm check`

`scripts/check.mjs` menjalankan Biome, typecheck, unit test, dan integration test berurutan (end-to-end ditambahkan di T-017). Semua langkah selalu dijalankan walaupun ada yang gagal; ringkasan di akhir menampilkan status dan waktu per langkah, dan output lengkap langkah yang gagal disimpan di `.check-logs/<waktu run>/` (di-ignore Git). Langkah verifikasi baru ditambahkan ke `STEPS`. Harus hijau sebelum task dicentang.

## Lint dan format (Biome)

- Konfigurasi `biome.json`, sama dengan template: preset `recommended`; spasi 2, lebar baris 100, LF, kutip tunggal, titik koma selalu.
- Biome membaca `.gitignore`. Dikecualikan lewat `files.includes`: `docs/reference/` (bahan rujukan apa adanya) dan `drizzle/meta` (format ditentukan drizzle-kit, agar tidak bentrok saat di-generate ulang).

## TypeScript dan Next.js

- `strict` + `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`import type` untuk tipe), alias `@/*` → `src/*`.
- Import relatif selalu dengan ekstensi file sumbernya (`./schema.ts`, `./status-panel.tsx`), dipaksa Biome (`useImportExtensions`) dan diizinkan `allowImportingTsExtensions`. Dengan begitu modul di `src/` bisa dijalankan Node 24 langsung (type stripping), misalnya `node src/claude/smoke.ts`, tanpa tsx. Akibatnya, kode yang mungkin dijalankan Node langsung tidak boleh memakai sintaks TypeScript yang perlu ditransformasi (`enum`, `namespace`, parameter property di constructor). `next typegen` / `next dev` menambah `esModuleInterop` ke `tsconfig.json` bila belum ada; biarkan.
- File `.mjs` di `scripts/` ikut di-typecheck (`allowJs`); tipe parameter yang tidak bisa disimpulkan ditulis dengan JSDoc (contoh: `scripts/lib/prereq-checks.mjs`).
- `next.config.ts` memakai `agentRules: false`, karena tanpa itu `next dev` 16.4 membuat `AGENTS.md` di root. Aturan agent hanya di `CLAUDE.md`.
- Styling dengan Tailwind CSS 4 lewat `@tailwindcss/postcss` (`postcss.config.mjs`, `src/app/globals.css`).

## Database

- SQLite lewat `better-sqlite3` + Drizzle. Skema di `src/core/db/schema.ts`, migrasi SQL hasil `pnpm db:generate` di `drizzle/` (di-commit, termasuk `meta/`; jangan diedit tangan). Setelah mengubah skema, jalankan `pnpm db:generate --name <ringkas>`; integration test `migrations.int.test.ts` gagal bila skema dan migrasi tidak sinkron.
- Database utama `data/prd-generator.db` (di-ignore Git), dibuka lewat `getDb()` di `src/core/db/client.ts`. Koneksinya disimpan di `globalThis` agar hot reload tidak membuka koneksi baru (temuan spike T-002). `getDb()` melempar error saat `NODE_ENV=test`.
- `openDatabase(path)` menyalakan `foreign_keys` (wajib per koneksi agar cascade berjalan), WAL, dan `busy_timeout`, lalu menjalankan migrasi yang belum diterapkan. Migrasi idempoten, jadi aman dipanggil setiap kali aplikasi membuka database.
- Setiap kolom enum dibatasi CHECK. Daftar nilainya diekspor dari `schema.ts` (`STAGES`, `JOB_STATUSES`, dll.) untuk dipakai ulang oleh Zod; jangan menulis ulang daftarnya. Aturan "satu baris aktif" memakai partial unique index (contoh: `jobs_one_active_idx` pada ekspresi `(1)` dengan `WHERE status in ('queued', 'running')`).
- Id (`text`) dan timestamp (ISO 8601 UTC) diisi aplikasi, tanpa default di database.
- drizzle-kit 0.31 di Windows salah menangani `--out` dengan path absolut dan tetap keluar dengan exit 0; pakai path relatif dan periksa pesannya.

## Route handler dan halaman

- Logika route handler ada di modul domain sebagai pabrik dengan dependensi yang disuntikkan, misalnya `projectHandlers({ db, clock })` di `src/projects/handlers.ts`. File `src/app/api/**/route.ts` hanya menyambungkan `getDb()` dan `systemClock`. Test route handler memanggil pabrik itu dengan `createTestDb()` dan objek `Request` biasa (contoh: `test/int/projects/projects-api.int.test.ts`).
- Setiap handler dibungkus `handle()` (`src/core/http.ts`). Body dibaca dengan `parseBody(request, skemaZod)`: bukan JSON → 400, tidak lolos → 422 dengan `details` berisi pesan pertama per field (`{ idea: 'Ide wajib diisi.' }`). Pesan Zod ditulis dalam Bahasa Indonesia di skemanya, dan skema yang sama dipakai form (`src/projects/schema.ts`).
- JSON respons memakai nama field Drizzle (camelCase).
- Halaman yang membaca database adalah server component dengan `export const dynamic = 'force-dynamic'` yang memanggil fungsi domain langsung (bukan lewat `fetch` ke API sendiri). Tampilannya komponen murni (`*-view.tsx`) yang di-test dengan `renderToStaticMarkup`. Komponen klien yang memakai `useRouter` di-test dengan `vi.mock('next/navigation')`.
- Mutasi dari UI memakai komponen klien yang memanggil API, lalu `router.push`/`router.refresh`.
- Nama tahap untuk UI dari `STAGE_LABELS` (`src/projects/stage-labels.ts`); angka token diformat `id-ID` (`src/app/projects/format.ts`).

## Error, jam, dan job

- Error domain memakai `AppError` (`src/core/errors.ts`) dengan kode format error PRD bagian 5. `status` memberi status HTTP-nya, dan `toBody()` menghasilkan `{ error: { code, message, details? } }`. Pesan dalam Bahasa Indonesia dan siap ditampilkan ke user.
- Timestamp hanya dari `Clock` (`src/core/clock.ts`, `systemClock` di aplikasi), yang disuntikkan ke modul yang menyimpan waktu. Test memakai jam tetap. Jangan memanggil `new Date()` untuk kolom database.
- Job tahap dijalankan `JobQueue` (`src/jobs/job-queue.ts`) di proses server (D-03). Instance tunggalnya `getJobQueue()` (`src/jobs/instance.ts`), disimpan di `globalThis`. `src/instrumentation.ts` menandai job aktif dari proses sebelumnya sebagai `interrupted` sekali saat server start, dan tidak berjalan saat `next build`.
- Tahap didefinisikan sebagai `StageDefinition` (`src/stages/run-stage.ts`): `stage`, `promptVersion`, `buildPrompt`, `parse`, `validate`, lalu didaftarkan di `stageRegistry` (`src/jobs/instance.ts`). `runStage` menangani percobaan ulang sekali dengan daftar error (D-08) dan pencatatan `stage_runs`; definisi tahap tidak menulis `stage_runs` sendiri.
- Kegagalan runner (`ClaudeRunError`) tidak dicoba ulang: job `failed` dengan pesan runner, dicatat sebagai `stage_runs` gagal tanpa output, dan output tahap yang berlaku sebelumnya tetap berlaku. Hanya kegagalan parse dan validasi yang dicoba ulang.
- Kelas error yang melintasi graf modul (`AppError`, `ClaudeRunError`, `StageFailedError`) dikenali lewat penanda `Symbol.for` dan `static [Symbol.hasInstance]` (`brandedInstanceCheck` di `src/core/errors.ts`). Next.js membundel `instrumentation.ts`, yang membuat antrean job, terpisah dari route, sehingga `instanceof` biasa gagal dan 409 berubah menjadi 500 (ditemukan di T-008). Kelas error baru yang bisa dilempar dari antrean mengikuti pola ini. Test: `test/unit/core/errors.test.ts` (salinan modul lewat `import('…?salinan-lain')`).
- Contoh test: `test/int/jobs/job-queue.int.test.ts` (runner palsu, fixture nyata, `GatedRunner` untuk menahan job tetap berjalan).

## Template dan pengaturan

- `TEMPLATE_DIR` dibaca dari env (`.env` lewat Next.js). `readTemplate(dir)` (`src/template/template.ts`) mengembalikan `{ ok: true, template: { dir, conventions, commit } }` atau `{ ok: false, problems }` dengan semua masalah sekaligus. Syarat valid: path absolut, folder ada, ada `docs/conventions.md` dan `scripts/init-project.mjs`, dan berupa repo Git (commit penuh dari `git rev-parse HEAD`, untuk NFR-04).
- `conventions` dibaca apa adanya (UTF-8, tanpa normalisasi baris) dan dimasukkan ke prompt tahap 6 tanpa diubah.
- `getSettings()` (`src/template/settings.ts`) dipakai halaman `/settings` dan `GET /api/settings`. `checkClaude()` hanya menjalankan `claude --version` (tanpa kuota) dan menolak perintah sungguhan saat `NODE_ENV=test`. Test memakai `test/helpers/fake-claude-cli.mjs --version`.
- Halaman yang membaca env atau file saat request memakai `export const dynamic = 'force-dynamic'`. Tampilan dipisah ke komponen murni (`settings-view.tsx`) agar bisa di-test dengan `renderToStaticMarkup` di unit test `.tsx`.

## Tahap dan prompt

- Prompt per tahap di `prompts/<nama>.md` dengan front matter `version`. `loadPrompt` membacanya, dan `renderPrompt` mengisi `{{nama}}`; placeholder tanpa nilai dan nilai yang tidak dipakai keduanya error (`src/stages/prompt.ts`). Mengubah isi prompt wajib menaikkan `version` serta memperbarui fixture dan test yang terdampak.
- Satu folder per tahap di `src/stages/stage-N/`: `validate.ts` (kontrak output: `errors` menggagalkan dan memicu percobaan ulang, `warnings` hanya informasi), `definition.ts` (`StageDefinition`), dan modul konteks untuk tahap berikutnya. Definisi didaftarkan di `createStageRegistry()` (`src/stages/registry.ts`), yang dibuat ulang setiap kali `getJobQueue()` dipanggil, sehingga perubahan prompt langsung terpakai tanpa restart.
- `StageDefinition.notReadyReason` berisi prasyarat tahap; alasannya dikirim sebagai 409. `onSuccess` berjalan di transaksi yang sama dengan pencatatan output, misalnya menghapus jawaban lama dan mengatur `projects.current_stage`. Output yang berlaku dibaca dengan `currentOutput(db, projectId, stage)`; JSON dari teks model dengan `extractJson` (`src/stages/parse.ts`).
- Pertanyaan klarifikasi (tahap 2 dan 3) divalidasi `validateQuestions` (`src/stages/questions.ts`). Jawaban disimpan lewat `saveAnswers` (`src/stages/answers.ts`). Bentuk `value`: `null` (lewati, pakai default, `source` `default` atau `guess`), string (opsi single atau teks), array (opsi multi), atau `{ lainnya }`. Semua pertanyaan wajib dikirim tepat sekali, dan jawaban lama tahap itu diganti seluruhnya. Tahap yang punya pertanyaan didaftarkan di `QUESTION_STAGES` beserta topik tebakan dan tahap berikutnya.
- Tabel kebijakan default tahap 3 (`DEFAULT_POLICY` di `src/stages/stage-3/policy.ts`) adalah satu sumber kebenaran: setiap topik punya daftar kunci `<topik>.<nama>` beserta teks aturannya (dan pola terlarang bila ada), prompt tahap 3 dirender dari tabel itu (`formatPolicy`), dan validator memeriksa `default_policy_key` setiap pertanyaan terhadap kunci topiknya. Kunci `<topik>.ikut_jawaban_produk` dipakai bila default mengikuti jawaban produk; selain `peran_akses`, kunci ini wajib disertai ketegangannya di `detected_risks`. Mengubah tabel berarti mengubah isi prompt: naikkan `version` `prompts/stage-3.md`.
- Kunci kebijakan disimpan di `answers.policy_key` bila jawabannya sama dengan default (dilewati, atau opsi default dipilih). Opsi lain dan "Lainnya" disimpan sebagai teks dengan kunci null. `formatAnswers` menulis jawaban berkunci dengan kunci dan aturannya, dan jawaban tanpa kunci dengan teksnya.
- Teks untuk user di output tahap 3 (pertanyaan, opsi, default, alasan, rekomendasi, risiko, asumsi) tidak boleh menyebut "Profil A", "Profil B", atau "stack profile"; validator menolaknya sebagai error. Di UI, stack disebut "stack yang tersedia" atau "website yang ramah SEO".
- Pilihan stack (`src/stages/stage-3/profile.ts`): rekomendasi Profil A langsung mengisi `profile_choice` A; rekomendasi Profil B menunggu `PUT /api/projects/{id}/profile` (`A_with_seo_mitigation` atau `postpone`), yang disimpan sebagai keputusan `D-01`. Proyek baru pindah ke tahap 4 setelah jawaban tahap 3 tersimpan dan stack dipilih (bukan ditunda).
- Modul yang dipakai komponen klien tidak boleh mengimpor kode server (drizzle, `node:*`). Teks yang dipakai bersama dipisah ke modul sendiri, misalnya `profile-text.ts`; dari modul server hanya `import type`.
- Komponen layar tahap: `StageRunner` (jalankan, status, dan waktu berjalan lewat polling `GET /api/jobs/{id}`) dan `QuestionForm` di `src/app/projects/[id]/`; contoh pemakaian di `stage2-section.tsx` dan `stage3-section.tsx`. Pesan setelah jawaban tersimpan (`savedMessage`) ditentukan pemanggil.

## Claude Code

- Aplikasi hanya bergantung pada port `ClaudeRunner` (`src/claude/types.ts`). Implementasinya `CliClaudeRunner` (`cli-runner.ts`, perintah sungguhan sesuai PRD bagian 3) dan `FakeClaudeRunner` (`fake-runner.ts`, antrean respons, tidak pernah menjalankan proses).
- Kegagalan selalu `ClaudeRunError` dengan `code` (`EXIT_CODE`, `INVALID_ENVELOPE`, `IS_ERROR`, `TIMEOUT`, `SPAWN_FAILED`, `FORBIDDEN_IN_TEST`) dan `message` berbahasa Indonesia yang menyebut penyebabnya, siap ditampilkan sebagai error job (FR-02).
- Token input dicatat termasuk cache (`input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`), karena `input_tokens` saja hampir selalu 1–3. `costUsd` adalah `total_cost_usd` dari envelope, perkiraan, bukan tagihan.
- Di Windows, proses dihentikan dengan `taskkill /PID <pid> /T /F`. `child.kill()` hanya mematikan `cmd.exe` dan membiarkan `claude` berjalan (spike T-002). Jangan memakai `detached: true`.
- `CLAUDE_COMMAND` (opsional, `.env`) mengganti perintah `claude` di aplikasi. Untuk menguji UI tanpa kuota: `CLAUDE_COMMAND=node <path absolut>/test/helpers/fake-claude-cli.mjs`, `FAKE_CLAUDE_MODE=fixture`, `FAKE_CLAUDE_FIXTURE=<path envelope>`, dan opsional `FAKE_CLAUDE_DELAY_MS` untuk meniru durasi.
- NFR-02: `CliClaudeRunner` menolak perintah `claude` sungguhan (`claude`, `claude.cmd`, path ke sana) saat `NODE_ENV=test`. Integration test memakai `test/helpers/fake-claude-cli.mjs` sebagai perintah (perilaku diatur `FAKE_CLAUDE_MODE`).
- Fixture `test/fixtures/claude/<tahap>.json` adalah envelope lengkap, dibaca lewat `loadClaudeFixture()` dan parser yang sama dengan output sungguhan. Fixture dari uji nyata dibangun ulang dengan `node test/fixtures/claude/build-fixtures.mjs` (sumber: `docs/reference/e2e-output/`); file JSON-nya dikecualikan dari Biome.
- **Fixture turunan** di `test/fixtures/claude/derived/`: salinan output nyata yang diubah karena kontrak tahapnya berubah setelah uji nyata (misalnya `default_policy_key` di tahap 3). Dibangun dengan `node test/fixtures/claude/build-derived-fixtures.mjs`; setiap perubahan dicatat di field `fixture_derived` envelope-nya. Fixture asli tetap apa adanya dan dipakai sebagai contoh yang harus ditolak validator.

## UI dan desain

- Sumber desain: `docs/design/design.md` dan mockup di `docs/design/mockups/` (dibaca, bukan dijalankan; dikecualikan dari Biome).
- Token warna, radius, dan jarak hanya didefinisikan di `src/app/globals.css` (mode gelap di `:root`, mode terang di `[data-theme="light"]`) dan dipetakan ke tema Tailwind: `bg-canvas`, `bg-surface`, `bg-raised`, `border-line`, `border-line-subtle`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `text-ink-faint`, `accent`, `accent-soft`, `accent-line`, `on-accent`, `success`, `high`, `medium`, `low` (masing-masing dengan `-soft`), `rounded-control` (12 px), `rounded-panel` (16 px), `rounded-card` (20 px). Nilai warna mentah di `src/components` dan `src/app` dilarang; dijaga oleh `test/unit/components/design-tokens.test.ts`. Varian `light:` untuk gaya khusus mode terang.
- Komponen dasar di `src/components/ui/` (`Button`, `Chip`, `Badge`, `Card`, `Field`, `ProgressBar`, `Stepper`, `StickyActionBar`, `AppHeader`, `ThemeToggle`), dengan test di `test/unit/components/`. Variasi lewat prop (`variant`, `size`, `tone`), bukan dengan menimpa kelas warna, ukuran, atau radius lewat `className` (dua kelas Tailwind untuk properti yang sama hasilnya tidak bisa ditebak). `className` hanya untuk tata letak.
- `Chip` berisi input radio atau checkbox asli yang disembunyikan secara visual (status terpilih lewat `checked`, bukan `aria-pressed`), agar navigasi keyboard dan form mengikuti perilaku bawaan.
- Tema: `data-theme` di `<html>`, dipasang script `THEME_INIT_SCRIPT` sebelum render; pilihan di `localStorage` (`prd-generator-theme`), bawaan mengikuti `prefers-color-scheme`.
- Halaman proyek menampilkan satu tahap per layar (`?tahap=N`, bawaan tahap saat ini). Layar tahap memakai `StageLayout` (`src/app/projects/[id]/stage-layout.tsx`): konten dan panel samping menjadi kolom grid halaman, diakhiri `StickyActionBar` yang menyebut tahap berikutnya. Tahap baru ditambahkan ke `VIEW_STAGES` di `steps.ts`.
- Test tampilan memakai `renderToStaticMarkup` dan `data-testid`; atribut `data-testid` ditulis terakhir bila test mencocokkan teks tepat sesudahnya.

## Test

- Integration test yang butuh database memakai `createTestDb()` dari `test/helpers/db.ts`: file SQLite baru yang sudah dimigrasi di folder sementara OS, dihapus lewat `close()` di `afterEach`. Contoh: `test/int/db/schema.int.test.ts`.
- Unit test di `test/unit/**`, mengikuti struktur folder sumber (`scripts/lib/prereq-checks.mjs` → `test/unit/scripts/prereq-checks.test.ts`). Test yang butuh file memakai folder sementara (`mkdtempSync`) dan menghapusnya di `afterEach`.
- Teks UI dan pesan untuk user dalam Bahasa Indonesia.
