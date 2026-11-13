import type { Metadata } from 'next';
import { SettingsForm } from '@/components/SettingsForm';
import { PageHeading } from '@/components/States';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <>
      <PageHeading title="Settings" />
      <SettingsForm initial={getSettings()} />
    </>
  );
}
