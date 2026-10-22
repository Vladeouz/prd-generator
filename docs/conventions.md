# Konvensi Proyek

Rujukan konvensi untuk manusia dan agent. Melengkapi bagian 3 PRD (`docs/PRD.md`); bila bertentangan, PRD yang berlaku. Konvensi baru ditambahkan di sini bersamaan dengan kode yang pertama memakainya, beserta file contohnya. Dokumen ini masih kerangka (T-001) dan dilengkapi di T-019.

## Struktur repo

Lihat pohon folder di bagian 3 PRD. Proyek satu paket pnpm tanpa workspace; `pnpm-workspace.yaml` hanya berisi pengaturan pnpm (`allowBuilds`).

## Prasyarat lingkungan

Diperiksa `pnpm prereq` (`scripts/prereq.mjs`, logikanya di `scripts/lib/prereq-checks.mjs`), yang menampilkan tabel status beserta saran perbaikan dan tidak pernah membuat atau mengubah file. Semua wajib: Node.js 24, pnpm versi `packageManager`, Git, perintah `claude`, file `.env`, `TEMPLATE_DIR` (path absolut ke folder yang berisi `docs/conventions.md` dan `scripts/init-project.mjs`), dan Chromium untuk Playwright (`pnpm exec playwright install chromium`, dibutuhkan test end-to-end). `TEMPLATE_DIR` dari variabel lingkungan proses menang atas `.env`, sama dengan Next.js. Login Claude Code hanya disebut sebagai pengingat. Prasyarat baru ditambahkan ke `prereq-checks.mjs`, test-nya, dan tabel Prasyarat di `README.md`.

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
| `react-markdown` | 10.1.0 | T-012 |
| `remark-gfm` | 4.0.1 | T-012 |
| `happy-dom` (dev) | 21.0.1 | T-016 |
| `@playwright/test` (dev) | 1.64.0 (browser: `pnpm exec playwright install chromium`) | T-017 |
| `@xyflow/react` | 12.12.0 | T-028 |

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
| `pnpm test:e2e` | Playwright, `test/e2e/**/*.spec.ts` (`playwright.config.ts`): build produksi lalu alur UI dengan runner palsu |
| `pnpm claude:smoke` | Satu pemanggilan `claude` sungguhan dengan prompt kecil (memakai kuota; hanya untuk verifikasi manual) |
| `pnpm db:generate` | `drizzle-kit generate`: membuat migrasi di `drizzle/` dari `src/core/db/schema.ts` |

- Semua script otomatisasi ditulis dalam Node (`.mjs`) di `scripts/`, bukan shell. Nama file sama dengan nama script-nya (`pnpm prereq` → `scripts/prereq.mjs`); modul pendukung di `scripts/lib/`.
- Script memanggil perintah eksternal lewat `spawnSync(perintah, { shell: true })` agar `pnpm.cmd`, `claude.cmd`, dan sejenisnya ditemukan di Windows.
- Nama script tidak boleh sama dengan perintah bawaan pnpm (misalnya `test`, `init`, `doctor`), karena perintah bawaan selalu menang. Cek dengan `pnpm help <nama>`: bila keluar `unrecognized subcommand`, nama itu aman. Pengecualian: `start`, karena perintah bawaan `pnpm start` memang menjalankan `scripts.start`. Karena itu unit test memakai `test:unit`, bukan `test`.
- Server (`dev`, `start`) selalu dengan `--hostname 127.0.0.1` (NFR-01).

### `pnpm check`

`scripts/check.mjs` menjalankan Biome, typecheck, unit test, integration test, dan end-to-end berurutan. Semua langkah selalu dijalankan walaupun ada yang gagal; ringkasan di akhir menampilkan status dan waktu per langkah, dan output lengkap langkah yang gagal disimpan di `.check-logs/<waktu run>/` (di-ignore Git). Langkah verifikasi baru ditambahkan ke `STEPS`; `hint(output)` opsional menambah saran perbaikan di ringkasan (contoh: browser Playwright belum terpasang). Harus hijau sebelum task dicentang dan selesai di bawah 5 menit (NFR-05; saat T-017 sekitar 1 menit, end-to-end sekitar 40 detik).

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
- Database utama `data/prd-generator.db` (di-ignore Git), dibuka lewat `getDb()` di `src/core/db/client.ts`. Koneksinya disimpan di `globalThis` agar hot reload tidak membuka koneksi baru (temuan spike T-002). `getDb()` melempar error saat `NODE_ENV=test`. `DATABASE_PATH` (opsional) mengganti path database utama; dipakai test end-to-end.
- `openDatabase(path)` menyalakan `foreign_keys` (wajib per koneksi agar cascade berjalan), WAL, dan `busy_timeout`, lalu menjalankan migrasi yang belum diterapkan. Migrasi idempoten, jadi aman dipanggil setiap kali aplikasi membuka database.
- Setiap kolom enum dibatasi CHECK. Daftar nilainya diekspor dari `schema.ts` (`STAGES`, `JOB_STATUSES`, dll.) untuk dipakai ulang oleh Zod; jangan menulis ulang daftarnya. Aturan "satu baris aktif" memakai partial unique index (contoh: `jobs_one_active_idx` pada ekspresi `(1)` dengan `WHERE status in ('queued', 'running')`).
- Id (`text`) dan timestamp (ISO 8601 UTC) diisi aplikasi, tanpa default di database.
- **Pengecualian "jangan diedit tangan"**: migrasi hasil drizzle-kit boleh disunting bila perlu memindahkan data, atau bila drizzle-kit salah menulis SQL. Setiap suntingan diberi komentar `-- Disunting …` di file SQL-nya, dan `pnpm db:generate` ulang harus tetap "No schema changes". Contoh `drizzle/0002_stage7a_stage7b_scope.sql` (T-026):
  - run `stage7` lama dipetakan ke `stage7b` yang tidak berlaku;
  - ekspresi `ifnull` di indeks salah dikutip drizzle-kit 0.31.
