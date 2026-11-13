import type { Metadata } from 'next';
import { Anek_Devanagari, Tiro_Devanagari_Hindi } from 'next/font/google';
import { CallSlip } from '@/components/CallSlip';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

/** Tiro Typeworks' book face: Latin and Devanagari designed together, with an italic. */
const tiro = Tiro_Devanagari_Hindi({
  subsets: ['devanagari', 'latin', 'latin-ext'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-tiro',
  display: 'swap',
});
/** Ek Type's interface face, variable in weight and width, Latin and Devanagari. */
const anek = Anek_Devanagari({
  subsets: ['devanagari', 'latin', 'latin-ext'],
  variable: '--font-anek',
  display: 'swap',
  axes: ['wdth'],
});

export const metadata: Metadata = {
  title: { default: 'Stacks', template: '%s | Stacks' },
  description: 'A quiet reading room for books, newspapers, magazines and manuscripts from the Internet Archive.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${tiro.variable} ${anek.variable}`}>
      <body className="min-h-dvh">
        <SiteHeader />
        <main className="mx-auto max-w-[1440px] px-4 pt-10 pb-32 sm:px-8 sm:pt-14 lg:px-12">{children}</main>
        <footer className="mx-auto max-w-[1440px] border-t border-rule px-4 py-8 text-sm text-ink-faint sm:px-8 lg:px-12">
          Content from the Internet Archive and Open Library. Stacks is a personal reading tool and isn’t affiliated with
          either.
        </footer>
        <CallSlip />
      </body>
    </html>
  );
}
