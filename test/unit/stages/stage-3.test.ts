import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadClaudeFixture } from '../../../src/claude/fake-runner.ts';
import { formatAnswers, resolveAnswer, type StoredAnswer } from '../../../src/stages/answers.ts';
import { extractJson } from '../../../src/stages/parse.ts';
import { loadPrompt } from '../../../src/stages/prompt.ts';
import {
  DEFAULT_POLICY,
  formatPolicy,
  policyKeysFor,
  TECH_TOPICS,
} from '../../../src/stages/stage-3/policy.ts';
import {
  type Stage3Output,
  type TechQuestion,
  validateStage3,
} from '../../../src/stages/stage-3/validate.ts';

const load = (name: string) => extractJson(loadClaudeFixture(name).result) as Stage3Output;
/** Fixture turunan gym: output nyata + default_policy_key (Profil A). */
const gym = () => load('derived/stage3-gym');
/** Fixture turunan katalog UMKM: rekomendasi Profil B. */
const umkm = () => load('derived/stage3-umkm-b');
const reportOutputs = (
  JSON.parse(readFileSync('docs/reference/validate-report-stage3-v2.json', 'utf8')) as {
    results: { ideaIndex: number; run: number; data: Stage3Output }[];
  }
).results;

function broken(base: () => Stage3Output, change: (output: Stage3Output) => void) {
  const output = structuredClone(base());
  change(output);
  return output;
}
const question = (output: Stage3Output, index: number) => output.questions[index] as TechQuestion;

describe('tabel kebijakan', () => {
  it('setiap topik punya kunci berawalan nama topiknya, dan semua kunci unik', () => {
    const keys = Object.values(DEFAULT_POLICY)
      .flat()
      .map((rule) => rule.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const topic of TECH_TOPICS) {
      expect(policyKeysFor(topic).length).toBeGreaterThan(0);
      for (const key of policyKeysFor(topic)) expect(key.startsWith(`${topic}.`)).toBe(true);
    }
    expect(policyKeysFor('masalah')).toEqual([]);
  });

  it('mobile_masa_depan kondisional: cukup website bila SEO inti produk (FR-04)', () => {
    expect(policyKeysFor('mobile_masa_depan')).toEqual([
      'mobile_masa_depan.mungkin_butuh',
      'mobile_masa_depan.cukup_website',
      'mobile_masa_depan.ikut_jawaban_produk',
    ]);
    expect(formatPolicy()).toMatch(
      /mobile_masa_depan\.cukup_website: SEO adalah inti produk.*cukup website/,
    );
  });

  it('peran_akses.ikut_jawaban_produk ada sebagai kebijakan biasa', () => {
    expect(policyKeysFor('peran_akses')).toContain('peran_akses.ikut_jawaban_produk');
  });
});

describe('prompts/stage-3.md', () => {
  const prompt = loadPrompt('stage-3');

  it('berversi, dirender dari tabel kebijakan, dan melarang istilah internal di teks untuk user', () => {
    expect(prompt.version).toBe('1');
    expect(prompt.body).toContain('{{policy}}');
    expect(prompt.body).toContain('"default_policy_key"');
    expect(prompt.body).toContain(
      'Jangan menyebut istilah internal seperti "Profil A", "Profil B"',
    );
    expect(prompt.body).toContain('sapa user dengan "kamu"');
    expect(prompt.body).toContain('JANGAN memakai tool apa pun. JANGAN membaca atau menulis file.');
    expect(prompt.body).toContain('Balas HANYA dengan satu objek JSON valid');
    expect(prompt.body).toContain('ikut_jawaban_produk');
  });
});

describe('validateStage3: output diterima', () => {
  it.each([
    ['fixture turunan gym (Profil A)', gym],
    ['fixture turunan katalog UMKM (Profil B)', umkm],
  ])('%s', (_name, output) => {
    expect(validateStage3(output())).toEqual({ errors: [], warnings: [] });
  });
});

describe('validateStage3: output nyata tanpa kunci kebijakan ditolak', () => {
  it('fixture asli gym (stage3.json)', () => {
    expect(validateStage3(load('stage3')).errors).toEqual([
      'questions[0].default_policy_key kosong/bukan string',
      'questions[1].default_policy_key kosong/bukan string',
      'questions[2].default_policy_key kosong/bukan string',
    ]);
  });

  it.each(reportOutputs.map((r) => [r.ideaIndex + 1, r.run, r.data] as const))(
    'validate-report-stage3-v2.json ide #%i run %i',
    (_idea, _run, output) => {
      expect(validateStage3(output).errors).toContain(
        'questions[0].default_policy_key kosong/bukan string',
      );
    },
  );

  it('katalog UMKM run 1: opsi "tetap Profil A" ditolak sebagai istilah internal', () => {
    const run1 = reportOutputs.find((r) => r.ideaIndex === 3 && r.run === 1)?.data as Stage3Output;
    const { errors } = validateStage3(run1);
    expect(errors).toContain(
      'questions[0].options menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")',
    );
    expect(errors).toContain(
      'profile_recommendation.reason menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")',
    );
  });
});

