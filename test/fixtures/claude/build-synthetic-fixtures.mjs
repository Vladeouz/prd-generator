// Membangun fixture SINTETIS di test/fixtures/claude/synthetic/ (keputusan T-013).
//
//   node test/fixtures/claude/build-synthetic-fixtures.mjs
//
// Belum ada output nyata review kedua. Kasus uji agent `daftar-belanja` (form edit item tanpa
// `GET` per item) ditulis tangan di sini sebagai envelope `claude -p` yang lengkap:
// - `prd-daftar-belanja.json`: PRD bagian 1–7 dengan rute UI `/items/{id}/edit`, tanpa
//   `GET /items/{id}`;
// - `review2-daftar-belanja.json`: output review kedua yang menemukan celah itu (RV2-01);
// - `prd-daftar-belanja-fixed.json`: PRD yang sama dengan `GET /items/{id}` ditambahkan.
// `usage` dan `duration_ms` adalah angka contoh, bukan hasil pemanggilan nyata; setiap envelope
// punya field `fixture_synthetic`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./synthetic', import.meta.url));

const prd = (withItemGet) => `# Daftar Belanja

## 1. Context & Goal

Satu keluarga mencatat barang yang perlu dibeli, lalu mencentangnya saat belanja.

## 2. Scope

### In scope

- Tambah, ubah, hapus, dan centang item belanja (F-01, F-02).

### Non-goals

- Berbagi daftar dengan keluarga lain.

## 3. Tech Constraints

- Flutter untuk web dan HP, API Hono + TypeScript, PostgreSQL + Drizzle.

## 4. Data Model

\`\`\`mermaid
erDiagram
    users ||--o{ items : owns
    users {
        uuid id PK
        text firebase_uid
    }
    items {
        uuid id PK
        uuid user_id FK
        text name
        integer quantity
        boolean done
    }
\`\`\`

- \`items.quantity\` minimal 1 (CHECK).

## 5. API Contract

- GET /items — daftar item milik user.
- POST /items — tambah item.${withItemGet ? '\n- GET /items/{id} — satu item milik user, untuk form edit.' : ''}
- PUT /items/{id} — ubah nama dan jumlah item.
- DELETE /items/{id} — hapus item.

## 6. Functional Requirements

### FR-01: Tambah item

Fitur: F-01

Acceptance criteria:
- [ ] Given user login, When menambah item "Susu" jumlah 2, Then item tampil di daftar.

### FR-02: Ubah item

Fitur: F-01. Layar edit ada di rute \`/items/{id}/edit\`, berisi form nama dan jumlah yang terisi data lama.

Acceptance criteria:
- [ ] Given item "Susu", When membuka /items/{id}/edit dan mengubah jumlah ke 3, Then daftar menampilkan jumlah 3.

### FR-03: Centang item

Fitur: F-02

Acceptance criteria:
- [ ] Given item belum dicentang, When dicentang, Then item tampil sebagai selesai.

## 7. Non-Functional Requirements

- **NFR-01:** daftar 200 item tampil dalam 1 detik.
`;

const review = {
  findings: [
    {
      id: 'RV2-01',
      category: 'ui_endpoint',
      severity: 'high',
      finding:
        'Form edit di /items/{id}/edit harus terisi data lama, tetapi API Contract tidak punya GET /items/{id}. Layar edit hanya bisa mengambil seluruh daftar lalu mencari itemnya sendiri.',
      evidence:
        'FR-02: "Layar edit ada di rute /items/{id}/edit, berisi form nama dan jumlah yang terisi data lama". API Contract hanya punya GET /items, POST /items, PUT /items/{id}, DELETE /items/{id}.',
      options: [
        {
          label: 'Tambahkan GET /items/{id}',
          consequence:
            'Form edit mengambil satu item, termasuk saat dibuka langsung dari tautan. PRD ditulis ulang dengan endpoint ini.',
          changes_prd: true,
        },
        {
          label: 'Biarkan, form edit memakai data dari daftar',
          consequence:
            'Tidak ada endpoint baru, tetapi membuka /items/{id}/edit langsung (tanpa lewat daftar) harus memuat seluruh daftar dulu.',
          changes_prd: false,
        },
      ],
      recommended_option: 'Tambahkan GET /items/{id}',
    },
    {
      id: 'RV2-02',
      category: 'business_rule',
      severity: 'low',
      finding:
        'Item hanya boleh diubah pemiliknya, tetapi aturan kepemilikan tidak disebut di PUT /items/{id}.',
      evidence: 'PUT /items/{id} — "ubah nama dan jumlah item", tanpa menyebut user_id.',
      options: [
        {
          label: 'Tegaskan pemeriksaan pemilik di setiap endpoint item',
          consequence: 'Setiap endpoint item mengembalikan 404 untuk item milik user lain.',
          changes_prd: true,
        },
        {
          label: 'Biarkan, cukup dijelaskan di task',
          consequence: 'PRD tidak berubah; agent harus menyimpulkan aturan ini sendiri.',
          changes_prd: false,
        },
      ],
      recommended_option: 'Biarkan, cukup dijelaskan di task',
    },
  ],
  passed_checks: ['data_model'],
  ready: false,
};

const envelope = (name, result) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 30000,
  num_turns: 1,
  result,
  session_id: `fixture-synthetic-${name}`,
  total_cost_usd: 0.1,
  usage: {
    input_tokens: 3,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 20000,
    output_tokens: 2000,
  },
  fixture_synthetic:
    'Ditulis tangan untuk kasus uji agent daftar-belanja (T-013); bukan output nyata.',
});

mkdirSync(target, { recursive: true });
for (const [name, result] of [
  ['prd-daftar-belanja', prd(false)],
  ['review2-daftar-belanja', JSON.stringify(review, null, 2)],
  ['prd-daftar-belanja-fixed', prd(true)],
]) {
  writeFileSync(
    join(target, `${name}.json`),
    `${JSON.stringify(envelope(name, result), null, 2)}\n`,
  );
  console.log(`synthetic/${name}.json`);
}