- **Tahap di `stage_runs`** (T-026, D-11):
  - `RUN_STAGES` sama dengan `STAGES`, tetapi `stage7` dipecah menjadi `stage7a` dan `stage7b`. `scope` berisi nomor fase untuk `stage7b`, null untuk tahap lain;
  - job, jawaban, dan tahap proyek tetap memakai `stage7`. Pemetaan: `runStagesOf(stage)` dan `stageOfRun(runStage)` di `run-stage.ts`;
  - `StageDefinition.runStage`/`scope` menentukan baris yang dicatat `runStage`;
  - satu run berlaku per (`project_id`, `stage`, `ifnull(scope, '')`). `ifnull` wajib karena SQLite menganggap setiap NULL berbeda di indeks unik;
  - `currentOutput(db, projectId, runStage, scope?)`; pemakaian per tahap (`usage.ts`) menjumlahkan 7a dan 7b sebagai tahap 7.
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
- Job tahap dijalankan `JobQueue` (`src/jobs/job-queue.ts`) di proses server (D-03). Instance tunggalnya `getJobQueue()` (`src/jobs/instance.ts`), disimpan di `globalThis`. Antrean yang dibuat dari salinan kode `JobQueue` lain (bundle instrumentation yang tidak ikut hot reload, atau modul sebelum hot reload) diganti oleh `currentQueue`, agar job selalu dijalankan `runStage` terbaru; status job tetap aman karena tersimpan di database. `src/instrumentation.ts` menandai job aktif dari proses sebelumnya sebagai `interrupted` sekali saat server start, dan tidak berjalan saat `next build`.
- Tahap didefinisikan sebagai `StageDefinition` (`src/stages/run-stage.ts`): `stage`, `promptVersion`, `buildPrompt`, `parse`, `validate`, lalu didaftarkan di `stageRegistry` (`src/jobs/instance.ts`). `runStage` menangani percobaan ulang sekali dengan daftar error (D-08) dan pencatatan `stage_runs`; definisi tahap tidak menulis `stage_runs` sendiri.
- Kegagalan runner (`ClaudeRunError`) tidak dicoba ulang: job `failed` dengan pesan runner, dicatat sebagai `stage_runs` gagal tanpa output, dan output tahap yang berlaku sebelumnya tetap berlaku. Hanya kegagalan parse dan validasi yang dicoba ulang.
- Kelas error yang melintasi graf modul (`AppError`, `ClaudeRunError`, `StageFailedError`) dikenali lewat penanda `Symbol.for` dan `static [Symbol.hasInstance]` (`brandedInstanceCheck` di `src/core/errors.ts`). Next.js membundel `instrumentation.ts`, yang membuat antrean job, terpisah dari route, sehingga `instanceof` biasa gagal dan 409 berubah menjadi 500 (ditemukan di T-008). Kelas error baru yang bisa dilempar dari antrean mengikuti pola ini. Test: `test/unit/core/errors.test.ts` (salinan modul lewat `import('…?salinan-lain')`).
- **Progres job** (D-12, T-024):
  - `runStage` meneruskan `onAttempt` dan `onProgress` (potongan stream runner) ke `ProgressStore` (`src/jobs/progress.ts`);
  - isinya `chars`, `preview` (400 karakter terakhir), `thinkingTokens`, `attempt`, serta `step`/`totalSteps` untuk tahap berlangkah;
  - store disimpan di `globalThis` (`sharedProgressStore()`), bukan di instance `JobQueue`, karena antrean bisa diganti `currentQueue` dan route bisa memuat salinan modul lain;
  - progres hanya di memori. Saat job selesai, `finish` dipanggil setelah status job tertulis di database: progres dihapus dan pendengar menerima `done`.
- **`GET /api/jobs/{id}/stream`** (`jobEventStream`, `src/jobs/event-stream.ts`):
  - SSE dengan event `progress` (dibatasi `PROGRESS_THROTTLE_MS` = 300 ms, selalu keadaan terbaru) lalu satu `done` berisi `Job` + `attempts`;
  - progres terkini langsung dikirim saat tersambung, dan job yang sudah selesai langsung mendapat `done`;
  - berlangganan dulu, baru memeriksa status di database;
  - route memakai `dynamic = 'force-dynamic'` dan berhenti berlangganan saat `request.signal` dibatalkan.
