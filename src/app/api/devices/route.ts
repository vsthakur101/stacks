import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { bestFileFor, copyToDevice, listDevices } from '@/lib/server/devices';
import { findLibraryFile, scanLibrary } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return NextResponse.json({ data: await listDevices() });
}

const schema = z.object({
  device: z.string().min(1).max(200),
  /** Items (archive identifiers) — the best file for the device is chosen — or exact files. */
  identifiers: z.array(z.string().min(1).max(100)).max(200).optional(),
  files: z.array(z.string().min(1).max(1000)).max(200).optional(),
});

/** Copies books to a plugged-in e-reader. Only from the Mac (it's the Mac's USB port). */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (req.headers.get('x-stacks-remote')) return apiError(403, 'MAC_ONLY', 'Copying to a device only works on the Mac.');
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  const device = (await listDevices()).find((d) => d.name === body.data.device);
  if (!device) return apiError(404, 'NOT_FOUND', `${body.data.device} isn’t connected.`);
  const root = getSettings().downloadRoot;
  const scan = await scanLibrary(root);
  const files = [
    ...(body.data.identifiers ?? []).flatMap((id) => {
      const item = scan.items.find((i) => i.identifier === id);
      const f = item && bestFileFor(item.files, device.kind);
      return f ? [f] : [];
    }),
    ...(await Promise.all((body.data.files ?? []).map((f) => findLibraryFile(root, f)))).flatMap((f) => (f ? [f] : [])),
  ];
  if (!files.length) return apiError(404, 'NOT_FOUND', 'Nothing to send: no file this device can open.');
  const results = [];
  for (const f of files) results.push(await copyToDevice(device, f));
  return NextResponse.json({ data: results });
}
