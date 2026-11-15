import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { apiError, guard } from '@/lib/server/api';
import { backupFileName, createBackup, restoreBackup } from '@/lib/server/backup';

export const dynamic = 'force-dynamic';

/** Downloads a backup of everything you made in Stacks, as one JSON file. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return new NextResponse(JSON.stringify(createBackup(), null, 1), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${backupFileName()}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Restores (merges) a backup file's contents. Body: the backup JSON. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return apiError(400, 'INVALID_JSON', 'That file isn’t a Stacks backup (not JSON).');
  }
  try {
    return NextResponse.json({ data: restoreBackup(raw) });
  } catch (error) {
    if (error instanceof ZodError) return apiError(400, 'NOT_A_BACKUP', 'That file isn’t a Stacks backup, or it’s from a newer version of Stacks.');
    throw error;
  }
}