- **UI** (`StageRunner`): progres nyata dari `EventSource`, ditampilkan `JobProgressView` (`src/components/job-progress.tsx`). Polling `GET /api/jobs/{id}` tetap berjalan sebagai cadangan untuk status dan percobaan ulang. Tidak ada lagi bilah progres yang dihitung dari waktu.
- Contoh test:
  - `test/int/jobs/job-queue.int.test.ts`: runner palsu, fixture nyata, `GatedRunner` untuk menahan job tetap berjalan;
  - `test/int/jobs/job-stream.int.test.ts`: SSE dengan `FakeClaudeRunner` bertahap, dan runner yang berhenti di tengah untuk kasus tersambung ulang.

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
- Tahap 4 (`src/stages/stage-4/`): prompt berisi konteks produk dan teknis (`formatProductContext` + `formatTechnicalContext`). Fitur rekomendasi disimpan lewat `PUT /api/projects/{id}/features` (`features.ts`): setiap rekomendasi menjadi satu baris `feature_choices` (accepted 1 atau 0), pilihan lama diganti seluruhnya, lalu proyek pindah ke tahap 5. Menjalankan ulang tahap 4 menghapus pilihan fitur. Input tahap berikutnya adalah `featureDraft(db, projectId)`: output tahap 4 tanpa `recommended_features`, dengan `accepted_recommendations` (yang dicentang) dan `non_goals` ditambah rekomendasi yang tidak dicentang (`notChosenNonGoal`).
- Tahap 5 (`src/stages/stage-5/`): prompt berisi konteks produk, konteks teknis, dan `featureDraft` sebagai JSON. Keputusan disimpan lewat `PUT /api/projects/{id}/decisions/{origin}` (`decisions.ts`, `REVIEWS` per origin): setiap temuan menjadi satu keputusan dengan kode temuannya (`RV-01`), dan konsekuensi yang disimpan adalah konsekuensi opsi yang dipilih. Temuan yang tidak dikirim memakai rekomendasinya. Keputusan origin itu diganti seluruhnya, lalu proyek pindah ke tahap berikutnya. Menjalankan ulang tahap 5 hanya menghapus keputusan `review1`; `D-01` tetap. Teks UI keparahan dan kategori ada di `review-text.ts`.
- Tahap 6 (`src/stages/stage-6/`): `buildPrompt` boleh async (`StageDefinition.buildPrompt` mengembalikan `string | Promise<string>`). Tahap 6 dan review kedua membaca template lewat `readStageConventions` (`src/stages/conventions.ts`) di `buildPrompt`, yang hanya mengambil bagian konvensi tahap itu (lihat poin bagian konvensi di bawah). Template yang tidak valid atau heading yang hilang melempar `StageFailedError`, sehingga job gagal sebelum `claude` dipanggil. Commit template dicatat di `projects.template_commit` oleh tahap 6. `TEMPLATE_DIR` disuntikkan lewat `createStageRegistry({ templateDir })` (bawaan: env); test memakai `test/helpers/template-repo.ts`. AI hanya menulis bagian 1–7 (validator menolak `## 8.` dan `### Open Questions`). Bagian 8 disusun `composePrd` + `prdAppendix` (`src/projects/compose-prd.ts`), yang berisi keputusan apa adanya, asumsi tahap 2–3, tebakan, dan pertanyaan terbuka tahap 4. Hasilnya disimpan sebagai dokumen `prd` versi berikutnya, dan proyek pindah ke `review2`. Output Markdown diambil dengan `extractMarkdown` (`parse.ts`).
- **Bagian konvensi per tahap** (D-10, T-025, `src/template/sections.ts`):
  - prompt hanya membawa bagian `docs/conventions.md` dari `CONVENTION_SECTIONS[tahap]` (daftar dari spike T-022), apa adanya;
  - `selectSections` mengambil baris heading persis sampai sebelum heading setingkat atau lebih tinggi. Sub-heading ikut, heading di blok kode diabaikan, dan baris (termasuk `\r` dan spasi di akhir) tidak diubah;
  - bagian digabung dengan satu baris kosong, sesuai urutan daftar;
  - heading yang hilang menggagalkan tahap (`missingSectionsMessage`) dan tampil di halaman pengaturan (`sectionProblems` di `getSettings`);
  - tahap baru yang membawa konvensi menambahkan daftarnya di `CONVENTION_SECTIONS`, dan repo template buatan test (`TEMPLATE_SECTIONS` di `test/helpers/template-repo.ts`) wajib memuat heading-nya.
- **Tahap 7a** (T-026, `src/stages/stage-7a/`, prompt `stage-7a.md`):
  - daftar task JSON `{ tasks: [{ id, title, phase, feature, layer, depends_on, refs }] }`;
  - prompt berisi ringkasan PRD (`prdDigest` + `formatPrdDigest`, `src/projects/prd-digest.ts`: kode dan judul FR/NFR, endpoint tanpa `**` dan query string, tabel erDiagram, fase dan fitur tahap 4, fitur rekomendasi yang diterima), bukan PRD utuh, ditambah bagian konvensi `stage7a`;
  - `validateStage7a` memeriksa aturan FR-08 untuk daftar task. Fase harus berasal dari tahap 4, dan task tidak boleh sebelum fase fiturnya. Hanya task hapus notes yang boleh tanpa fitur dan refs;
  - aturan dari uji nyata T-018 (prompt versi 3), agar agent proyek turunan tidak perlu memutuskan konvensi sendiri:
    - setiap task selain yang pertama punya `depends_on`;
    - tidak ada layer `contract` (`PLAN_LAYERS`): `pnpm contract:generate` dikerjakan di task yang mengubah route atau skema Zod, sesuai bagian "Kontrak dan client Dart" template;
    - task `db` menyebut `tables` yang dibuatnya ([] bila hanya mengubah tabel). Setiap tabel erDiagram PRD dibuat tepat satu task, kecuali `TEMPLATE_TABLES` (`users`). Tabel dibuat di fase fitur pemiliknya, bukan semuanya di fase 0;
    - konvensi `stage7a` membawa bagian `## Database` dan `## Kontrak dan client Dart`;
    - regresi: `verification/t018-stage7a.json` (daftar nyata uji T-018) harus ditolak;
  - aturan bersama dengan 7b dan validator TASKS.md ada di `src/stages/task-rules.ts`: `TASK_LAYERS`, `templateSetupOf`, `isNotesRemoval`, `MAX_TASKS`;
  - fixture `derived/stage7a-gym.json` dibangun `build-derived-fixtures.mjs` dari TASKS rujukan;
  - definisi dijalankan dalam job tahap 7 (lihat Job tahap 7).
- **PRD ringkas** (NFR-06, prompt tahap 6 versi 2):
  - prompt meminta PRD merujuk konvensi tanpa menyalin, dengan batas ±45.000 karakter, maksimal 20 FR dan 6 acceptance criteria per FR, dan API Contract sebagai tabel dengan path lengkap;
  - `validatePrd(md, { conventions })` menolak paragraf (≥ 120 karakter, per butir untuk daftar dan tabel) atau isi blok kode (≥ 40 karakter) konvensi yang muncul utuh di PRD setelah spasi dirapatkan;
  - PRD di atas `PRD_SIZE_WARN_BYTES` (50 KB) hanya diberi peringatan;
  - FR boleh merujuk `F-xx` atau `R-xx`;
  - regresi dengan output nyata: `verification/t022-stage6-g.json` dan bagian konvensi prompt-nya `verification/t022-stage6-conventions.md`.
