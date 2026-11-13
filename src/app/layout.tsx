import type { Metadata } from 'next';
import { Public_Sans, Spectral } from 'next/font/google';
import { CallSlip } from '@/components/CallSlip';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

const spectral = Spectral({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-spectral',
  display: 'swap',
});
const publicSans = Public_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-public-sans', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Stacks', template: '%s | Stacks' },
  description: 'A quiet reading room for books, newspapers, magazines and documents from the Internet Archive.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spectral.variable} ${publicSans.variable}`}>
      <body className="min-h-dvh">
        <SiteHeader />
        <main className="mx-auto max-w-[1200px] px-4 pt-10 pb-32 sm:px-8 sm:pt-14">{children}</main>
        <footer className="mx-auto max-w-[1200px] border-t border-rule px-4 py-8 text-sm text-ink-faint sm:px-8">
          Content from the Internet Archive and Open Library. Stacks is a personal reading tool and isn’t affiliated with
          either.
        </footer>
        <CallSlip />
      </body>
    </html>
  );
}