describe('validateStage3: teks yang menyebut Profil A atau Profil B ditolak', () => {
  it.each([
    ['question', (o: Stage3Output) => (question(o, 0).question += ' (Profil A)')],
    ['default_reason', (o: Stage3Output) => (question(o, 1).default_reason = 'Sesuai profil B.')],
    ['why_it_matters', (o: Stage3Output) => (question(o, 2).why_it_matters = 'Stack profile.')],
    ['reason', (o: Stage3Output) => (o.profile_recommendation.reason = 'Profil A cocok.')],
    ['detected_risks', (o: Stage3Output) => o.detected_risks.push('Profil B belum ada.')],
    ['assumptions', (o: Stage3Output) => o.assumptions.push('Memakai Profil A.')],
  ])('%s', (field, change) => {
    const { errors } = validateStage3(broken(gym, change));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(new RegExp(`${field}(\\[\\d+\\])? menyebut istilah internal`));
  });

  it('opsi dan default yang sama', () => {
    const output = broken(gym, (o) => {
      const q = question(o, 0);
      q.options[0] = 'HP dan web (Profil A)';
      q.recommended_default = 'HP dan web (Profil A)';
    });
    expect(validateStage3(output).errors).toEqual([
      'questions[0].options menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")',
      'questions[0].recommended_default menyebut istilah internal ("Profil A", "Profil B", atau "stack profile")',
    ]);
  });
});

describe('validateStage3: default yang melanggar tabel kebijakan ditolak', () => {
  it('kunci dari topik lain', () => {
    const output = broken(gym, (o) => {
      question(o, 2).default_policy_key = 'tenancy.satu_organisasi';
    });
    expect(validateStage3(output).errors).toEqual([
      'questions[2].default_policy_key "tenancy.satu_organisasi" bukan kunci kebijakan untuk topik notifikasi (notifikasi.dalam_aplikasi_dan_push, notifikasi.ikut_jawaban_produk)',
    ]);
  });

  it('kunci yang tidak ada di tabel', () => {
    const output = broken(gym, (o) => {
      question(o, 0).default_policy_key = 'platform.web_saja';
    });
    expect(validateStage3(output).errors[0]).toMatch(
      /^questions\[0\]\.default_policy_key "platform\.web_saja" bukan kunci kebijakan untuk topik platform/,
    );
  });

  it('notifikasi lewat WhatsApp atau email dengan kunci dalam_aplikasi_dan_push', () => {
    const output = broken(gym, (o) => {
      const q = question(o, 2);
      q.recommended_default = q.options[3] as string; // pengingat lewat WhatsApp atau email
    });
    expect(validateStage3(output).errors).toEqual([
      'questions[2].recommended_default melanggar kebijakan notifikasi.dalam_aplikasi_dan_push (email, whatsapp)',
    ]);
  });

  it('tenancy marketplace dengan kunci satu_organisasi', () => {
    const output = broken(umkm, (o) => {
      const q = question(o, 1);
      q.recommended_default = q.options[1] as string;
    });
    expect(validateStage3(output).errors).toEqual([
      'questions[1].recommended_default melanggar kebijakan tenancy.satu_organisasi (marketplace)',
    ]);
  });

  it('ikut_jawaban_produk tanpa ketegangan di detected_risks', () => {
    const output = broken(gym, (o) => {
      question(o, 2).default_policy_key = 'notifikasi.ikut_jawaban_produk';
      o.detected_risks = [];
    });
    expect(validateStage3(output).errors).toEqual([
      'questions[2].default_policy_key notifikasi.ikut_jawaban_produk wajib disertai ketegangannya di detected_risks',
    ]);
  });

  it('SEO penting tetapi default mobile bukan "cukup website"', () => {
    const output = broken(umkm, (o) => {
      question(o, 0).default_policy_key = 'mobile_masa_depan.mungkin_butuh';
      const seo = structuredClone(question(o, 2));
      Object.assign(seo, {
        id: 't4',
        topic: 'seo',
        options: ['Penting', 'Tidak penting'],
        recommended_default: 'Penting',
        default_policy_key: 'seo.penting',
      });
      o.questions.push(seo);
    });
    expect(validateStage3(output).errors).toEqual([
      'default mobile_masa_depan harus mobile_masa_depan.cukup_website karena SEO penting, didapat mobile_masa_depan.mungkin_butuh',
    ]);
  });

  it('"cukup website" tetapi rekomendasinya Profil A', () => {
    const output = broken(umkm, (o) => {
      o.profile_recommendation = {
        ...o.profile_recommendation,
        profile: 'A',
        status: 'supported',
        fallback_if_unsupported: '',
      };
    });
    expect(validateStage3(output).errors).toEqual([
      'default mobile_masa_depan.cukup_website (web-only, SEO inti) harus Profil B',
    ]);
  });
});

