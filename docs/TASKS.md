# TASKS — PRD Generator

Setiap task dikerjakan dalam satu sesi. Kriteria bertanda **(manual)** diverifikasi user: agent menuliskan langkahnya lengkap dengan persiapan, lalu menunggu konfirmasi sebelum mencentang. Kriteria manual yang memakai `claude` sungguhan memakai kuota langganan; agent menyebut perkiraan durasinya sebelum user menjalankannya.

## Fase 0 — Fondasi dan spike

- [x] T-001 Proyek Next.js, Biome, `pnpm prereq`, dan `pnpm check` awal
  - layer: infra · depends_on: - · refs: NFR-03, NFR-05, D-01
  - files: `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.gitattributes`, `.gitignore`, `.editorconfig`, `.env.example`, `biome.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `src/app/**` (halaman awal), `scripts/prereq.mjs`, `scripts/check.mjs`, `README.md`, `docs/conventions.md` (kerangka)
  - done when: `pnpm dev` menyajikan halaman awal hanya di `127.0.0.1`; `pnpm prereq` menampilkan status setiap prasyarat di bagian 3 PRD dengan saran perbaikan, dan terbukti gagal dengan pesan jelas saat `.env` belum ada dan saat `TEMPLATE_DIR` menunjuk folder yang bukan repo template; `pnpm check` menjalankan Biome, typecheck, dan unit test (minimal satu test), menampilkan ringkasan, dan menyimpan output langkah gagal di `.check-logs/`; nama script root diperiksa tidak bentrok dengan perintah bawaan pnpm

- [x] T-002 Spike job berdurasi panjang di proses server Next.js
  - layer: spike · depends_on: T-001 · refs: FR-02, D-03
  - files: `spikes/jobs/` (sementara, dihapus di T-019)
  - done when: route handler memulai child process Node palsu yang berjalan 3 menit dan menulis progres; status bisa dibaca lewat polling dari halaman lain; perilaku dicatat di log untuk empat kondisi: navigasi antar halaman, perubahan file saat `pnpm dev` (hot reload), `pnpm build` + `pnpm start` lalu server dihentikan di tengah job, dan dua job dimulai bersamaan; log berisi rekomendasi tetap memakai D-03 atau pindah ke proses worker terpisah

- [x] T-003 Database SQLite: skema, migrasi, dan database test
  - layer: db · depends_on: T-001 · refs: bagian 4 PRD, D-02
  - files: `drizzle.config.ts`, `drizzle/**`, `src/core/db/**`, `vitest.int.config.ts`, `test/int/db/**`, `test/helpers/db.ts`
  - done when: semua tabel, CHECK, partial unique index (`is_current`, satu job aktif), dan cascade di bagian 4 PRD terbukti oleh integration test; integration test memakai file database sementara yang tidak menyentuh database utama; migrasi idempoten; `drizzle-kit generate` ulang tidak menghasilkan perubahan; build script `better-sqlite3` diatur eksplisit lewat `allowBuilds` dan `pnpm install --frozen-lockfile` exit 0; `pnpm check` menjalankan integration test dan hijau

- [x] T-004 Port `ClaudeRunner`: runner CLI, runner palsu, dan pengaman test
  - layer: claude · depends_on: T-001 · refs: FR-02, NFR-02, D-07, bagian 3 PRD (Pemanggilan Claude Code)
  - files: `src/claude/**`, `test/unit/claude/**`, `test/int/claude/**`, `test/fixtures/claude/**`, `test/helpers/fake-claude-cli.mjs`
  - done when: runner CLI terbukti (integration test dengan script Node palsu sebagai perintah `claude`) mengirim prompt lewat stdin, memakai bentuk perintah Windows dan non-Windows sesuai bagian 3 PRD, berjalan di folder sementara kosong, membaca `result` dan `usage` dari envelope, dan mengembalikan error yang jelas untuk exit code bukan 0, envelope rusak, `is_error`, dan batas waktu; runner palsu membaca fixture yang dibangun dari `docs/reference/e2e-output/`; memanggil runner CLI saat `NODE_ENV=test` gagal keras (NFR-02); **(manual)** satu pemanggilan sungguhan dengan prompt kecil dari script yang disediakan task ini berhasil dan mencatat token serta durasi; `pnpm check` hijau

- [x] T-005 Antrean job dan eksekusi tahap generik
  - layer: jobs · depends_on: T-002, T-003, T-004 · refs: FR-02, D-03, D-08
  - files: `src/jobs/**`, `src/stages/run-stage.ts`, `test/unit/jobs/**`, `test/int/jobs/**`
  - done when: integration test dengan runner palsu membuktikan setiap kriteria FR-02: satu job dalam satu waktu (`409`), percobaan ulang sekali dengan daftar error lalu keduanya tercatat di `stage_runs`, job `running` menjadi `interrupted` saat startup, kegagalan runner menjadi `failed` tanpa output setengah jadi; eksekusi mencatat versi prompt, output mentah, token, dan durasi; implementasi mengikuti rekomendasi spike T-002; `pnpm check` hijau

- [x] T-006 Pembaca template dan halaman pengaturan
  - layer: app · depends_on: T-001 · refs: FR-11, D-06
  - files: `src/template/**`, `src/app/settings/**`, `src/app/api/settings/**`, `test/unit/template/**`, `test/int/template/**`
  - done when: integration test dengan folder template buatan membuktikan pembacaan `docs/conventions.md` dan commit Git saat ini, serta penolakan folder tanpa `docs/conventions.md` atau `scripts/init-project.mjs`; halaman pengaturan menampilkan `TEMPLATE_DIR`, commit, ketersediaan `claude`, dan masalah bila ada; **(manual)** dengan `TEMPLATE_DIR` menunjuk salinan lokal `profil-a-template`, halaman pengaturan menampilkan commit yang sama dengan `git log -1` di folder itu; `pnpm check` hijau

## Fase 1 — Alur 8 tahap

- [x] T-007 Proyek dan input ide
  - layer: app · depends_on: T-003 · refs: FR-01
  - files: `src/projects/**`, `src/app/page.tsx`, `src/app/projects/**`, `src/app/api/projects/**`, test terkait
  - done when: setiap kriteria FR-01 terbukti oleh test route handler dan test komponen; `DELETE` proyek dengan job berjalan menghasilkan `409`; hapus proyek menghapus semua datanya (dibuktikan integration test); halaman utama punya tautan ke `/settings` (dibuktikan test komponen); `pnpm check` hijau

- [x] T-008 Tahap 2: klarifikasi produk
  - layer: app · depends_on: T-005, T-007 · refs: FR-03
  - files: `prompts/stage-2.md`, `src/stages/stage-2/**`, `src/app/projects/[id]/**` (layar tahap 2), `src/app/api/projects/[id]/answers/**`, test terkait
  - done when: prompt dan validator diturunkan dari `docs/reference/validate-claude-p-v2.mjs` dengan perbaikan di FR-03; validator terbukti menerima fixture nyata dan menolak contoh rusak (jumlah pertanyaan tidak sesuai clarity, default di luar opsi, topik teknis); setiap kriteria FR-03 terbukti oleh test; **(manual)** dengan `claude` sungguhan dan ide "Catatan keuangan pribadi.", tahap 2 lolos validator dan pertanyaannya tampil dan bisa dijawab di UI; `pnpm check` hijau

- [x] T-009 Tahap 3: klarifikasi teknis dan pilihan profil
  - layer: app · depends_on: T-008 · refs: FR-04
  - files: `prompts/stage-3.md`, `src/stages/stage-3/**`, layar tahap 3, `src/app/api/projects/[id]/profile/**`, test terkait
  - done when: prompt dan validator diturunkan dari `docs/reference/validate-claude-p-stage3-v2.mjs` dengan perbaikan di FR-04; validator menolak teks yang menyebut "Profil A" atau "Profil B" dan default yang melanggar tabel kebijakan; setiap kriteria FR-04 terbukti oleh test, termasuk layar pilihan saat rekomendasi Profil B; **(manual)** dengan `claude` sungguhan, ide katalog UMKM dari uji sebelumnya menghasilkan pilihan eksplisit sesuai FR-04, dan ide booking futsal langsung mendapat stack yang tersedia; `pnpm check` hijau

- [x] T-020 Fondasi desain: token, komponen dasar, dan tata letak
  - layer: app · depends_on: T-009 · refs: `docs/design/design.md`, NFR-03
  - files: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/**`, `src/app/page.tsx`, `src/app/projects/**`, `src/app/settings/**`, test terkait
  - done when: semua token warna, tipografi, radius, dan jarak di `docs/design/design.md` didefinisikan sebagai CSS custom property untuk mode gelap dan terang, dan komponen tidak memakai nilai warna mentah (dibuktikan dengan pencarian `#[0-9a-fA-F]{3,6}` di `src/components` dan `src/app` yang hanya menemukan `globals.css`); komponen dasar di `design.md` ada dengan test komponen; tombol tema berganti antara gelap dan terang dan pilihannya bertahan setelah dimuat ulang; beranda, halaman proyek (tahap 2 dan 3), dan pengaturan dibangun ulang dengan komponen dan tata letak `design.md`, mengikuti `docs/design/mockups/Main.dc.html` dan `Questions.dc.html`; `StickyActionBar` menyebut tahap berikutnya di samping tombol simpan; test komponen dan integration test yang sudah ada tetap lulus; **(manual)** user membandingkan beranda dan layar tahap 2 di Chrome dengan mockup dalam kedua tema, dan memastikan tampilan di lebar 390 px tetap terbaca tanpa geser ke samping; `pnpm check` hijau

- [x] T-010 Tahap 4: struktur fitur
  - layer: app · depends_on: T-009, T-020 · refs: FR-05
  - files: `prompts/stage-4.md`, `src/stages/stage-4/**`, layar tahap 4, `src/app/api/projects/[id]/features/**`, test terkait
  - done when: validator diturunkan dari `validateStage4` di `docs/reference/e2e-gym.mjs`; setiap kriteria FR-05 terbukti oleh test; fitur rekomendasi yang tidak dicentang masuk non-goals pada input tahap berikutnya (dibuktikan test); `pnpm check` hijau

- [x] T-011 Tahap 5: review kritis
  - layer: app · depends_on: T-010 · refs: FR-06, D-05
  - files: `prompts/stage-5.md`, `src/stages/stage-5/**`, layar tahap 5, `src/app/api/projects/[id]/decisions/**`, test terkait
  - done when: setiap kriteria FR-06 terbukti oleh test, termasuk keempat kesalahan `injectFlaws` tertangkap dengan fixture nyata; pilihan user tersimpan sebagai keputusan `RV-xx` dengan konsekuensinya; `pnpm check` hijau

- [x] T-012 Tahap 6: PRD
  - layer: app · depends_on: T-006, T-011 · refs: FR-07, FR-02, D-05, D-06
  - files: `prompts/stage-6.md`, `src/stages/stage-6/**`, `src/projects/compose-prd.ts`, layar tahap 6 dan pratinjau Markdown, test terkait
  - done when: prompt berisi `docs/conventions.md` dari `TEMPLATE_DIR` apa adanya dan meminta bagian 1 sampai 7 saja; bagian 8 disusun aplikasi dari keputusan, jawaban `guess`, dan asumsi (dibuktikan test yang memastikan teks keputusan sama persis dengan data, termasuk kasus seperti RV-08 di uji end-to-end); validator diturunkan dari `validatePrd` di `docs/reference/e2e-gym.mjs` dan menerima fixture yang dibangun dari `docs/reference/e2e-output/PRD.md` (tanpa bagian 8); layar menampilkan progres job dan pratinjau PRD; **(manual)** dengan `claude` sungguhan, satu proyek dijalankan sampai tahap 6 dan PRD lolos validator; `pnpm check` hijau

- [x] T-013 Review kedua setelah PRD
  - layer: app · depends_on: T-012 · refs: FR-07
  - files: `prompts/review-2.md`, `src/stages/review-2/**`, layar review kedua, test terkait
  - done when: review memeriksa data model, aturan bisnis tanpa constraint, dan rute UI tanpa endpoint pendukung; test dengan fixture PRD yang sengaja tidak punya `GET` per item untuk form edit (kasus uji agent `daftar-belanja`) menghasilkan temuan `RV2-xx`; memilih perbaikan membuat PRD ulang tepat satu kali; `pnpm check` hijau

- [x] T-014 Tahap 7: TASKS
  - layer: app · depends_on: T-013 · refs: FR-08
  - files: `prompts/stage-7.md`, `src/stages/stage-7/**`, layar tahap 7, test terkait
  - done when: validator diturunkan dari `validateTasks` di `docs/reference/e2e-gym.mjs` dengan aturan tambahan FR-08; validator terbukti menolak `docs/reference/e2e-output/TASKS.md` karena berisi task setup yang sudah disediakan template, dan menerima fixture yang memenuhi FR-08; setiap kriteria FR-08 terbukti oleh test; **(manual)** dengan `claude` sungguhan, proyek dari T-012 menghasilkan TASKS yang lolos validator; `pnpm check` hijau

- [x] T-015 Export
  - layer: app · depends_on: T-014 · refs: FR-09, NFR-01
  - files: `src/projects/export.ts`, `src/app/api/projects/[id]/export/**`, `src/app/api/projects/[id]/documents/**`, layar export, test terkait
  - done when: setiap kriteria FR-09 terbukti oleh integration test dengan folder proyek buatan (turunan template, bukan turunan, path relatif, PRD bukan placeholder); path tujuan tidak pernah berasal dari output AI; **(manual)** ekspor ke salinan baru proyek yang dibuat dengan `pnpm init-project` berhasil dan `git status` di proyek itu hanya menampilkan `docs/PRD.md` dan `docs/TASKS.md`; `pnpm check` hijau

- [x] T-016 Pemakaian token dan menjalankan ulang tahap
  - layer: app · depends_on: T-015 · refs: FR-10, FR-02
  - files: `src/projects/usage.ts`, komponen ringkasan pemakaian, dialog konfirmasi tahap 6–7, test terkait
  - done when: setiap kriteria FR-10 terbukti oleh test; menjalankan ulang sebuah tahap menandai output tahap sesudahnya tidak berlaku dan menghapus dokumen yang bergantung padanya (dibuktikan integration test); `pnpm check` hijau

## Fase 2 — Integrasi

- [x] T-021 Penyempurnaan UI/UX dan aksesibilitas
  - layer: app · depends_on: T-016 · refs: `docs/design/design.md`
  - files: `src/components/**`, `src/app/**`, test terkait
  - done when: layar review kritis dan PRD mengikuti `docs/design/mockups/Review.dc.html` dan `Prd.dc.html`; setiap layar punya keadaan kosong, memuat, dan error yang jelas dalam Bahasa Indonesia; semua elemen interaktif bisa dipakai dengan keyboard dan punya fokus yang terlihat; kontras teks memenuhi `design.md` di kedua tema (diperiksa dengan alat pemeriksa kontras dan hasilnya dicatat di log); **(manual)** user menjalankan satu proyek dari beranda sampai ekspor dengan runner palsu (`CLAUDE_COMMAND`) di kedua tema dan lebar 390 px, lalu mengonfirmasi tampilannya; `pnpm check` hijau

- [x] T-017 Test end-to-end alur lengkap dengan runner palsu
  - layer: test · depends_on: T-016, T-021 · refs: FR-01 sampai FR-10, NFR-02, NFR-05
  - files: `playwright.config.ts`, `test/e2e/**`, `scripts/check.mjs`
  - done when: Playwright menjalankan satu proyek dari input ide sampai export ke folder buatan, memakai runner palsu dan fixture nyata, termasuk satu tahap yang gagal validasi lalu berhasil setelah percobaan ulang; `pnpm check` menjalankan test end-to-end dan tetap di bawah 5 menit; `pnpm check` dijalankan 5 kali berturut-turut tanpa kegagalan acak

## Fase 3 — Efisiensi token, streaming, dan flowchart

Baseline dari uji T-012 ada di bagian 3 PRD (Pemanggilan Claude Code); targetnya NFR-06.

- [x] T-022 Spike efisiensi pemanggilan `claude -p`
  - layer: spike · depends_on: T-017 · refs: D-09, D-10, D-12, NFR-06, bagian 3 PRD (Pemanggilan Claude Code)
  - files: `spikes/claude-efficiency/` (sementara, dihapus di T-019), `docs/logs/T-022.md`
  - done when: nama flag diverifikasi dari `claude --help` versi terpasang dan dicatat di log untuk: model, mengatur extended thinking, system prompt sendiri, tanpa tool, tanpa server MCP dan pengaturan user, dan `stream-json`; script Node menjalankan prompt tahap 2 dan tahap 6 dari data proyek uji T-012 dalam empat konfigurasi (A: perintah sekarang; B: A + `--model sonnet` dan pengaturan thinking; C: B + pengurang overhead; D: C + bagian conventions terpilih), masing-masing tetap memakai folder sementara kosong dan stdin; log berisi tabel token input, token output, biaya, durasi, dan ukuran output per konfigurasi; token thinking per konfigurasi tercatat dan cara menguranginya terbukti (thinking tidak bisa dimatikan di Sonnet 5.5; kriteria diubah dengan persetujuan user), dan terbukti bahwa `stream-json` mengirim potongan teks sebelum selesai serta event akhirnya masih berisi `usage` dan `total_cost_usd`; output tahap 6 konfigurasi D lolos validator tahap 6 yang ada; log berisi rekomendasi bentuk perintah final, daftar heading `docs/conventions.md` per tahap (6, review 2, 7a, 7b), batas ukuran PRD, dan apakah angka NFR-06 realistis; **(manual)** user menjalankan script (perkiraan 30–45 menit dan sekitar $3–5 kuota, sebagian besar dari konfigurasi A); tidak ada perubahan di `src/`

- [ ] T-023 Runner: model, pengurang overhead, dan streaming
  - layer: claude · depends_on: T-022 · refs: D-09, D-12, FR-02, NFR-02, bagian 3 PRD (Pemanggilan Claude Code)
  - files: `src/claude/**`, `src/core/config/**` (env), `.env.example`, `scripts/claude-smoke.mjs` atau script smoke yang ada, `test/unit/claude/**`, `test/int/claude/**`, `test/fixtures/claude/**`, `test/helpers/fake-claude-cli.mjs`
  - done when: runner CLI menyusun perintah sesuai rekomendasi T-022 di Windows dan non-Windows (dibuktikan unit test); `CLAUDE_MODEL` dibaca dari env dengan bawaan `sonnet` dan ada di `.env.example`; runner membaca `stream-json` baris demi baris, memanggil callback progres dengan potongan teks, dan mengambil `result`, `usage`, serta biaya dari event akhir; semua kasus error yang sudah ada (exit code bukan 0, output rusak, `is_error`, batas waktu) tetap terbukti dengan script palsu yang kini mengeluarkan format stream; runner palsu bisa mengirim potongan bertahap dari fixture; pengaman `NODE_ENV=test` tetap gagal keras; **(manual)** smoke test dengan `claude` sungguhan berhasil memakai perintah baru dan mencatat token serta durasi (perkiraan < 1 menit); `pnpm check` hijau

- [ ] T-024 Progres streaming di UI
  - layer: app · depends_on: T-023 · refs: FR-02, D-03, D-12
  - files: `src/jobs/**`, `src/app/api/jobs/[id]/stream/**`, `src/app/projects/[id]/stage-runner.tsx`, komponen progres di `src/components/**`, `test/unit/jobs/**`, `test/int/jobs/**`, `test/e2e/**`
  - done when: job menyimpan progres terakhir di memori (jumlah karakter, langkah ke-i dari n, cuplikan teks) dan `GET /api/jobs/{id}/stream` mengirim event `progress` lalu `done` (dibuktikan integration test dengan runner palsu bertahap); UI menampilkan progres nyata dan cuplikan teks, menggantikan bar yang hanya berdasarkan waktu; membuka ulang halaman di tengah job menampilkan progres terkini; polling `GET /api/jobs/{id}` tetap berfungsi sebagai cadangan; test end-to-end memastikan cuplikan teks tampil sebelum job selesai; `pnpm check` hijau

- [ ] T-025 Konvensi terpilih per tahap dan PRD ringkas
  - layer: app · depends_on: T-023 · refs: FR-07, FR-11, D-06, D-10, NFR-06
  - files: `src/template/**`, `prompts/stage-6.md`, `prompts/review-2.md`, `src/stages/stage-6/**`, `src/stages/review-2/**`, `test/unit/template/**`, `test/unit/stages/**`, `test/fixtures/claude/**`
  - done when: fungsi pemotong mengambil bagian `docs/conventions.md` per heading apa adanya sesuai daftar dari T-022 (dibuktikan unit test, termasuk sub-heading ikut terbawa); heading yang tidak ada membuat tahap gagal sebelum `claude` dipanggil dengan pesan yang menyebutnya, dan halaman pengaturan menampilkan masalah itu; prompt tahap 6 dan review 2 hanya berisi bagian terpilih, meminta PRD merujuk konvensi tanpa menyalin, dan versinya naik; validator tahap 6 menolak PRD yang menyalin paragraf atau blok kode konvensi dan memberi peringatan bila ukuran melewati batas NFR-06; fixture diperbarui dari output nyata T-022; **(manual)** dengan `claude` sungguhan, proyek uji dijalankan ulang dari tahap 6: durasi, token, dan ukuran PRD dicatat di log dan dibandingkan dengan baseline dan NFR-06 (perkiraan 2–4 menit); `pnpm check` hijau

- [ ] T-026 Tahap 7a: daftar task
  - layer: app · depends_on: T-025 · refs: FR-08, D-11, bagian 4 PRD
  - files: `drizzle/**` (migrasi `stage7a`, `stage7b`, `scope`), `src/core/db/schema.ts`, `prompts/stage-7a.md`, `src/stages/stage-7a/**`, `src/projects/prd-digest.ts`, `test/int/db/**`, `test/unit/stages/**`, `test/fixtures/claude/**`
  - done when: migrasi menambah `stage_runs.scope`, mengganti `stage7` di `stage_runs.stage` dengan `stage7a` dan `stage7b`, dan mengubah partial unique index ke (`project_id`, `stage`, `scope`), terbukti integration test dan idempoten; data `stage7` lama ditandai tidak berlaku tanpa error; ringkasan PRD (kode dan judul `FR-xx`, endpoint, tabel, fase dan fitur) disusun aplikasi dan terbukti unit test dengan fixture PRD; validator 7a membuktikan semua aturan FR-08 untuk 7a, termasuk menolak task setup template dan menuntut task penghapusan notes; fixture diturunkan dari `docs/reference/e2e-output/TASKS.md`; `pnpm check` hijau

- [ ] T-027 Tahap 7b: detail per fase dan penyusunan TASKS.md
  - layer: app · depends_on: T-024, T-026 · refs: FR-08, FR-02, FR-10, D-08, D-11
  - files: `prompts/stage-7b.md`, `src/stages/stage-7b/**`, `src/stages/run-stage.ts`, `src/projects/compose-tasks.ts`, `src/stages/stage-7/**` dan `prompts/stage-7.md` (dihapus), layar tahap 7, `test/**` terkait
  - done when: satu job tahap 7 menjalankan 7a (bila belum valid) lalu 7b per fase secara berurutan, masing-masing tercatat sebagai `stage_runs` sendiri dengan `scope` nomor fase; progres menampilkan langkah ke-i dari n; percobaan ulang berlaku per fase, dan menjalankan ulang hanya mengulang fase tanpa hasil valid (dibuktikan integration test dengan runner palsu yang gagal di fase 2); prompt 7b hanya berisi task fase itu dan bagian PRD yang dirujuknya; `docs/TASKS.md` disusun aplikasi, dengan `pnpm check` hijau di akhir setiap *done when* dan langkah persiapan manual (`.env`, Docker, Flutter web `--web-browser-flag=--incognito`) ditambahkan kode; hasil susunan lolos aturan FR-08; menjalankan ulang tahap 6 tetap membatalkan 7a dan 7b; perkiraan durasi dan token di konfirmasi FR-10 memakai angka baru; test end-to-end diperbarui; **(manual)** dengan `claude` sungguhan, proyek uji menjalankan tahap 7 sampai selesai; durasi, token, dan jumlah percobaan ulang dicatat dan dibandingkan dengan NFR-06 (perkiraan 3–5 menit); `pnpm check` hijau

- [ ] T-028 Flowchart fitur
  - layer: app · depends_on: T-021, T-026 · refs: FR-12, D-13, `docs/design/design.md`
  - files: `package.json` (`@xyflow/react` dipin), `docs/conventions.md` (versi), `src/projects/graph.ts`, `src/app/api/projects/[id]/graph/**`, `src/components/feature-graph/**`, `src/app/projects/[id]/**`, test terkait
  - done when: `GET /api/projects/{id}/graph` menyusun node dan edge dari data tahap 4 (hanya fitur yang diterima) dan 7a, dengan posisi yang deterministik (dibuktikan unit test); flowchart tampil di halaman proyek setelah tahap 4 dengan kontrol zoom dan "pas ke layar"; memilih node dengan klik atau keyboard membuka panel detail; warna hanya memakai token (pencarian `#[0-9a-fA-F]{3,6}` seperti T-020 tetap hanya menemukan `globals.css`); tidak ada pemanggilan `claude` tambahan; **(manual)** user membuka flowchart proyek uji di kedua tema dan di lebar 390 px, lalu mengonfirmasi graf terbaca dan bisa digeser; `pnpm check` hijau

## Fase 4 — Uji nyata dan penyelesaian

- [ ] T-018 Uji nyata: dari ide sampai Claude Code
  - layer: test · depends_on: T-027, T-028 · refs: semua FR, NFR-06
  - files: `docs/logs/T-018.md`
  - done when: **(manual)** user menjalankan satu ide nyata pilihannya dari tahap 1 sampai export dengan `claude` sungguhan; total durasi dan token tercatat di log dan dibandingkan dengan NFR-06; hasil ekspor diberikan ke Claude Code di proyek baru dari template, dan dua task pertama selesai tanpa keputusan konvensi di log-nya; temuan yang perlu diperbaiki dicatat sebagai usulan task

- [ ] T-019 Dokumentasi final dan pembersihan
  - layer: docs · depends_on: T-018 · refs: NFR-04
  - files: `docs/conventions.md`, `README.md`, `CLAUDE.md`, `spikes/` (dihapus)
  - done when: `docs/conventions.md` memuat semua konvensi bagian 3 PRD, versi library yang dipin, cara mengubah prompt (versi naik, fixture diperbarui), dan rujukan ke file contoh; README berisi urutan dari clone sampai aplikasi berjalan dan cara memakainya; `spikes/` dihapus; `pnpm check` hijau
