'use client';

import { HardDriveDownload } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/client/api';

export interface DeviceOption {
  name: string;
}

type Result = { status: 'copied' | 'converted' | 'already-there' } | { status: 'unsupported' | 'no-space' | 'failed'; message: string };

/** "Send to Kindle" on a Library tile or file row, while an e-reader is plugged in. */
export function SendToDevice({ devices, target }: { devices: DeviceOption[]; target: { identifier: string } | { file: string } }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!devices.length) return null;

  async function send(device: string) {
    setBusy(device);
    setMessage(null);
    try {
      const body = 'identifier' in target ? { device, identifiers: [target.identifier] } : { device, files: [target.file] };
      const [r] = await api<Result[]>('/api/devices', { body });
      if (!r) throw new Error('Nothing was sent.');
      setMessage(
        r.status === 'copied'
          ? { ok: true, text: `On ${device}` }
          : r.status === 'converted'
            ? { ok: true, text: `Converted and on ${device}` }
            : r.status === 'already-there'
              ? { ok: true, text: `Already on ${device}` }
              : { ok: false, text: 'message' in r ? r.message : 'Couldn’t copy it.' },
      );
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Couldn’t copy it.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-x-3">
      {devices.map((d) => (
        <button key={d.name} type="button" disabled={busy !== null} onClick={() => void send(d.name)} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm text-ink-soft hover:text-ink disabled:opacity-50">
          <HardDriveDownload aria-hidden className="size-3.5" />
          {busy === d.name ? 'Copying…' : `Send to ${d.name}`}
        </button>
      ))}
      {message ? (
        <span role="status" className={message.ok ? 'text-sm text-accent' : 'w-full text-sm text-danger'}>
          {message.text}
        </span>
      ) : null}
    </span>
  );
}
