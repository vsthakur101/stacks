import { NextResponse } from 'next/server';
import { guard } from '@/lib/server/api';
import { downloadedFiles } from '@/lib/server/downloads/library';

export const dynamic = 'force-dynamic';

/** Identifiers whose downloaded files are still on disk; drives the tick on covers. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return NextResponse.json({ data: { identifiers: [...downloadedFiles().keys()] } });
}
