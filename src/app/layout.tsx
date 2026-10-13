import type { Metadata } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { THEME_INIT_SCRIPT } from '../components/ui/theme.ts';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'PRD Generator',
  description: 'Mengubah ide proyek menjadi PRD dan TASKS yang siap dikerjakan Claude Code.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `data-theme` diganti script tema sebelum render pertama, jadi atributnya boleh berbeda dari
    // HTML server.
    <html
      lang="id"
      data-theme="dark"
      className={`${jakarta.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script tema statis dari kode kita sendiri, bukan input user. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
