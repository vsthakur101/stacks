'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';

interface Status {
  enabled: boolean;
  passwordSet: boolean;
  address: string | null;
  url: string | null;
}

/** Settings → Phone access: Tailscale status, password, on/off, and the addresses to use. */
export function RemoteAccessPanel({ initial }: { initial: Status }) {
  const [status, setStatus] = useState(initial);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function update(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await api<Status>('/api/remote', { method: 'PUT', body }));
      setMessage({ kind: 'ok', text: ok });
      setPassword('');
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Couldn’t change that.' });
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-3 w-full border-b-2 border-ink/60 bg-transparent py-2 text-ink focus:border-accent focus:outline-none';
  return (
    <div className="max-w-xl space-y-8">
      <div>
        <p className="font-title text-xl text-ink">Read on your phone</p>
        <p className="mt-1 text-sm text-ink-soft">
          Stacks can open a second door for your own devices over Tailscale, a private network between them. Nothing is reachable from Wi-Fi or the internet, and every visit needs your Stacks password. Open and Show in Finder stay on the Mac.
        </p>
        <p className="mt-3 text-sm text-ink">
          {status.address ? (
            <>Tailscale is running on this Mac ({status.address}).</>
          ) : (
            <>
              Tailscale isn’t running on this Mac. Install it from{' '}
              <a href="https://tailscale.com/download" target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">
                tailscale.com/download
              </a>{' '}
              on the Mac and your phone, sign in to the same account on both, then come back here.
            </>
          )}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void update({ password }, status.passwordSet ? 'Password changed; other devices need to sign in again.' : 'Password set.');
        }}
      >
        <label htmlFor="remote-password" className="block font-title text-xl text-ink">
          {status.passwordSet ? 'Change the password' : 'Password'}
        </label>
        <p className="mt-1 text-sm text-ink-soft">At least 8 characters. Stored only as a one-way hash; never included in backups.</p>
        <input id="remote-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        <button type="submit" disabled={busy || password.length < 8} className="mt-4 rounded-full border border-rule px-5 py-2 text-sm text-ink hover:bg-raised disabled:opacity-40">
          {status.passwordSet ? 'Change password' : 'Set password'}
        </button>
      </form>

      <div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={status.enabled}
            disabled={busy || !status.passwordSet}
            onChange={(e) => void update({ enabled: e.target.checked }, e.target.checked ? 'Phone access is on.' : 'Phone access is off.')}
            className="size-5 accent-[var(--accent)]"
          />
          <span className="font-title text-xl text-ink">Phone access</span>
        </label>
        {!status.passwordSet ? <p className="mt-1 text-sm text-ink-soft">Set a password first.</p> : null}
        {status.url ? (
          <div className="mt-3 space-y-1 text-sm">
            <p className="text-ink">
              On your phone, open <span className="font-medium tabular-nums">{status.url}</span>
            </p>
            <p className="text-ink-soft">
              Reading apps (KOReader, Moon+ Reader, Readest): add the catalogue <span className="tabular-nums text-ink">{status.url}/opds</span> with any user name and your Stacks password.
            </p>
          </div>
        ) : status.enabled && !status.address ? (
          <p className="mt-2 text-sm text-ink-soft">On, waiting for Tailscale: Stacks checks every minute.</p>
        ) : null}
      </div>

      {message ? (
        <p role="status" className={message.kind === 'error' ? 'text-sm text-danger' : 'text-sm text-ink-soft'}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