- Review kedua (`src/stages/review-2/`):
  - prompt berisi PRD terbaru (`latestDocument`, `src/projects/documents.ts`) dan celah dari `endpointGaps`: rute UI `/x/{id}/edit` tanpa `GET /x/{id}` di API Contract;
  - validator memakai `validateReview` (aturan bersama tahap 5) dengan kategori `data_model`, `business_rule`, `ui_endpoint` dan id `RV2-xx`. Setiap opsi punya `changes_prd`, setiap temuan butuh opsi `true` dan `false`, dan setiap celah wajib menjadi temuan `ui_endpoint`. `StageDefinition.validate` menerima `{ db, projectId }` untuk pemeriksaan seperti ini;
  - `PUT …/decisions/review2` hanya bisa dilakukan saat proyek di `review2`. Bila ada opsi `changes_prd` yang dipilih, handler (dengan `queue`) menjalankan tahap 6 sekali. Run tahap 6 yang punya keputusan `review2` memindahkan proyek ke `stage7`, sehingga PRD tidak ditulis ulang dua kali;
  - layarnya `Review2Section` di layar PRD, memakai `DecisionForm` dengan `origin`.
- **Job tahap 7** (T-027, D-11, `stage7Job` di `src/stages/stage-7b/job.ts`, didaftarkan di registry sebagai `StageJob`):
  - satu job menjalankan 7a bila belum ada daftar yang berlaku, lalu 7b per fase tahap 4 yang punya task dan belum punya detail berlaku, lalu `composeTasks`;
  - setiap pemanggilan lewat `runStage` dengan definisinya sendiri (`stage7aDefinition`, `stage7bDefinition(phase)` dengan `scope` = nomor fase), jadi percobaan ulang (D-08) berlaku per langkah;
  - progres: `RunStageDeps.onStep(step, totalSteps)` → `ProgressStore.startStep`, tampil "Langkah i dari n";
  - menjalankan ulang setelah gagal hanya mengulang fase tanpa hasil valid. Menjalankan ulang setelah lengkap membuat ulang semuanya: `onSuccess` 7a baru membatalkan semua 7b. Menjalankan ulang tahap 6 membatalkan 7a dan 7b (`invalidateLaterStages`);
  - `JobQueue` menjalankan `StageJob.execute` (tahap berlangkah) atau `runStage` (tahap lain);
  - layar tahap 7 menampilkan `resumeNote` bila langkah yang valid belum lengkap (`stage7Progress`).
- **Tahap 7b** (`src/stages/stage-7b/`, prompt `stage-7b.md`):
  - konvensi `stage7b` diletakkan di AWAL prompt, sehingga awalan semua fase sama dan bisa dibaca dari cache;
  - prompt berisi task fase itu (JSON dari 7a) dan `prdExcerpt`: blok FR dan butir NFR yang dirujuk, ditambah bagian 4 bila ada task `db`;
  - output `{ tasks: [{ id, files, done_when, manual }] }`;
  - `validateStage7b` memeriksa: setiap task fase tepat sekali; `files` tanpa file setup template; `done_when` tanpa `pnpm check`; `manual.steps` tanpa langkah persiapan;
  - fixture `derived/stage7b-gym-fase-{0..3}.json`. Runner palsu mode `flow` memilih fase dari "untuk fase N" di prompt.
- **`docs/TASKS.md` disusun aplikasi** (`composeTasks`, `src/projects/compose-tasks.ts`):
  - format sama dengan TASKS lama;
  - kode menambahkan "`pnpm check` hijau" di akhir setiap *done when*;
  - untuk task manual, kode menambahkan penanda **(manual)** dan langkah bernomor: `MANUAL_PREPARATION` (`.env`, `docker compose up -d --wait`, API), ditambah `MANUAL_FLUTTER_WEB` bila layer `app` atau file `apps/app/lib`, lalu langkah dari AI;
  - hasilnya divalidasi `validateTasks` sebelum disimpan sebagai dokumen `tasks` versi berikutnya, dan proyek pindah ke `export`.
- Validator `docs/TASKS.md` (`src/stages/stage-7b/tasks-markdown.ts`, dulu validator output tahap 7 lama T-014). `validateTasks(md, { frIds, endpoints, nfrIds })` memeriksa terhadap PRD terbaru:
    - tanpa task setup template (`TEMPLATE_SETUP`, dikenali dari judul atau file konfigurasi);
    - tepat satu task hapus notes setelah task fitur pertama;
    - *done when* boleh multi-baris: dari baris `done when:` sampai akhir task, termasuk sub-butir dan paragraf setelah baris kosong, tanpa langkah manual bernomor (`1.`, `2.`, …). Baris kriteria terakhirnya harus diakhiri `pnpm check` hijau;
    - setiap task **(manual)** menyebut `.env` dan `docker compose up`;
    - perintah Flutter web (`flutter run -d chrome …`) hanya wajib untuk task manual dengan layer `app` atau `files` yang menyentuh `apps/app/lib` (file native seperti `apps/app/ios/` tidak dihitung);
    - setiap `flutter run -d chrome` memakai `--web-browser-flag=--incognito`;
    - lebih dari `MAX_TASKS` (60) task hanya peringatan;
  - ukuran task (kini di prompt 7a): satu task setara satu sesi agent yang bermakna, misalnya satu fitur di satu layer lengkap dengan test-nya. Targetnya 20–45 task untuk MVP;
  - keputusan aturan manual, ukuran task, dan *done when* multi-baris diambil user setelah verifikasi manual T-014 (lihat `docs/logs/T-014.md`);
