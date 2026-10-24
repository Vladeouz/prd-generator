# Hasil spike T-034

Petunjuk klaim admin: temuan yang menyebut admin dan verifikasi/klaim (heuristik); penilaian akhir di `docs/logs/T-034.md`. Thinking dari `usage.output_tokens_details.thinking_tokens`, teks = output - thinking. Cache prompt dipakai bersama antar-run (tulis / baca), jadi biaya run kedua per tahap lebih rendah.

| Run | Model (init) | Temuan | Petunjuk klaim admin | Lolos validator | Token input (cache tulis / baca) | Token output (thinking / teks) | Biaya USD | Durasi dtk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stage5-sonnet-low-1 | claude-sonnet-5-5 | 8 | - | ya | 7178 (7176 / 0) | 4027 (0 / 4027) | 0.069 | 27 |
| review2-sonnet-low-1 | claude-sonnet-5-5 | 4 | RV2-01, RV2-03 | ya | 23693 (23691 / 0) | 4136 (1310 / 2826) | 0.136 | 31 |
| stage5-sonnet-medium-1 | claude-sonnet-5-5 | 7 | RV-04 | ya | 7177 (386 / 6789) | 5378 (1557 / 3821) | 0.056 | 38 |
| review2-sonnet-medium-1 | claude-sonnet-5-5 | 2 | RV2-01 | ya | 23694 (388 / 23304) | 3316 (1733 / 1583) | 0.037 | 27 |
| stage5-opus-medium-1 | claude-opus-5-5 | 7 | RV-02, RV-03 | ya | 7175 (7173 / 0) | 5959 (1185 / 4774) | 0.177 | 54 |
| review2-opus-medium-1 | claude-opus-5-5 | 6 | RV2-01 | ya | 23688 (23686 / 0) | 6588 (2756 / 3832) | 0.321 | 63 |
| stage5-sonnet-low-2 | claude-sonnet-5-5 | 8 | RV-03, RV-05 | ya | 7178 (387 / 6789) | 3447 (0 / 3447) | 0.037 | 24 |
| review2-sonnet-low-2 | claude-sonnet-5-5 | 5 | RV2-01 | ya | 23694 (388 / 23304) | 3392 (0 / 3392) | 0.038 | 25 |
| stage5-sonnet-medium-2 | claude-sonnet-5-5 | 8 | RV-04 | ya | 7177 (386 / 6789) | 3647 (0 / 3647) | 0.039 | 25 |
| review2-sonnet-medium-2 | claude-sonnet-5-5 | 4 | RV2-01 | ya | 23694 (388 / 23304) | 4330 (1601 / 2729) | 0.047 | 32 |
| stage5-opus-medium-2 | claude-opus-5-5 | 8 | RV-01, RV-03 | ya | 7174 (383 / 6789) | 7310 (2119 / 5191) | 0.151 | 67 |
| review2-opus-medium-2 | claude-opus-5-5 | 6 | RV2-01 | ya | 23689 (383 / 23304) | 6574 (2700 / 3874) | 0.139 | 69 |
