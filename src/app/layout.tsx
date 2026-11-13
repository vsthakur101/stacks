import type { Metadata } from 'next';
import { Anek_Devanagari, Noto_Sans_Devanagari } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { CallSlip } from '@/components/CallSlip';
import { SectionTone } from '@/components/SectionTone';
import { SiteHeader } from '@/components/SiteHeader';
import { sectionForPath } from '@/lib/shared/sectionTone';
import { parseTheme, THEME_COOKIE } from '@/lib/shared/themes';
import './globals.css';

/** Ek Type's variable face (width 75–125, weight 100–800), Latin and Devanagari: Catalogue and Poster. */
const anek = Anek_Devanagari({
  subsets: ['devanagari', 'latin', 'latin-ext'],
  variable: '--font-anek',
  display: 'swap',
  axes: ['wdth'],
});
/** Google's Noto Sans Devanagari, Latin and Devanagari: the Reading theme. Loaded only when used. */
const noto = Noto_Sans_Devanagari({
  subsets: ['devanagari', 'latin', 'latin-ext'],
  variable: '--font-noto',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  title: { default: 'Stacks', template: '%s | Stacks' },
  description: 'A quiet reading room for books, newspapers, magazines and manuscripts from the Internet Archive.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const section = sectionForPath((await headers()).get('x-stacks-path') ?? '/');
  return (
    <html lang="en" data-theme={theme} data-section={section} className={`${anek.variable} ${noto.variable}`}>
      <body className="min-h-dvh">
        <SectionTone />
        <SiteHeader />
        <main className="mx-auto max-w-[1440px] px-4 pt-10 pb-32 sm:px-8 sm:pt-14 lg:px-12">{children}</main>
        <footer className="mx-auto max-w-[1440px] border-t border-rule px-4 py-8 pb-24 text-sm text-ink-faint sm:px-8 lg:px-12">
          Content from the Internet Archive and Open Library. Stacks is a personal reading tool and isn’t affiliated with
          either.
        </footer>
        <CallSlip />
      </body>
    </html>
  );
}
