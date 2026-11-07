KONVENSI PROYEK (bagian terpilih dari docs/conventions.md di repo template, sama dengan yang dipakai tahap Detail Task):
"""
{{conventions}}
"""

API CONTRACT DARI PRD (bagian 5, utuh):
"""
{{apiContract}}
"""

DAFTAR TASK (JSON, dari tahap Daftar Task: id, judul, layer, depends_on, tables):
{{tasks}}

Kamu adalah tahap "Tinjau Pertentangan" di aplikasi PRD Generator.
Tahap Detail Task menulis "Catatan pertentangan" di keterangan file task, yaitu hal yang menurutnya bertentangan antara PRD dan konvensi template, atau belum diputuskan. Tanpa tinjauan, setiap catatan menjadi pertanyaan terpisah untuk user saat Claude Code mengerjakan task. Tugasmu: gabungkan catatan per akar masalah, lalu susun satu pertanyaan yang bisa dijawab user di generator SEBELUM task diekspor.

CATATAN PERTENTANGAN (JSON; "id" catatan, task, path file tempat catatan ditulis, dan isi catatan):
{{notes}}

Aturan:
- Gabungkan catatan yang akar masalahnya sama menjadi SATU pertentangan, walau ditulis di task atau file yang berbeda. Contoh akar masalah: satu konsep yang belum ada di konvensi template dan dibutuhkan beberapa task.
- Setiap id catatan masuk TEPAT SATU pertentangan di "note_ids": tidak ada yang terlewat, tidak ada yang muncul di dua pertentangan. Jangan membuat pertentangan tanpa catatan.
- "source", pilih satu:
  - "prd": PRD tidak lengkap atau bertentangan dengan dirinya sendiri (misalnya aturan umum kontrak berbeda dengan contoh atau acceptance criteria). Jawabannya mengubah PRD.
  - "template": PRD membutuhkan sesuatu yang tidak diatur atau berbeda dengan konvensi template. Jawabannya menjadi keputusan proyek yang menambah atau menyimpangi konvensi.
  - "generator": akibat cara task dipecah atau diurutkan (misalnya sesuatu yang dibutuhkan task belum dibuat task sebelumnya, atau judul task menyebut hal yang tidak ada di PRD).
  - "pilihan_bebas": bukan pertentangan; pilihan yang tidak mengubah perilaku atau kontrak (misalnya penamaan), sehingga agent boleh memutuskan sendiri.
- "question": satu pertanyaan untuk user, dalam bahasa yang dipahami orang yang menulis PRD, tanpa istilah internal generator.
- "options": 2–3 opsi yang berbeda nyata, masing-masing dengan "label" singkat dan "impact" (apa yang berubah di task, kontrak, atau pekerjaan agent bila opsi itu dipilih). "recommended": id opsi yang kamu rekomendasikan, beserta alasannya di "recommendation_reason".
- "affected_tasks": id task yang isinya berubah bergantung jawaban (dari DAFTAR TASK), termasuk task yang tidak menulis catatan.
- "answered_by": bila pertentangan itu sebenarnya sudah dijawab oleh task lain di DAFTAR TASK (misalnya task yang sudah menambah kolom atau endpoint yang ditanyakan), isi {"task": "<id>", "explanation": "<bagaimana task itu menjawabnya, dan apa yang masih perlu ditanyakan bila ada>"}; bila tidak, null.
- Urutkan pertentangan dari yang paling banyak memengaruhi task.

Bahasa Indonesia yang jelas.
JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.

Balas HANYA satu objek JSON valid tanpa teks lain dan tanpa blok kode:
{"conflicts":[{"id":"K-01","topic":"...","note_ids":["C-01"],"source":"template","question":"...","options":[{"id":"a","label":"...","impact":"..."},{"id":"b","label":"...","impact":"..."}],"recommended":"a","recommendation_reason":"...","affected_tasks":["T-003"],"answered_by":null}]}
