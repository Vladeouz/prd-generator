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
| `TEMPLATE_DIR` | Path absolut ke salinan lokal repo template (`git clone https://github.com/Vladeouz/profil-a-template.git`) |
| Browser Playwright | `pnpm exec playwright install chromium` sekali per mesin, untuk test end-to-end di `pnpm check` |

## Memulai

Perintah di bawah berjalan di CMD, PowerShell, dan Git Bash.

```
pnpm install
pnpm exec playwright install chromium
copy .env.example .env      (Git Bash: cp .env.example .env)
```

Isi `TEMPLATE_DIR` di `.env`, lalu:

```
pnpm prereq
pnpm dev
```

Buka http://127.0.0.1:3000. Server hanya mendengarkan `127.0.0.1`.

## Perintah

| Perintah | Kegunaan |
| --- | --- |
| `pnpm prereq` | Memeriksa prasyarat dan menampilkan saran perbaikan |
| `pnpm dev` | Server pengembangan |
| `pnpm build` lalu `pnpm start` | Build dan jalankan versi produksi |
| `pnpm check` | Semua verifikasi (Biome, typecheck, test); output langkah yang gagal di `.check-logs/` |
| `pnpm format` | Memperbaiki format dan lint otomatis |

Konvensi pengembangan ada di [`docs/conventions.md`](docs/conventions.md).