- `GET /api/jobs/{id}` mengembalikan job beserta `attempts` (`JobQueue.attempts`: percobaan job itu dari `stage_runs`, dikenali dari proyek, tahap, dan waktu mulai job). `StageRunner` menampilkan `attemptNote` ("Percobaan 2 dari 2. Percobaan 1 ditolak: …") selama job berjalan. `MAX_ATTEMPTS` ada di `src/stages/attempts.ts` agar bisa dipakai komponen klien.
- Fixture **verifikasi** di `test/fixtures/claude/verification/`: output nyata dari verifikasi manual yang dipakai sebagai test regresi, disalin apa adanya dari database lokal, dengan sumbernya di field `fixture_source` (contoh: `t014-prd.md` dan `t014-stage7-attempt{1,2}.json`).
- Pemakaian token (`src/projects/usage.ts`, FR-10):
  - `getStageUsage` menghitung token input/output dan biaya per tahap dari semua percobaan, dan durasi dari run yang berlaku. `usageTotals` menghitung total proyek;
  - tampil di `UsageCard` per tahap dan `UsageSummary` (kolom stepper). Biaya diformat `formatCost` ("$0,72") dan selalu disebut perkiraan;
  - `stageEstimate(db, 'stage6' | 'stage7', phases?)` merata-rata semua pemanggilan sebelumnya di semua proyek. Tahap 7 dihitung sebagai rata-rata 7a ditambah rata-rata 7b × jumlah fase, tanpa run lama `stage7b` yang tidak punya scope. Bila belum ada pemanggilan, dipakai `TEST_ESTIMATES` (tahap 6 dari verifikasi T-025, tahap 7 dari target NFR-06). Durasi tahap 7 di pemakaian adalah jumlah run yang berlaku;
  - teks konfirmasinya dari `confirmationText` (`run-confirmation.ts`), ditampilkan `StageRunner` (prop `confirmation`) dan `DecisionForm` (`regenerateConfirmation`) sebagai panel di halaman, bukan dialog browser.
- Menjalankan ulang tahap: `invalidateLaterStages` (`run-stage.ts`) berjalan di transaksi output yang berhasil, sebelum `onSuccess`:
  - output tahap sesudahnya `is_current = 0`;
  - dokumen yang dihasilkan tahap sesudahnya dihapus (`DOCUMENT_STAGES`: `prd` dari tahap 6, `tasks` dari tahap 7);
  - keputusan `review2` dihapus bila tahap sebelum PRD dijalankan ulang.
  - Percobaan yang gagal tidak mengubah apa pun. Prasyarat tiap tahap memaksa tahap yang tidak berlaku dijalankan ulang berurutan.
- Export (`src/projects/export.ts`, `export-handlers.ts`):
  - `POST /api/projects/{id}/export` `{ targetDir, overwrite? }` hanya menerima path absolut yang diketik user (NFR-01);
  - folder tujuan harus turunan template: ada `scripts/init-project.mjs`, dan `.firebaserc` tanpa `demo-template`;
  - `docs/PRD.md` yang tidak memuat penanda placeholder `init-project` (`PLACEHOLDER_MARKER`) → 409 kecuali `overwrite`;
  - semua pemeriksaan selesai sebelum file ditulis. Hanya `docs/PRD.md` dan `docs/TASKS.md` yang ditulis (versi terbaru, LF, diakhiri satu baris baru), dan respons berisi path yang ditulis;
  - `GET /api/projects/{id}/documents/{kind}` mengembalikan Markdown, atau lampiran `PRD.md`/`TASKS.md` dengan `download=1`;
  - layarnya `ExportSection` (tahap 8).
- Fixture **sintetis** di `test/fixtures/claude/synthetic/`: ditulis tangan bila belum ada output nyata (kasus `daftar-belanja`), dibangun dengan `node test/fixtures/claude/build-synthetic-fixtures.mjs`, dan ditandai field `fixture_synthetic`.
- Pratinjau Markdown: `MarkdownPreview` (`src/components/ui/markdown-preview.tsx`, `react-markdown` + `remark-gfm`), dengan gaya `.prd-markdown` di `globals.css`.
- Integration test yang menjalankan beberapa tahap memakai `test/helpers/stage-flow.ts` (`createFlow`, `projectThrough(flow, 'stage4')`, `GYM_FIXTURES`). `test/helpers/review-flaws.ts` berisi `injectFlaws` dan `scoreReview` dari `e2e-gym.mjs`.
- Modul yang dipakai komponen klien tidak boleh mengimpor kode server (drizzle, `node:*`). Teks yang dipakai bersama dipisah ke modul sendiri, misalnya `profile-text.ts`; dari modul server hanya `import type`.
- Komponen layar tahap: `StageRunner` (jalankan, status, dan waktu berjalan lewat polling `GET /api/jobs/{id}`) dan `QuestionForm` di `src/app/projects/[id]/`; contoh pemakaian di `stage2-section.tsx` dan `stage3-section.tsx`. Pesan setelah jawaban tersimpan (`savedMessage`) ditentukan pemanggil.

## Claude Code

