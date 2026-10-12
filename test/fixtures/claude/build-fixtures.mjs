// Membangun fixture envelope `claude -p --output-format json` dari output nyata uji end-to-end
// (docs/reference/e2e-output/, ide "Aplikasi membership untuk sebuah gym").
//
//   node test/fixtures/claude/build-fixtures.mjs
//
// Hasilnya (`stage2.json` … `stage7.json`) di-commit. `usage`, `total_cost_usd`, dan `duration_ms`
// diambil dari report.json (percobaan pertama tiap tahap, yang lolos validasi). Teks mentah `result`
// tidak disimpan di uji itu: tahap 2–5 ditulis ulang sebagai JSON dari objek hasil parse-nya, tahap
// 6–7 adalah PRD.md dan TASKS.md apa adanya.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const source = join(root, 'docs', 'reference', 'e2e-output');
const target = fileURLToPath(new URL('.', import.meta.url));

const report = JSON.parse(readFileSync(join(source, 'report.json'), 'utf8'));
const results = {
  stage2: JSON.stringify(JSON.parse(readFileSync(join(source, 'stage-2.json'), 'utf8')), null, 2),
  stage3: JSON.stringify(JSON.parse(readFileSync(join(source, 'stage-3.json'), 'utf8')), null, 2),
  stage4: JSON.stringify(JSON.parse(readFileSync(join(source, 'stage-4.json'), 'utf8')), null, 2),
  stage5: JSON.stringify(JSON.parse(readFileSync(join(source, 'stage-5.json'), 'utf8')), null, 2),
  stage6: readFileSync(join(source, 'PRD.md'), 'utf8'),
  stage7: readFileSync(join(source, 'TASKS.md'), 'utf8'),
};

for (const [stage, result] of Object.entries(results)) {
  const stat = report.stats.find((entry) => entry.stage === stage && entry.errors.length === 0);
  if (!stat) throw new Error(`report.json tidak punya percobaan sukses untuk ${stage}`);
  const envelope = {
    type: 'result',
    subtype: 'success',
    is_error: stat.isError,
    duration_ms: stat.ms,
    num_turns: 1,
    result,
    session_id: `fixture-gym-${stage}`,
    total_cost_usd: stat.costEstimateUsd,
    usage: stat.usage,
  };
  writeFileSync(join(target, `${stage}.json`), `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(`${stage}.json`);
}
