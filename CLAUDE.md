# Aturan kerja untuk Claude Code

## Di awal setiap sesi

- Baca `docs/PRD.md`, `docs/conventions.md` (jika sudah ada), dan log task terakhir di `docs/logs/`.
- Pastikan working tree bersih (`git status`). Jika ada perubahan yang belum di-commit, laporkan ke user; jangan meng-commit-nya sendiri.
- Ambil task berikutnya dari `docs/TASKS.md`: task pertama yang belum dicentang dan semua `depends_on`-nya sudah dicentang.
- Sebelum mulai, periksa apakah sudah ada branch untuk task itu (`git branch --list "*t-xxx*"`). Jika ada, jangan mengerjakan ulang; laporkan ke user dan tanyakan apakah branch itu perlu digabung dulu.

## Mengerjakan task

- Kerjakan SATU task per sesi. Setelah task selesai atau terhenti, berhenti dan lapor, lalu tunggu instruksi user.
- Buat branch baru dari `master` bernama `<type>/t-xxx-<ringkas>` (type: feat, fix, chore, docs, test). Pesan commit: `<type>: <ringkasan> (T-xxx)`. Jangan merge ke `master`; merge dilakukan user setelah meninjau hasilnya.
- Ikuti konvensi di bagian 3 PRD dan `docs/conventions.md`. Jika konvensi belum mengatur sesuatu, pilih yang paling sederhana, catat di log sebagai keputusan mandiri, dan usulkan agar ditambahkan ke `docs/conventions.md`.
- Hanya sentuh file yang relevan dengan task. Jika perlu membuat file di luar daftar `files`, sebutkan beserta alasannya di log.
- Jangan membuat atau mengubah `.env` dan secret apa pun. Jika dibutuhkan, minta user melakukannya.
- Jangan mengubah keputusan di bagian Assumptions & Decisions PRD atau kriteria *done when* tanpa persetujuan user. Jika ada kendala, jelaskan dan tawarkan pilihan beserta konsekuensinya.
- Bahan rujukan di `docs/reference/` (prompt, validator, dan output nyata dari uji sebelumnya) adalah titik awal untuk tahap 2 sampai 7. Turunkan dari sana, jangan menulis ulang dari nol, dan catat setiap perbedaan beserta alasannya di log.

## Claude Code sebagai dependency

- Test otomatis TIDAK PERNAH memanggil `claude` sungguhan; selalu pakai runner palsu dengan fixture.
- Pemanggilan sungguhan hanya untuk kriteria **(manual)**, dijalankan oleh user. Sebutkan perkiraan durasi dan pemakaian token sebelumnya, karena memakai kuota langganan user.
- Mengubah prompt di `prompts/` wajib menaikkan `version` di front matter-nya dan memperbarui fixture serta test yang terdampak.

## Verifikasi

- Centang task di `docs/TASKS.md` hanya setelah SEMUA kriteria *done when* terbukti. Jalankan ulang seluruh kriteria dari awal sebelum mencentang, bukan hanya bagian yang terakhir diperbaiki.
- Setelah `pnpm check` tersedia (T-001), perintah itu harus hijau sebelum task apa pun dicentang.
- Untuk kriteria bertanda **(manual)**, tuliskan langkah verifikasi yang lengkap dan bisa diikuti sendiri: persiapan (`.env`, `TEMPLATE_DIR`, server yang harus berjalan), perintah persisnya, dan hasil yang harus terlihat. Lalu tunggu konfirmasi user.
- Jika ada kriteria yang tidak bisa dipenuhi, jangan mencentang. Laporkan penyebabnya dengan jujur.
- Saat menguji bahwa sebuah test gagal untuk kode yang salah (mutation check), commit dulu atau ubah satu baris lalu kembalikan secara manual; jangan memakai `git checkout` pada file yang belum di-commit.

## Log per task

Setelah menyelesaikan atau menghentikan task, tulis `docs/logs/T-xxx.md` dan commit bersama task-nya, dengan bagian:

- **Status** dan nama branch.
- **Ringkasan** pekerjaan.
- **Verifikasi:** tabel perintah dan hasilnya, dipetakan ke setiap kriteria *done when*.
- **File yang diubah.**
- **Keputusan yang diambil sendiri**, beserta alasannya.
- **Hasil spike** (khusus task spike): berhasil atau tidak, dan rekomendasi untuk keputusan terkait di PRD.
- **Kendala.**
- **Task berikutnya.**

## Lingkungan

- Mesin pengembang memakai Windows. Semua script otomatisasi ditulis dalam Node (`.mjs`), bukan shell. Hindari heredoc untuk menulis banyak file; tulis file satu per satu.
- Server pengembangan hanya mendengarkan `127.0.0.1`.