- Aplikasi hanya bergantung pada port `ClaudeRunner` (`src/claude/types.ts`). Implementasinya `CliClaudeRunner` (`cli-runner.ts`, perintah sungguhan sesuai PRD bagian 3) dan `FakeClaudeRunner` (`fake-runner.ts`, antrean respons, tidak pernah menjalankan proses).
- **Bentuk perintah** (spike T-022, `claudeArgs` di `cli-runner.ts`; flag diverifikasi dari `claude --help` 2.1.302):

  ```
  claude -p --output-format stream-json --verbose --include-partial-messages --max-turns 1
    --model <CLAUDE_MODEL> --effort low --system-prompt "<CLAUDE_SYSTEM_PROMPT>" --tools ""
    --strict-mcp-config --setting-sources project --disable-slash-commands --no-session-persistence
  ```

  - `CLAUDE_MODEL` (opsional, `.env`, bawaan `sonnet`, `claudeModel()` di `src/core/config/claude.ts`). Nilainya divalidasi sebelum dipakai: alias atau nama lengkap tanpa spasi atau karakter shell. Bila tidak valid, `INVALID_CONFIG`.
  - Extended thinking tidak bisa dimatikan di Sonnet 5.5. `--effort low` menguranginya (D-09).
  - Tidak dipakai, karena tidak berpengaruh: `MAX_THINKING_TOKENS=0`, `alwaysThinkingEnabled: false`, dan `--safe-mode`.
  - Tidak dipakai, karena tidak cocok: `--bare`, yang auth-nya hanya API key, bukan langganan.
  - `--include-partial-messages` wajib. Tanpa flag itu, dengan `--max-turns 1` teks baru datang sekaligus di akhir.
  - Di Windows, argumen kosong (`--tools ""`) dan berspasi diberi tanda kutip di string perintah. Argumen dengan `"`, `%`, `!`, `^`, `&`, `|`, `<`, `>`, atau baris baru ditolak, jadi `CLAUDE_SYSTEM_PROMPT` tidak boleh memuatnya.
- **Stream** dibaca baris demi baris oleh `StreamReader` (`src/claude/stream.ts`):
  - `stream_event` `content_block_delta`/`text_delta` menjadi `onProgress({ kind: 'text', text, chars })`;
  - `system`/`thinking_tokens` (tidak terdokumentasi) menjadi `onProgress({ kind: 'thinking', estimatedTokens })`;
  - event `result` terakhir dibaca `parseEnvelope`, karena bentuknya sama dengan envelope `--output-format json`. Tanpa event `result`, terjadi `INVALID_ENVELOPE`;
  - baris lain diabaikan, dan error di callback progres diabaikan;
  - `onProgress` adalah opsi `ClaudeRunOptions`; `FakeClaudeRunner` mengirim `result` sebagai potongan bertahap (`chunkSize`, `chunkDelayMs`) bila callback diberikan.
- Kegagalan selalu `ClaudeRunError` dengan `code` (`EXIT_CODE`, `INVALID_ENVELOPE`, `IS_ERROR`, `TIMEOUT`, `SPAWN_FAILED`, `FORBIDDEN_IN_TEST`, `INVALID_CONFIG`) dan `message` berbahasa Indonesia yang menyebut penyebabnya, siap ditampilkan sebagai error job (FR-02).
- Token input dicatat termasuk cache (`input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens`), karena `input_tokens` saja hampir selalu 1–3. `costUsd` adalah `total_cost_usd` dari envelope, perkiraan, bukan tagihan.
- Di Windows, proses dihentikan dengan `taskkill /PID <pid> /T /F`. `child.kill()` hanya mematikan `cmd.exe` dan membiarkan `claude` berjalan (spike T-002). Jangan memakai `detached: true`.
- `CLAUDE_COMMAND` (opsional, `.env`) mengganti perintah `claude` di aplikasi. Untuk menguji UI tanpa kuota: `CLAUDE_COMMAND=node <path absolut>/test/helpers/fake-claude-cli.mjs`, `FAKE_CLAUDE_MODE=fixture`, `FAKE_CLAUDE_FIXTURE=<path envelope>`, dan opsional `FAKE_CLAUDE_DELAY_MS` untuk meniru durasi.
- `FAKE_CLAUDE_MODE=flow` menjalankan satu proyek dari tahap 2 sampai 7 tanpa kuota: fixture dipilih dari nama tahap di baris pertama prompt (`Kamu adalah tahap "…"`), dengan pemetaan `FLOW_FIXTURES` di `test/helpers/fake-claude-flow.mjs` (sama dengan `GYM_FIXTURES`). `FAKE_CLAUDE_INVALID_ONCE=<nama tahap>` dengan `FAKE_CLAUDE_INVALID_FIXTURE` dan `FAKE_CLAUDE_STATE_DIR` menjawab pemanggilan pertama tahap itu dengan fixture yang ditolak validator, untuk menguji percobaan ulang; `FAKE_CLAUDE_RETRY_DELAY_MS` memperlambat percobaan ulangnya agar keterangannya terlihat di layar (lihat `flowResponse`). Prompt baru atau nama tahap yang berubah wajib ditambahkan ke pemetaan itu; `test/int/claude/fake-flow.int.test.ts` gagal bila ada prompt yang tidak dikenali.
- NFR-02: `CliClaudeRunner` menolak perintah `claude` sungguhan (`claude`, `claude.cmd`, path ke sana) saat `NODE_ENV=test`. Integration test memakai `test/helpers/fake-claude-cli.mjs` sebagai perintah (perilaku diatur `FAKE_CLAUDE_MODE`).
- Script palsu mengeluarkan format stream yang sama dengan Claude Code: `init`, satu `thinking_tokens`, potongan `text_delta` dari `result` envelope (fixture atau buatan), lalu event `result`. Ukuran dan jeda potongan diatur lewat `FAKE_CLAUDE_CHUNK_SIZE` (bawaan 2000) dan `FAKE_CLAUDE_CHUNK_DELAY_MS` (bawaan 0). Mode `no-result` mengeluarkan stream tanpa event `result`.
- Fixture `test/fixtures/claude/<tahap>.json` adalah envelope lengkap, dibaca lewat `loadClaudeFixture()` dan parser yang sama dengan output sungguhan. Fixture dari uji nyata dibangun ulang dengan `node test/fixtures/claude/build-fixtures.mjs` (sumber: `docs/reference/e2e-output/`); file JSON-nya dikecualikan dari Biome.
- **Fixture turunan** di `test/fixtures/claude/derived/`: salinan output nyata yang diubah karena kontrak tahapnya berubah setelah uji nyata (misalnya `default_policy_key` di tahap 3). Dibangun dengan `node test/fixtures/claude/build-derived-fixtures.mjs`; setiap perubahan dicatat di field `fixture_derived` envelope-nya. Fixture asli tetap apa adanya dan dipakai sebagai contoh yang harus ditolak validator.

