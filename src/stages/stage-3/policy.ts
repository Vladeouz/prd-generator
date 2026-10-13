// Tabel kebijakan default tahap 3 (FR-04): satu sumber kebenaran untuk prompt dan validator.
// Diturunkan dari `DEFAULT_POLICY` di docs/reference/validate-claude-p-stage3-v2.mjs dan
// docs/reference/e2e-gym.mjs, dengan perbaikan FR-04:
// - setiap aturan punya kunci `<topik>.<nama>`; output wajib menyebut kunci default-nya
//   (`default_policy_key`), dan aplikasi menyimpan kunci itu bila user memakai default;
// - `mobile_masa_depan` kondisional: bila SEO inti produk, default "cukup website";
// - default yang mengikuti jawaban atau asumsi produk memakai kunci `<topik>.ikut_jawaban_produk`.

export const TECH_TOPICS = [
  'platform',
  'mobile_masa_depan',
  'seo',
  'notifikasi',
  'peran_akses',
  'tenancy',
  'integrasi',
  'pembayaran',
  'data_sensitif',
  'offline',
  'realtime',
] as const;

export type TechTopic = (typeof TECH_TOPICS)[number];

export type PolicyRule = {
  /** `<topik>.<nama>`, disimpan di `answers.policy_key`. */
  key: string;
  rule: string;
  /** Pola (huruf kecil, per kata) yang tidak boleh muncul di teks default dengan kunci ini. */
  forbidden?: readonly string[];
  /** Default dengan kunci ini wajib disertai ketegangannya di `detected_risks`. */
  needsRisk?: boolean;
};

const THIRD_PARTY_NOTIFICATIONS = ['email', 'whatsapp', 'sms', 'telegram'];

/** Default mengikuti jawaban produk yang bertentangan dengan kebijakan lain di topik itu. */
const followsProduct = (topic: TechTopic): PolicyRule => ({
  key: `${topic}.ikut_jawaban_produk`,
  rule: 'Hanya bila jawaban atau asumsi produk bertentangan dengan kebijakan di atas: ikuti jawaban produk, dan tulis ketegangannya di "detected_risks".',
  needsRisk: true,
});

export const DEFAULT_POLICY: Record<TechTopic, readonly PolicyRule[]> = {
  platform: [
    {
      key: 'platform.hp_dan_web',
      rule: 'Ide tidak menyebut platform: HP (Android dan iOS) dan web.',
    },
    followsProduct('platform'),
  ],
  mobile_masa_depan: [
    {
      key: 'mobile_masa_depan.mungkin_butuh',
      rule: 'SEO bukan inti produk: mungkin butuh aplikasi HP, belum pasti.',
    },
    {
      key: 'mobile_masa_depan.cukup_website',
      rule: 'SEO adalah inti produk (ide menyebut Google, pencarian, atau pengunjung publik): cukup website.',
    },
    followsProduct('mobile_masa_depan'),
  ],
  seo: [
    {
      key: 'seo.penting',
      rule: 'Ide menyebut Google, pencarian, atau pengunjung publik: SEO penting.',
    },
    {
      key: 'seo.tidak_penting',
      rule: 'Selain itu: SEO tidak penting karena konten ada di balik login.',
    },
    followsProduct('seo'),
  ],
  notifikasi: [
    {
      key: 'notifikasi.dalam_aplikasi_dan_push',
      rule: 'Notifikasi di dalam aplikasi ditambah push notification. Email, WhatsApp, SMS, atau Telegram TIDAK PERNAH menjadi default karena butuh penyedia pihak ketiga.',
      forbidden: THIRD_PARTY_NOTIFICATIONS,
    },
    followsProduct('notifikasi'),
  ],
  peran_akses: [
    {
      key: 'peran_akses.dua_peran',
      rule: 'Dua peran paling sederhana yang sesuai jawaban dan asumsi produk (misalnya pemilik atau admin, dan anggota atau pengguna).',
    },
    {
      key: 'peran_akses.ikut_jawaban_produk',
      rule: 'Jawaban atau asumsi produk sudah menyebut peran, atau menyebut satu pembuat atau pengelola: ikuti itu, dan hanya peran itu yang boleh membuat atau mengelola.',
    },
  ],
  tenancy: [
    {
      key: 'tenancy.satu_organisasi',
      rule: 'Satu organisasi, tim, atau tempat saja; BUKAN marketplace, direktori publik, atau layanan terbuka untuk banyak organisasi. Isolasi data per organisasi dicatat sebagai asumsi arsitektur, bukan sebagai default.',
      forbidden: ['marketplace', 'banyak organisasi', 'banyak tim', 'saas'],
    },
    followsProduct('tenancy'),
  ],
  integrasi: [
    {
      key: 'integrasi.tanpa_integrasi',
      rule: 'Tidak ada integrasi pihak ketiga; input manual atau tautan biasa.',
      forbidden: ['api', 'sinkron', 'impor otomatis'],
    },
    followsProduct('integrasi'),
  ],
  pembayaran: [
    {
      key: 'pembayaran.di_luar_aplikasi',
      rule: 'Pembayaran di luar aplikasi; aplikasi hanya mencatat status pembayaran.',
      forbidden: ['gateway', 'qris', 'bayar online', 'e-wallet'],
    },
    followsProduct('pembayaran'),
  ],
  data_sensitif: [
    {
      key: 'data_sensitif.standar',
      rule: 'Tidak menyimpan data pribadi selain akun: login dan HTTPS dengan otorisasi per akun.',
    },
    {
      key: 'data_sensitif.standar_ekspor_hapus',
      rule: 'Menyimpan data pribadi: login dan HTTPS dengan otorisasi per akun, ditambah ekspor dan hapus data akun.',
    },
    followsProduct('data_sensitif'),
  ],
  offline: [
    { key: 'offline.tidak_perlu', rule: 'Tidak perlu offline; aplikasi selalu online.' },
    followsProduct('offline'),
  ],
  realtime: [
    {
      key: 'realtime.tidak_perlu',
      rule: 'Tidak perlu realtime; data diperbarui saat dibuka atau di-refresh, validasi penting tetap di server.',
    },
    followsProduct('realtime'),
  ],
};

const RULES_BY_KEY = new Map(
  Object.values(DEFAULT_POLICY)
    .flat()
    .map((rule) => [rule.key, rule]),
);

export const policyRule = (key: string): PolicyRule | undefined => RULES_BY_KEY.get(key);

/** Kunci yang diizinkan untuk satu topik; kosong bila topik tidak dikenal. */
export const policyKeysFor = (topic: string): string[] =>
  (DEFAULT_POLICY[topic as TechTopic] ?? []).map((rule) => rule.key);

/** Tabel kebijakan untuk prompt tahap 3: satu baris per kunci, dikelompokkan per topik. */
export function formatPolicy(): string {
  return TECH_TOPICS.map((topic) =>
    [`- ${topic}:`, ...DEFAULT_POLICY[topic].map((rule) => `  - ${rule.key}: ${rule.rule}`)].join(
      '\n',
    ),
  ).join('\n');
}

/** Pola terlarang dari kunci ini yang muncul di teks default (per kata, tanpa beda huruf besar). */
export function forbiddenHits(key: string, text: string): string[] {
  const lower = text.toLowerCase();
  return (policyRule(key)?.forbidden ?? []).filter((pattern) =>
    new RegExp(`(^|[^a-z0-9])${pattern.replaceAll('-', '\\-')}($|[^a-z0-9])`).test(lower),
  );
}
