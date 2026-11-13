import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SettingsForm } from '@/components/SettingsForm';
import { PageHeading } from '@/components/States';
import { ThemePicker } from '@/components/ThemePicker';
import { getSettings } from '@/lib/server/settings';
import { parseTheme, THEME_COOKIE } from '@/lib/shared/themes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <>
      <PageHeading title="Settings" />
      <section className="mb-14">
        <h2 className="font-display text-2xl text-ink">Look</h2>
        <p className="mt-1 mb-5 text-sm text-ink-soft">Changes apply straight away. Light or dark follows your Mac.</p>
        <ThemePicker initial={theme} />
      </section>
      <section>
        <h2 className="font-display mb-5 text-2xl text-ink">Downloads</h2>
        <SettingsForm initial={getSettings()} />
      </section>
    </>
  );
}
