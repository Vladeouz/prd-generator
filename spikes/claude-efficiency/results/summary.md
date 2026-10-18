# Hasil spike T-022

- Claude Code: 2.1.302 (Claude Code)
- Proyek: 693d7f8a-6571-43aa-994d-329c4bcad462, commit template 0416d60c04bf650c3d517eb0197adc494ce1a8eb
- conventions: 76495 karakter utuh, 24186 karakter terpilih (D: ## Struktur repo, ## Job (pg-boss), ## Autentikasi, ## Port push dan storage, ## Pagination, ## Database, ## Format error, ## Clean Architecture API)
- Prompt: stage2 2546, stage6 104048, stage6Selected 52108, probe 37 karakter

| Run | Exit | Token input (baru/cache tulis/cache baca) | Token output | Biaya USD | Durasi dtk | Output byte | Karakter/token output | Thinking (blok/karakter) | Teks pertama dtk | Validator | Baris konvensi tersalin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| probe-sonnet | 0 | 25311 (2/8169/17140) | 4 | 0.0344 | 3.4 | 4 | 1.00 | 0/0 | 2.3 | - | - |
| probe-env | 0 | 25311 (2/8169/17140) | 4 | 0.0344 | 3.1 | 4 | 1.00 | 0/0 | 1.9 | - | - |
| probe-settings | 0 | 25311 (2/8169/17140) | 4 | 0.0344 | 3.3 | 4 | 1.00 | 0/0 | 2.1 | - | - |
| probe-C-tanpa-safe-mode | 0 | 808 (2/806/0) | 4 | 0.0033 | 3.0 | 4 | 1.00 | 0/0 | 1.7 | - | - |
| probe-C | 0 | 681 (2/679/0) | 4 | 0.0028 | 3.3 | 4 | 1.00 | 0/0 | 2.0 | - | - |
| s2-A | 0 | 26120 (2/9371/16747) | 1147 | 0.1013 | 13.8 | 2443 | 2.13 | (json) | - | lolos (0 peringatan) | - |
| s2-B | 0 | 26519 (2/9377/17140) | 1238 | 0.0516 | 10.9 | 2782 | 2.25 | (json) | - | lolos (0 peringatan) | - |
| s2-C | 0 | 1889 (2/1887/0) | 1417 | 0.0217 | 11.6 | 3324 | 2.35 | 0/0 | 2.1 | lolos (0 peringatan) | - |
| s6-D | 0 | 24723 (2/24721/0) | 60932 | 0.7082 | 393.2 | 73061 | 1.20 | 1/0 | 195.1 | lolos (4 peringatan) | 0 |
| s6-C | 0 | 49185 (2/49183/0) | 68830 | 0.8850 | 442.5 | 82132 | 1.19 | 1/0 | 217.0 | lolos (0 peringatan) | 0 |
| s6-B | 0 | 73815 (2/56673/17140) | 52693 | 0.7553 | 337.5 | 71069 | 1.35 | (json) | - | lolos (3 peringatan) | 0 |
| s6-A | 0 | 73416 (2/56667/16747) | 80587 | 2.0684 | 703.2 | 94790 | 1.18 | (json) | - | lolos (0 peringatan) | 0 |

## Init stream dan error

- **probe-sonnet**: model claude-sonnet-5-5, tools ["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Glob","Grep","ListAgents","Monitor","NotebookEdit","PowerShell","PublishPlugin","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","ShareOnboardingGuide","Skill","TaskStop","ToolSearch","WebFetch","WebSearch","Workflow","Write"], mcp [{"name":"claude.ai Claude Docs","status":"pending","source":"claudeai"},{"name":"claude.ai Zoom for Claude","status":"needs-auth","source":"claudeai"},{"name":"claude.ai Google Drive","status":"pending","source":"claudeai"},{"name":"claude.ai Atlassian Rovo","status":"needs-auth","source":"claudeai"}], slash 65, skills 30, plugins 5; modelUsage claude-sonnet-5-5; stream 11 baris, 1 text_delta, event result di 2.3 dtk, usage true, total_cost_usd true
- **probe-env**: model claude-sonnet-5-5, tools ["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Glob","Grep","ListAgents","Monitor","NotebookEdit","PowerShell","PublishPlugin","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","ShareOnboardingGuide","Skill","TaskStop","ToolSearch","WebFetch","WebSearch","Workflow","Write"], mcp [], slash 65, skills 30, plugins 5; modelUsage claude-sonnet-5-5; stream 11 baris, 1 text_delta, event result di 1.9 dtk, usage true, total_cost_usd true
- **probe-settings**: model claude-sonnet-5-5, tools ["Task","Bash","CronCreate","CronDelete","CronList","DesignSync","Edit","EnterWorktree","ExitWorktree","Glob","Grep","ListAgents","Monitor","NotebookEdit","PowerShell","PublishPlugin","PushNotification","Read","RemoteTrigger","ReportFindings","ScheduleWakeup","SendMessage","ShareOnboardingGuide","Skill","TaskStop","ToolSearch","WebFetch","WebSearch","Workflow","Write"], mcp [], slash 65, skills 30, plugins 5; modelUsage claude-sonnet-5-5; stream 11 baris, 1 text_delta, event result di 2.2 dtk, usage true, total_cost_usd true
- **probe-C-tanpa-safe-mode**: model claude-sonnet-5-5, tools [], mcp [], slash 0, skills 0, plugins 4; modelUsage claude-sonnet-5-5; stream 11 baris, 1 text_delta, event result di 1.8 dtk, usage true, total_cost_usd true
- **probe-C**: model claude-sonnet-5-5, tools [], mcp [], slash 0, skills 0, plugins 4; modelUsage claude-sonnet-5-5; stream 11 baris, 1 text_delta, event result di 2.0 dtk, usage true, total_cost_usd true
- **s2-A**: modelUsage claude-opus-5-5
- **s2-B**: modelUsage claude-sonnet-5-5
- **s2-C**: model claude-sonnet-5-5, tools [], mcp [], slash 0, skills 0, plugins 4; modelUsage claude-sonnet-5-5; stream 267 baris, 257 text_delta, event result di 10.7 dtk, usage true, total_cost_usd true
- **s6-D**: model claude-sonnet-5-5, tools [], mcp [], slash 0, skills 0, plugins 4; modelUsage claude-sonnet-5-5; stream 6256 baris, 5921 text_delta, event result di 392.3 dtk, usage true, total_cost_usd true
- **s6-C**: model claude-sonnet-5-5, tools [], mcp [], slash 0, skills 0, plugins 4; modelUsage claude-sonnet-5-5; stream 7105 baris, 6738 text_delta, event result di 441.7 dtk, usage true, total_cost_usd true
- **s6-B**: modelUsage claude-sonnet-5-5
- **s6-A**: modelUsage claude-opus-5-5
