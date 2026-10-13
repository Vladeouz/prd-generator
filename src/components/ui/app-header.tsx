import Link from 'next/link';
import { MobileMenu } from './mobile-menu.tsx';
import { ThemeToggle } from './theme-toggle.tsx';

export type TemplateStatus = { valid: boolean; commit: string | null };

type Props = {
  /** Breadcrumb proyek yang sedang dibuka. */
  project?: string;
  /** Total token proyek, sudah diformat. */
  tokens?: string;
  template?: TemplateStatus;
};

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="5" y="3" width="15" height="20" rx="3" className="stroke-accent" strokeWidth="2" />
      <path d="M9 9h7M9 13h5" className="stroke-ink" strokeWidth="2" strokeLinecap="round" />
      <circle cx="20.5" cy="20.5" r="5" className="fill-canvas stroke-accent" strokeWidth="2" />
      <path
        d="M18.4 20.6l1.4 1.4 2.6-2.8"
        className="stroke-accent"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV_LINK = 'rounded-[10px] px-3.5 py-2.5 font-semibold text-ink-muted hover:text-ink';

function TemplatePill({ template }: { template: TemplateStatus }) {
  return (
    <Link
      href="/settings"
      className="inline-flex items-center gap-2 self-start rounded-full border border-line px-3 py-2 font-mono text-xs text-ink-muted hover:border-accent-line"
    >
      <span
        className={`size-2 rounded-full ${template.valid ? 'bg-success' : 'bg-high'}`}
        aria-hidden="true"
      />
      {template.valid && template.commit
        ? `template ${template.commit.slice(0, 7)}`
        : 'template bermasalah'}
    </Link>
  );
}

/**
 * Header aplikasi. Mulai lebar `md`: navigasi, token, dan status template di header. Di layar
 * sempit semua itu pindah ke `MobileMenu`; header hanya berisi logo, tombol tema, dan tombol menu.
 */
export function AppHeader({ project, tokens, template }: Props) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line-subtle px-5 py-3.5 sm:px-8">
      <div className="flex min-w-0 items-center gap-3.5">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 text-[17px] font-extrabold"
          aria-label={project ? 'PRD Generator, kembali ke beranda' : undefined}
        >
          <Logo />
          <span className={project ? 'hidden sm:inline' : ''}>PRD Generator</span>
        </Link>
        {project && (
          <>
            <span className="hidden text-ink-faint sm:inline" aria-hidden="true">
              /
            </span>
            <span className="min-w-0 truncate font-semibold" data-testid="breadcrumb-project">
              {project}
            </span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <nav aria-label="Navigasi utama" className="hidden items-center gap-2 md:flex">
          {tokens && (
            <span className="px-2 font-mono text-[13px] text-ink-muted" data-testid="header-tokens">
              {tokens}
            </span>
          )}
          <Link href="/" className={NAV_LINK}>
            Proyek
          </Link>
          <Link href="/settings" className={NAV_LINK}>
            Pengaturan
          </Link>
          {template && (
            <span data-testid="template-status">
              <TemplatePill template={template} />
            </span>
          )}
        </nav>
        <ThemeToggle />
        <MobileMenu>
          <nav aria-label="Navigasi utama" className="flex flex-col gap-1">
            <Link href="/" className={NAV_LINK}>
              Proyek
            </Link>
            <Link href="/settings" className={NAV_LINK}>
              Pengaturan
            </Link>
          </nav>
          {(tokens || template) && (
            <div className="mt-3 flex flex-col gap-3 border-t border-line-subtle pt-4">
              {tokens && (
                <span className="px-3.5 font-mono text-[13px] text-ink-muted">{tokens}</span>
              )}
              {template && <TemplatePill template={template} />}
            </div>
          )}
        </MobileMenu>
      </div>
    </header>
  );
}
