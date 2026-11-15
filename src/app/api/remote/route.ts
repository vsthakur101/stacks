import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { clearPassword, MIN_PASSWORD, setPassword } from '@/lib/server/remote/auth';
import { remoteStatus, setRemoteEnabled, syncRemoteAccess } from '@/lib/server/remote/proxy';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return NextResponse.json({ data: remoteStatus() });
}

const schema = z.object({ enabled: z.boolean().optional(), password: z.string().min(MIN_PASSWORD).max(200).optional(), clearPassword: z.boolean().optional() });

/** Turns phone access on or off and sets its password. Only from the Mac itself. */
export async function PUT(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  if (req.headers.get('x-stacks-remote')) return apiError(403, 'MAC_ONLY', 'Phone access can only be changed on the Mac.');
  const body = await parseBody(req, schema);
  if ('error' in body) return body.error;
  if (body.data.clearPassword) {
    clearPassword();
    setRemoteEnabled(false);
  }
  if (body.data.password) setPassword(body.data.password);
  if (body.data.enabled !== undefined) setRemoteEnabled(body.data.enabled);
  syncRemoteAccess();
  return NextResponse.json({ data: remoteStatus() });
}
