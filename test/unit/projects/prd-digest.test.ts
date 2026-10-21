import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { formatPrdDigest, prdDigest } from '../../../src/projects/prd-digest.ts';
import { buildFeatureDraft } from '../../../src/stages/stage-4/features.ts';
import type { Stage4Output } from '../../../src/stages/stage-4/validate.ts';

const stage4 = JSON.parse(loadClaudeFixture('stage4').result) as Stage4Output;
/** PRD nyata gym (uji end-to-end, tanpa bagian 8). */
const prd = loadClaudeFixture('derived/stage6-gym').result;
const digest = () => prdDigest(prd, buildFeatureDraft(stage4, ['R-01', 'R-06']));

describe('prdDigest', () => {
  it('kode dan judul setiap FR, kode dan judul singkat setiap NFR', () => {
    const { frs, nfrs } = digest();
    expect(frs).toHaveLength(17);
    expect(frs[0]).toEqual({ id: 'FR-01', title: 'Daftar, login, logout, dan reset password' });
    expect(frs.at(-1)).toEqual({ id: 'FR-17', title: 'Hapus permanen data member' });
    expect(nfrs.map((n) => n.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `NFR-${String(i + 1).padStart(2, '0')}`),
    );
    expect(nfrs[0]?.title).toMatch(/^Keamanan: autentikasi: 100% endpoint/);
    expect(nfrs.every((n) => n.title.length <= 81)).toBe(true);
  });

  it('endpoint unik tanpa penanda tebal dan query string, sesuai urutan API Contract', () => {
    const { endpoints } = digest();
    expect(endpoints[0]).toBe('GET /health');
    expect(endpoints).toContain('GET /packages');
    expect(endpoints).toContain('POST /members/{id}/renewals');
    expect(endpoints.some((e) => /[*?]/.test(e))).toBe(false);
    expect(new Set(endpoints).size).toBe(endpoints.length);
  });

  it('tabel dari erDiagram, fase dengan fiturnya, dan fitur rekomendasi yang diterima', () => {
    const { tables, phases, acceptedRecommendations } = digest();
    expect(tables).toEqual([
      'GYMS',
      'USERS',
      'GYM_MEMBERSHIPS',
      'STAFF_INVITATIONS',
      'PACKAGES',
      'MEMBERS',
      'MEMBERSHIP_PERIODS',
      'NOTIFICATIONS',
      'DEVICE_TOKENS',
    ]);
    expect(phases.map((p) => [p.phase, p.features.map((f) => f.id)])).toEqual([
      [0, ['F-01', 'F-02', 'F-03']],
      [1, ['F-04']],
      [2, ['F-05', 'F-06', 'F-09']],
      [3, ['F-07', 'F-08']],
    ]);
    expect(phases[0]?.features[0]).toEqual({ id: 'F-01', name: 'Akun dan login admin' });
    expect(acceptedRecommendations.map((f) => f.id)).toEqual(['R-01', 'R-06']);
  });

  it('teks ringkasan jauh lebih kecil dari PRD dan memuat semua kode', () => {
    const text = formatPrdDigest(digest());
    expect(text.length).toBeLessThan(prd.length / 4);
    for (let i = 1; i <= 17; i++) expect(text).toContain(`- FR-${String(i).padStart(2, '0')}: `);
    expect(text).toContain('- Fase 2 — Status dan Perpanjangan: ');
    expect(text).toContain('  - F-09: Ekspor dan penghapusan data member');
    expect(text).toContain('- R-06: Pembayaran online di dalam aplikasi');
    expect(text).toContain('Tabel (erDiagram): GYMS, USERS,');
    expect(text).not.toContain('## 4. Data Model');
  });

  it('PRD format ringkas T-025 (tabel API dengan path lengkap) juga terbaca', () => {
    const compact = loadClaudeFixture('verification/t022-stage6-g').result;
    const result = prdDigest(compact, buildFeatureDraft(stage4, []));
    expect(result.frs).toHaveLength(20);
    expect(result.endpoints.length).toBe(46);
    expect(result.endpoints).toContain('GET /v1/gyms/{gymId}/plans');
    expect(result.tables.length).toBeGreaterThan(5);
    expect(formatPrdDigest(result)).toContain('Fitur rekomendasi yang diterima');
  });
});