## UI dan desain

- Sumber desain: `docs/design/design.md` dan mockup di `docs/design/mockups/` (dibaca, bukan dijalankan; dikecualikan dari Biome).
- Token warna, radius, dan jarak hanya didefinisikan di `src/app/globals.css` (mode gelap di `:root`, mode terang di `[data-theme="light"]`) dan dipetakan ke tema Tailwind: `bg-canvas`, `bg-surface`, `bg-raised`, `border-line`, `border-line-subtle`, `text-ink`, `text-ink-secondary`, `text-ink-muted`, `text-ink-faint`, `accent`, `accent-soft`, `accent-line`, `on-accent`, `success`, `high`, `medium`, `low` (masing-masing dengan `-soft`), `rounded-control` (12 px), `rounded-panel` (16 px), `rounded-card` (20 px). Nilai warna mentah di `src/components` dan `src/app` dilarang; dijaga oleh `test/unit/components/design-tokens.test.ts`. Varian `light:` untuk gaya khusus mode terang.
- Komponen dasar di `src/components/ui/` (`Button`, `Chip`, `Badge`, `Card`, `Field`, `ProgressBar`, `Stepper`, `StickyActionBar`, `AppHeader`, `ThemeToggle`, `MobileMenu`), dengan test di `test/unit/components/`. Variasi lewat prop (`variant`, `size`, `tone`), bukan dengan menimpa kelas warna, ukuran, atau radius lewat `className` (dua kelas Tailwind untuk properti yang sama hasilnya tidak bisa ditebak). `className` hanya untuk tata letak.
- `Chip` berisi input radio atau checkbox asli yang disembunyikan secara visual (status terpilih lewat `checked`, bukan `aria-pressed`), agar navigasi keyboard dan form mengikuti perilaku bawaan.
- Header: mulai lebar `md` navigasi ada di header; di bawahnya navigasi, token, dan status template ada di `MobileMenu` (menu samping).
- Tema: `data-theme` di `<html>`, dipasang script `THEME_INIT_SCRIPT` sebelum render; pilihan di `localStorage` (`prd-generator-theme`), bawaan mengikuti `prefers-color-scheme`.
- Halaman proyek menampilkan satu tahap per layar (`?tahap=N`, bawaan tahap saat ini). Layar tahap memakai `StageLayout` (`src/app/projects/[id]/stage-layout.tsx`): konten dan panel samping menjadi kolom grid halaman, diakhiri `StickyActionBar` yang menyebut tahap berikutnya. Tahap baru ditambahkan ke `VIEW_STAGES` di `steps.ts`.
- Test tampilan memakai `renderToStaticMarkup` dan `data-testid`; atribut `data-testid` ditulis terakhir bila test mencocokkan teks tepat sesudahnya.
- Keadaan layar (T-021), di `src/components/ui/states.tsx`:
  - kosong atau belum siap: `EmptyState` (judul opsional dan langkah berikutnya), bukan paragraf bergaris putus-putus yang ditulis ulang;
  - memuat: `loading.tsx` per rute (`src/app/loading.tsx`, `projects/[id]/loading.tsx`, `settings/loading.tsx`) dengan `LoadingState` di dalam `PageShell` (`src/app/page-shell.tsx`);
  - error: `src/app/error.tsx` (`ErrorState`, tombol "Coba lagi") dan `src/app/not-found.tsx`. Karena `loading.tsx` men-stream halaman, `notFound()` di halaman proyek tetap berstatus HTTP 200 di browser, tetapi isinya layar "Halaman tidak ditemukan";
  - aksi klien menampilkan status prosesnya ("Memulai…", "Menyimpan…") dan pesan error koneksi dalam Bahasa Indonesia (`role="alert"`).
