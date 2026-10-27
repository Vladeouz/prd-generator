# PRD Generator

Aplikasi web lokal yang mengubah ide proyek menjadi `docs/PRD.md` dan `docs/TASKS.md` untuk proyek yang dibuat dari [template starter](https://github.com/Vladeouz/profil-a-template). Aplikasi memanggil Claude Code (`claude -p`) di laptop kamu, jadi memakai langganan Claude tanpa API key. Spesifikasi lengkap ada di [`docs/PRD.md`](docs/PRD.md).

## Prasyarat

| Prasyarat | Keterangan |
| --- | --- |
| Node.js 24 | Lihat `.nvmrc` |
| pnpm 12.6.0 | `corepack enable` |
| Git | |
| Claude Code | Perintah `claude` tersedia dan sudah login |
| `.env` | Disalin dari `.env.example` |
| `TEMPLATE_DIR` | Path absolut ke salinan lokal repo template |
| Browser Playwright | `pnpm exec playwright install chromium` sekali per mesin, untuk test end-to-end di `pnpm check` |

## Dari clone sampai aplikasi berjalan

Perintah di bawah berjalan di CMD, PowerShell, dan Git Bash.

1. Clone aplikasi ini dan repo template (template dibaca, tidak diubah):

   ```
   git clone https://github.com/Vladeouz/prd-generator.git
   git clone https://github.com/Vladeouz/profil-a-template.git
   cd prd-generator
   ```

2. Pasang dependency dan browser test:

   ```
   pnpm install
   pnpm exec playwright install chromium
   ```

3. Buat `.env`, lalu isi `TEMPLATE_DIR` dengan path absolut folder template dari langkah 1 (contoh `D:\dev\profil-a-template`):

   ```
   copy .env.example .env      (Git Bash: cp .env.example .env)
   ```

4. Periksa prasyarat sampai semua baris berstatus OK:

   ```
   pnpm prereq
   ```

5. Jalankan aplikasi dan buka http://127.0.0.1:3000 (server hanya mendengarkan `127.0.0.1`):

   ```
   pnpm dev
   ```

   Untuk pemakaian sehari-hari, versi produksi lebih ringan: `pnpm build`, lalu `pnpm start`.

6. Buka **Pengaturan** dan pastikan repo template Valid, Claude Code Terpasang, dan profil model sesuai harapan (bawaan `sonnet`/`low` untuk tahap penulisan dan `opus`/`medium` untuk review kedua).

### Bila server dijalankan dari dalam Claude Code

Variabel env proses menang atas `.env`. Shell sesi Claude Code membawa `CLAUDE_EFFORT` miliknya sendiri, sehingga server yang dijalankan dari sana diam-diam memakai effort itu (uji T-018: `medium`, bukan `low`). Jalankan dari terminal biasa, atau hapus variabelnya dulu:

```
env -u CLAUDE_EFFORT -u CLAUDE_MODEL -u CLAUDE_MODEL_REASONING -u CLAUDE_EFFORT_REASONING pnpm start
```

Di PowerShell: `Remove-Item Env:CLAUDE_MODEL, Env:CLAUDE_EFFORT, Env:CLAUDE_MODEL_REASONING, Env:CLAUDE_EFFORT_REASONING -ErrorAction SilentlyContinue`, lalu `pnpm start`.

Halaman Pengaturan menampilkan profil yang benar-benar dipakai beserta asal nilainya (`.env`, bawaan, atau variabel lingkungan proses). Nilai dari variabel lingkungan proses yang berbeda dari bawaan diberi peringatan "Periksa", dan `pnpm prereq` menampilkan peringatan yang sama.

## Memakai aplikasi

1. **Buat proyek** di beranda: nama dan ide dalam beberapa kalimat (siapa penggunanya, apa yang dilakukan, masalah yang diselesaikan).
2. Jalankan tahap satu per satu. Setiap tahap adalah satu pemanggilan Claude Code yang berjalan di latar; progres dan cuplikan teks tampil selama berjalan.

   | Tahap | Yang kamu lakukan |
   | --- | --- |
   | 2 Klarifikasi produk | Jawab pertanyaan, atau lewati untuk memakai default |
   | 3 Klarifikasi teknis | Jawab pertanyaan platform, notifikasi, pembayaran, dan sejenisnya |
   | 4 Struktur fitur | Periksa fitur MVP per fase dan flowchart-nya, centang fitur rekomendasi yang mau ikut |
   | 5 Review kritis | Pilih opsi untuk setiap temuan (bawaan: rekomendasi) |
   | 6 PRD | Tulis PRD, lalu review kedua; perbaikan yang dipilih membuat PRD ditulis ulang sekali |
   | 7 TASKS | Daftar task, lalu detail per fase (berjalan bersamaan) |
   | 8 Export | Tulis `docs/PRD.md` dan `docs/TASKS.md` ke folder proyek |

   Tahap 6 dan 7 meminta konfirmasi dengan perkiraan durasi dan token. Pemakaian token per tahap tampil di setiap layar. Satu proyek biasanya ±10 menit dan ±$2–3 kuota (uji T-018).
3. **Siapkan proyek tujuan** dari template, mengikuti README template: clone, `pnpm install`, `pnpm init-project <nama>`, `.env`, `docker compose up -d --wait`, `pnpm check` hijau, lalu commit.
4. **Export** di tahap 8 dengan path absolut folder proyek itu. Aplikasi hanya menulis `docs/PRD.md` dan `docs/TASKS.md`, dan menolak menimpa dokumen yang bukan placeholder kecuali kamu mengizinkannya. Commit kedua file itu.
5. Jalankan Claude Code di folder proyek dan minta dia mengerjakan task berikutnya sesuai `CLAUDE.md` template.

Menjalankan ulang sebuah tahap membuat hasil tahap sesudahnya tidak berlaku: output-nya tidak dipakai lagi, dan PRD atau TASKS yang dihasilkan tahap sesudahnya dihapus. Tahap-tahap itu perlu dijalankan ulang berurutan.

### Mesin dengan RAM 16 GB

Proyek template memakai Docker (PostgreSQL dan emulator Firebase). Di Windows, VM WSL Docker (VmmemWSL) bisa menahan 2–3 GB walau container hanya memakai ±0,5 GB (uji T-018). Bila memori sempit saat sesi Claude Code berjalan, batasi VM lewat `%USERPROFILE%\.wslconfig`, lalu jalankan `wsl --shutdown` dan nyalakan ulang Docker Desktop:

```ini
[wsl2]
memory=4GB

[experimental]
autoMemoryReclaim=dropCache
```

## Perintah

| Perintah | Kegunaan |
| --- | --- |
| `pnpm prereq` | Memeriksa prasyarat dan menampilkan saran perbaikan |
| `pnpm dev` | Server pengembangan |
| `pnpm build` lalu `pnpm start` | Build dan jalankan versi produksi |
| `pnpm check` | Semua verifikasi (Biome, typecheck, unit, integration, end-to-end); output langkah yang gagal di `.check-logs/` |
| `pnpm format` | Memperbaiki format dan lint otomatis |
| `pnpm claude:smoke` | Satu pemanggilan `claude` sungguhan dengan prompt kecil (memakai kuota) |
| `pnpm db:generate` | Membuat migrasi setelah skema database diubah |

Data aplikasi ada di `data/prd-generator.db` (SQLite, tidak di-commit). Untuk mencoba UI tanpa memakai kuota, lihat variabel `CLAUDE_COMMAND` dan `FAKE_CLAUDE_*` di `.env.example`.

## Pengembangan

Konvensi pengembangan ada di [`docs/conventions.md`](docs/conventions.md), aturan kerja agent di [`CLAUDE.md`](CLAUDE.md), rencana task di [`docs/TASKS.md`](docs/TASKS.md), dan log setiap task di [`docs/logs/`](docs/logs/).
