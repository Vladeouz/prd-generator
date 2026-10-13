import { AppHeader } from '../../components/ui/app-header.tsx';
import { Badge } from '../../components/ui/badge.tsx';
import { Card } from '../../components/ui/card.tsx';
import type { Settings } from '../../template/settings.ts';

export function SettingsView({ settings }: { settings: Settings }) {
  const valid = settings.problems.length === 0;
  return (
    <>
      <AppHeader template={{ valid, commit: settings.templateCommit }} />
      <main className="mx-auto flex max-w-[760px] flex-col gap-5 px-5 pt-12 pb-24 sm:px-8">
        <h1 className="text-[28px] font-extrabold tracking-[-0.02em] sm:text-[34px]">Pengaturan</h1>

        <Card
          as="section"
          size="main"
          aria-labelledby="template-title"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="template-title" className="text-lg font-bold">
              Repo template
            </h2>
            <span id="template-status">
              <Badge tone={valid ? 'success' : 'high'} dot>
                {valid ? 'Valid' : 'Bermasalah'}
              </Badge>
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-muted">TEMPLATE_DIR</dt>
            <dd className="font-mono text-[13px] break-all" id="template-dir">
              {settings.templateDir ?? 'belum diisi'}
            </dd>
            <dt className="text-ink-muted">Commit</dt>
            <dd className="font-mono text-[13px] break-all" id="template-commit">
              {settings.templateCommit ?? '-'}
            </dd>
          </dl>
          {!valid && (
            <div
              className="rounded-control border border-high bg-high-soft p-4 text-sm text-ink"
              id="template-problems"
              role="alert"
            >
              <ul className="list-disc space-y-1 pl-5">
                {settings.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
              <p className="mt-3">
                Tahap 6 (PRD) dan 7 (TASKS) tidak bisa dijalankan sampai masalah ini diperbaiki.
                Ubah `TEMPLATE_DIR` di `.env`, lalu muat ulang halaman ini.
              </p>
            </div>
          )}
        </Card>

        <Card
          as="section"
          size="main"
          aria-labelledby="claude-title"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="claude-title" className="text-lg font-bold">
              Claude Code
            </h2>
            <Badge tone={settings.claudeAvailable ? 'success' : 'high'} dot>
              {settings.claudeAvailable ? 'Terpasang' : 'Tidak ditemukan'}
            </Badge>
          </div>
          <p className="text-sm text-ink-secondary" id="claude-status">
            {settings.claudeAvailable
              ? `Tersedia (${settings.claudeVersion})`
              : 'Tidak tersedia: perintah `claude` tidak ditemukan. Pasang Claude Code, lalu login dengan menjalankan `claude`.'}
          </p>
        </Card>
      </main>
    </>
  );
}
