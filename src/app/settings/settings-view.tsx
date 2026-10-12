import type { Settings } from '../../template/settings.ts';

export function SettingsView({ settings }: { settings: Settings }) {
  const valid = settings.problems.length === 0;
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Pengaturan</h1>

      <section className="mt-8 rounded border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Repo template</h2>
        <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">TEMPLATE_DIR</dt>
          <dd className="font-mono break-all" id="template-dir">
            {settings.templateDir ?? 'belum diisi'}
          </dd>
          <dt className="text-slate-500">Status</dt>
          <dd id="template-status" className={valid ? 'text-green-700' : 'text-red-700'}>
            {valid ? 'Valid' : 'Bermasalah'}
          </dd>
          <dt className="text-slate-500">Commit</dt>
          <dd className="font-mono break-all" id="template-commit">
            {settings.templateCommit ?? '-'}
          </dd>
        </dl>
        {!valid && (
          <div className="mt-4 rounded bg-red-50 p-4 text-sm text-red-800" id="template-problems">
            <ul className="list-disc space-y-1 pl-5">
              {settings.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
            <p className="mt-3">
              Tahap 6 (PRD) dan 7 (TASKS) tidak bisa dijalankan sampai masalah ini diperbaiki. Ubah
              `TEMPLATE_DIR` di `.env`, lalu muat ulang halaman ini.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6 rounded border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Claude Code</h2>
        <p className="mt-4 text-sm" id="claude-status">
          {settings.claudeAvailable
            ? `Tersedia (${settings.claudeVersion})`
            : 'Tidak tersedia: perintah `claude` tidak ditemukan. Pasang Claude Code, lalu login dengan menjalankan `claude`.'}
        </p>
      </section>
    </main>
  );
}