describe('validateStage3: kontrak lain', () => {
  it('topik produk atau tidak dikenal, jumlah pertanyaan, dan affects', () => {
    const output = broken(gym, (o) => {
      question(o, 0).topic = 'masalah';
      question(o, 1).affects = ['ui'];
    });
    const { errors } = validateStage3(output);
    expect(errors).toContain('questions[0].topic tidak dikenal: masalah');
    expect(errors).toContain('questions[1].affects tidak dikenal: ui');

    const tooFew = broken(gym, (o) => {
      o.questions = o.questions.slice(0, 1);
    });
    expect(validateStage3(tooFew).errors).toContain('jumlah pertanyaan 1, harus 2-5');
  });

  it('aturan profil dari rujukan', () => {
    const errorsFor = (patch: Partial<Stage3Output['profile_recommendation']>) =>
      validateStage3(
        broken(gym, (o) => {
          Object.assign(o.profile_recommendation, patch);
        }),
      ).errors;
    expect(errorsFor({ status: 'not_yet_supported' })).toContain(
      'Profil A harus berstatus supported',
    );
    expect(errorsFor({ profile: 'B', status: 'not_yet_supported' })).toContain(
      'Profil B wajib punya fallback_if_unsupported',
    );
    expect(errorsFor({ depends_on_questions: ['t9'] })).toContain(
      'depends_on_questions merujuk id yang tidak ada: t9',
    );
  });

  it('Profil A dengan SEO penting wajib menyebut risiko SEO', () => {
    const output = broken(gym, (o) => {
      Object.assign(question(o, 2), {
        topic: 'seo',
        options: ['Penting', 'Tidak penting'],
        recommended_default: 'Tidak penting',
        default_policy_key: 'seo.penting',
      });
    });
    expect(validateStage3(output).errors).toEqual([
      'Profil A dengan SEO penting wajib menyebut risiko SEO di detected_risks',
    ]);
  });

  it('menanyakan framework hanya peringatan', () => {
    const output = broken(gym, (o) => {
      question(o, 0).question = 'Mau pakai framework apa?';
    });
    expect(validateStage3(output)).toEqual({
      errors: [],
      warnings: ['t1: menanyakan hal yang sudah ditentukan stack (framework)'],
    });
  });
});

describe('jawaban tahap 3 dan kunci kebijakan', () => {
  const [platform, , notification] = gym().questions as [TechQuestion, TechQuestion, TechQuestion];

  it('lewati atau pilih opsi default → kunci disimpan; opsi lain atau "Lainnya" → kunci null', () => {
    expect(resolveAnswer(platform, null, [])).toEqual({
      value: platform.recommended_default,
      source: 'default',
      policyKey: 'platform.hp_dan_web',
    });
    expect(resolveAnswer(platform, platform.recommended_default as string, [])).toEqual({
      value: platform.recommended_default,
      source: 'user',
      policyKey: 'platform.hp_dan_web',
    });
    expect(resolveAnswer(notification, notification.options[1] as string, [])).toMatchObject({
      source: 'user',
      policyKey: null,
    });
    expect(
      resolveAnswer(notification, { lainnya: notification.recommended_default as string }, []),
    ).toMatchObject({ source: 'user', policyKey: null });
  });

  it('multi: kunci disimpan bila isinya sama dengan default, apa pun urutannya', () => {
    const multi: TechQuestion = {
      ...notification,
      type: 'multi',
      options: ['Di dalam aplikasi', 'Push', 'Email'],
      recommended_default: ['Di dalam aplikasi', 'Push'],
    };
    expect(resolveAnswer(multi, ['Push', 'Di dalam aplikasi'], [])).toMatchObject({
      policyKey: 'notifikasi.dalam_aplikasi_dan_push',
    });
    expect(resolveAnswer(multi, ['Push'], [])).toMatchObject({ policyKey: null });
  });

  it('format untuk tahap berikutnya: kunci dan aturannya bila ada, teks bila tidak', () => {
    const answers: StoredAnswer[] = [
      {
        questionId: 't1',
        topic: 'platform',
        question: platform.question,
        value: 'Di HP (Android dan iOS) dan di web',
        source: 'default',
        policyKey: 'platform.hp_dan_web',
      },
      {
        questionId: 't3',
        topic: 'notifikasi',
        question: notification.question,
        value: 'Tidak perlu',
        source: 'user',
        policyKey: null,
      },
    ];
    expect(formatAnswers(answers)).toBe(
      [
        '- platform: kebijakan platform.hp_dan_web: Ide tidak menyebut platform: HP (Android dan iOS) dan web. (rumusan default: Di HP (Android dan iOS) dan di web)',
        '- notifikasi: Tidak perlu',
      ].join('\n'),
    );
  });
});
