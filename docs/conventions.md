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

Pasang dengan `pnpm add -E <nama>` (atau `-D -E`) agar versi langsung pasti. Paket yang butuh build script saat install didaftarkan di `allowBuilds` pada `pnpm-workspace.yaml` (belum ada); build script yang tidak dibutuhkan didaftarkan dengan nilai `false` beserta alasannya.

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

- Semua script otomatisasi ditulis dalam Node (`.mjs`) di `scripts/`, bukan shell. Nama file sama dengan nama script-nya (`pnpm prereq` → `scripts/prereq.mjs`); modul pendukung di `scripts/lib/`.
- Script memanggil perintah eksternal lewat `spawnSync(perintah, { shell: true })` agar `pnpm.cmd`, `claude.cmd`, dan sejenisnya ditemukan di Windows.
- Nama script tidak boleh sama dengan perintah bawaan pnpm (misalnya `test`, `init`, `doctor`), karena perintah bawaan selalu menang. Cek dengan `pnpm help <nama>`: bila keluar `unrecognized subcommand`, nama itu aman. Pengecualian: `start`, karena perintah bawaan `pnpm start` memang menjalankan `scripts.start`. Karena itu unit test memakai `test:unit`, bukan `test`.
- Server (`dev`, `start`) selalu dengan `--hostname 127.0.0.1` (NFR-01).

### `pnpm check`

`scripts/check.mjs` menjalankan Biome, typecheck, dan unit test berurutan (integration dan end-to-end ditambahkan di T-003 dan T-017). Semua langkah selalu dijalankan walaupun ada yang gagal; ringkasan di akhir menampilkan status dan waktu per langkah, dan output lengkap langkah yang gagal disimpan di `.check-logs/<waktu run>/` (di-ignore Git). Langkah verifikasi baru ditambahkan ke `STEPS`. Harus hijau sebelum task dicentang.

## Lint dan format (Biome)

- Konfigurasi `biome.json`, sama dengan template: preset `recommended`; spasi 2, lebar baris 100, LF, kutip tunggal, titik koma selalu.
- Biome membaca `.gitignore`. `docs/reference/` dikecualikan karena berisi bahan rujukan apa adanya.

## TypeScript dan Next.js

- `strict` + `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`import type` untuk tipe), alias `@/*` → `src/*`. `next typegen` / `next dev` menambah `esModuleInterop` ke `tsconfig.json` bila belum ada; biarkan.
- File `.mjs` di `scripts/` ikut di-typecheck (`allowJs`); tipe parameter yang tidak bisa disimpulkan ditulis dengan JSDoc (contoh: `scripts/lib/prereq-checks.mjs`).
- `next.config.ts` memakai `agentRules: false`, karena tanpa itu `next dev` 16.4 membuat `AGENTS.md` di root. Aturan agent hanya di `CLAUDE.md`.
- Styling dengan Tailwind CSS 4 lewat `@tailwindcss/postcss` (`postcss.config.mjs`, `src/app/globals.css`).

## Test

- Unit test di `test/unit/**`, mengikuti struktur folder sumber (`scripts/lib/prereq-checks.mjs` → `test/unit/scripts/prereq-checks.test.ts`). Test yang butuh file memakai folder sementara (`mkdtempSync`) dan menghapusnya di `afterEach`.
- Teks UI dan pesan untuk user dalam Bahasa Indonesia.
