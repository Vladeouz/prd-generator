# Aturan kerja untuk Claude Code

## Di awal setiap sesi

- Baca `docs/PRD.md`, `docs/conventions.md` (jika sudah ada), dan log task terakhir di `docs/logs/`.
- Pastikan berada di `master`, working tree bersih (`git status`), dan `master` sama dengan remote (`git pull --ff-only`). Jika ada perubahan yang belum di-commit, laporkan ke user; jangan meng-commit-nya sendiri.
- Ambil task berikutnya dari `docs/TASKS.md`: task pertama yang belum dicentang dan semua `depends_on`-nya sudah dicentang.
- Sebelum mulai, periksa apakah sudah ada branch untuk task itu (`git branch -a --list "*t-xxx*"`). Jika ada, jangan mengerjakan ulang; laporkan ke user.

## Mengerjakan task

- Secara bawaan, kerjakan SATU task per sesi, lalu berhenti dan lapor.
- **Mode fase:** jika user meminta menyelesaikan satu fase (misalnya "Kerjakan semua task Fase 1"), setelah satu task selesai dan berhasil di-merge serta di-push, lanjutkan ke task berikutnya di fase yang sama. Sebelum setiap task berikutnya, baca ulang bagian PRD yang dirujuk task itu dan log task sebelumnya. Berhenti dan lapor bila:
  - task punya kriteria **(manual)**: tuliskan langkahnya, tunggu konfirmasi user, lalu lanjutkan setelah dikonfirmasi;
  - task adalah spike: hasilnya memengaruhi keputusan di PRD dan perlu ditinjau user;
  - ada kriteria yang tidak bisa dipenuhi, atau `pnpm check` tidak bisa dibuat hijau;
  - dibutuhkan keputusan user (mengubah keputusan PRD atau kriteria, kredensial atau secret, konflik merge, push ditolak);
  - semua task di fase itu selesai. Jangan memulai fase berikutnya tanpa perintah user.
- Ikuti konvensi di bagian 3 PRD dan `docs/conventions.md`. Jika konvensi belum mengatur sesuatu, pilih yang paling sederhana, catat di log sebagai keputusan mandiri, dan usulkan agar ditambahkan ke `docs/conventions.md`.
- Hanya sentuh file yang relevan dengan task. Jika perlu membuat file di luar daftar `files`, sebutkan beserta alasannya di log.
- Boleh membuat `.env` dari `.env.example` dan menambah atau mengubah variabel konfigurasi di dalamnya (misalnya `TEMPLATE_DIR`). Batasannya:
  - jangan pernah menulis kredensial, token, atau API key yang tidak diberikan user secara eksplisit;
  - pastikan `.env` tetap di-ignore Git (`git check-ignore .env`) dan tidak pernah di-commit;
  - di log, sebut nama variabel yang diubah, bukan nilainya;
  - setiap variabel baru juga ditambahkan ke `.env.example` dengan nilai contoh yang aman.
- Jangan mengubah keputusan di bagian Assumptions & Decisions PRD atau kriteria *done when* tanpa persetujuan user. Jika ada kendala, jelaskan dan tawarkan pilihan beserta konsekuensinya.
- Bahan rujukan di `docs/reference/` (prompt, validator, dan output nyata dari uji sebelumnya) adalah titik awal untuk tahap 2 sampai 7. Turunkan dari sana, jangan menulis ulang dari nol, dan catat setiap perbedaan beserta alasannya di log.

## Git

- Kerjakan setiap task di branch baru dari `master` bernama `<type>/t-xxx-<ringkas>` (type: feat, fix, chore, docs, test). Pesan commit: `<type>: <ringkasan> (T-xxx)`.
- **Task selesai** (semua *done when* terbukti, `pnpm check` hijau, log ditulis, task dicentang): commit, lalu `git checkout master`, `git merge --no-ff <branch>`, dan `git push`. Tulis hash commit merge di laporan.
- **Task terhenti atau belum selesai:** commit di branch-nya dan push branch itu saja (`git push -u origin <branch>`); jangan di-merge ke `master`.
- Jangan pernah `push --force`, rebase `master`, atau mengubah riwayat yang sudah di-push. Jika merge konflik atau push ditolak, berhenti dan lapor ke user.
- Remote `origin` disiapkan user. Jika belum ada, laporkan; jangan membuat repo remote sendiri.

## Claude Code sebagai dependency

- Test otomatis TIDAK PERNAH memanggil `claude` sungguhan; selalu pakai runner palsu dengan fixture.
- Pemanggilan sungguhan hanya untuk kriteria **(manual)**, dijalankan oleh user. Sebutkan perkiraan durasi dan pemakaian token sebelumnya, karena memakai kuota langganan user.
- Mengubah prompt di `prompts/` wajib menaikkan `version` di front matter-nya dan memperbarui fixture serta test yang terdampak.

## Verifikasi

- Centang task di `docs/TASKS.md` hanya setelah SEMUA kriteria *done when* terbukti. Jalankan ulang seluruh kriteria dari awal sebelum mencentang, bukan hanya bagian yang terakhir diperbaiki.
- Setelah `pnpm check` tersedia (T-001), perintah itu harus hijau sebelum task apa pun dicentang.
- Jalankan `pnpm check` tanpa pipe ke `tail`, `head`, atau `grep`, dan periksa exit code-nya langsung sebelum commit, merge, atau push.
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