- Konfirmasi selalu `ConfirmPanel` (`src/components/ui/confirm-panel.tsx`), tidak pernah `window.confirm`: fokus pindah ke tombol konfirmasi saat muncul, Escape sama dengan Batal, dan pemanggil mengembalikan fokus ke tombol pemicu (`requestAnimationFrame`). Contoh: `stage-runner.tsx`, `delete-project-button.tsx`.
- Keyboard: tautan pertama setiap halaman "Lewati ke konten utama" (`layout.tsx`) menuju `<main id="konten">`; setiap halaman baru wajib punya `main#konten`. Fokus memakai `:focus-visible` global (cincin aksen 2 px); jangan memakai `outline-none`. Elemen di dalam wadah `overflow-hidden` memakai `focus-visible:-outline-offset-2` agar cincinnya tidak terpotong. Wilayah yang digulir ke samping (tabel dan blok kode di `MarkdownPreview`) diberi `tabIndex={0}`.
- Kontras: `test/unit/components/contrast.test.ts` menghitung rasio WCAG setiap pasangan teks dan latar di `PAIRS` (`test/helpers/contrast.ts`) untuk kedua tema dari `globals.css`; latar beralfa dihitung di atas surface dan bg. Pasangan warna baru di UI ditambahkan ke `PAIRS`. `--text-faint` tidak dipakai di atas `--surface-raised` (4,44 di mode gelap).
- Pembaca dokumen (tahap 6–7, `Prd.dc.html`): `MarkdownPreview` memberi heading `##` id berurutan (`bagian-1`, …) yang sama dengan `documentOutline` (`markdown-outline.ts`); `DocumentToc` tampil di kolom kiri mulai lebar `lg`. Bagian 8 PRD diberi keterangan "Disusun aplikasi" (`appendix-note`). `DocumentCard` dan `ExportPanel` di `document-panels.tsx`.
- **Flowchart fitur** (FR-12, D-13, T-028):
  - data dan posisi disusun server oleh `projectGraph`/`buildGraph` (`src/projects/graph.ts`) dari tahap 4 (`featureDraft`: fitur MVP dan rekomendasi yang diterima), 7a, dan 7b yang berlaku, tanpa pemanggilan `claude`. Halaman memanggilnya langsung; `GET /api/projects/{id}/graph` memakai fungsi yang sama (409 sebelum tahap 4);
  - posisi deterministik: pohon kiri ke kanan, kolom per kedalaman (`COLUMN_GAP`), satu baris per daun (`ROW_GAP`), induk di tengah anak pertama dan terakhirnya. Node dicatat induk lebih dulu, sehingga urutan Tab mengikuti pohon;
  - id node: `project`, `phase-<n>`, `phase-rekomendasi` (fitur rekomendasi yang diterima belum punya fase), `feature-<kode>`, `sub-<kode>-<i>`, `task-<id>`. Task tanpa fitur (hapus notes) di bawah fasenya;
  - komponen di `src/components/feature-graph/`: `FeatureGraph` (klien, React Flow tidak bisa digeser node-nya atau disambung), `GraphNode` (satu node kustom untuk semua jenis), dan `NodeDetail` (komponen murni, panel detail);
  - pilihan node lewat `onSelectionChange` React Flow, jadi klik dan keyboard (Tab ke node, Enter atau Spasi; Escape membatalkan) memakai jalur yang sama. Label pembaca layar dari `nodeAriaLabel`, teks kontrol dari `ariaLabelConfig` (Bahasa Indonesia, tombol "Pas ke layar");
  - warna: variabel `--xy-*` dari `@xyflow/react/dist/style.css` diganti token di `globals.css`, di luar `@layer` karena CSS React Flow tidak berlapis. Cincin fokus node dan target sentuh tombol kontrol 44 px dikembalikan di sana;
  - tampil di layar tahap 4 (setelah output tahap 4 ada) dan tahap 7 (setelah daftar task 7a ada), lewat `FeatureGraphSection`.
- Banner job berjalan (`StageRunner`): hanya baris status yang `role="status"`; waktu berjalan yang berganti setiap detik tidak diumumkan. Bilah progres bernilai bila ada `estimateMs` (`jobProgress`, maksimal 95% sebelum selesai, tidak tentu setelah melewati perkiraan); perkiraan tahap 6–7 dari `bannerEstimate`, angka yang sama dengan konfirmasi.

## Test

- Integration test yang butuh database memakai `createTestDb()` dari `test/helpers/db.ts`: file SQLite baru yang sudah dimigrasi di folder sementara OS, dihapus lewat `close()` di `afterEach`. Contoh: `test/int/db/schema.int.test.ts`.
- Unit test di `test/unit/**`, mengikuti struktur folder sumber (`scripts/lib/prereq-checks.mjs` → `test/unit/scripts/prereq-checks.test.ts`). Test yang butuh file memakai folder sementara (`mkdtempSync`) dan menghapusnya di `afterEach`.
- Interaksi komponen klien (klik, state) diuji dengan DOM sungguhan lewat `happy-dom`: tambahkan `// @vitest-environment happy-dom` di baris pertama file test, render dengan `createRoot` dan `act` dari React, dan stub `fetch` dengan `vi.stubGlobal`. Contoh: `test/unit/projects/run-confirmation.test.tsx`. Test tampilan statis tetap memakai `renderToStaticMarkup`.
- Teks UI dan pesan untuk user dalam Bahasa Indonesia.
- Test end-to-end (`test/e2e/`, Playwright):
  - `playwright.config.ts` menjalankan `pnpm build && pnpm start --port 3517` dengan lingkungan dari `test/e2e/environment.ts`: folder sementara OS berisi database (`DATABASE_PATH`), repo template buatan (`TEMPLATE_DIR`), folder proyek turunan template (repo Git) sebagai tujuan export, dan penanda runner palsu. Database utama tidak pernah dipakai. Folder sisa run sebelumnya dihapus saat run berikutnya dimulai;
  - lingkungan dibuat sekali di proses utama Playwright; worker membaca path-nya dari `PRD_E2E_DIR` lewat `e2eEnvironment(dir)`;
  - config dan spec tidak mengimpor kode `src/` yang memakai class dengan static field (`AppError`, `ClaudeRunError`): transform TypeScript Playwright gagal memuatnya. Nilai yang dibutuhkan (misalnya penanda placeholder) ditulis ulang dengan komentar sumbernya;
  - NFR-02: `CLAUDE_COMMAND` menunjuk `test/helpers/fake-claude-cli.mjs` mode `flow`, dan `claude`/`claude.cmd` di PATH server diganti shim yang keluar dengan kode 97;
  - satu worker dan satu server, jadi test berjalan berurutan. Build memakai `.next` bawaan; `next build` tidak menghapus `.next/dev`, jadi `pnpm dev` yang sedang berjalan tidak terganggu, tetapi hasil `pnpm build` sebelumnya tertimpa;
  - interaksi lewat role dan label yang tampil di layar; `data-testid` yang sudah ada (`runner-<tahap>`, `job-banner`, `attempt-note`, `export-written`) untuk wilayah layar. Yang tidak tampil di layar (`stage_runs`, versi dokumen) dibaca dari database read-only;
  - output kegagalan (screenshot, trace) di `.check-logs/playwright/`.
