import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FRIENDLY_FORMATS, type FormatsResponse, type FriendlyFormat } from '@/lib/shared/types';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { getItem } from '@/lib/server/catalog/archive';
import { availability } from '@/lib/server/downloads/formats';
import { identifierSchema, MAX_TRAY_ITEMS } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ identifiers: z.array(identifierSchema).min(1).max(MAX_TRAY_ITEMS) });

/** Format availability across the selection. Metadata is cached, and the shared limiter bounds concurrency. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, bodySchema);
  if ('error' in body) return body.error;

  const ids = [...new Set(body.data.identifiers)];
  const counts = new Map<FriendlyFormat, { available: number; bytes: number }>();
  const restricted: string[] = [];
  const unavailable: string[] = [];

  try {
    await Promise.all(
      ids.map(async (id) => {
        try {
          const item = await getItem(id);
          if (item.restricted) {
            restricted.push(id);
            return;
          }
          for (const [format, bytes] of availability(item.files)) {
            const c = counts.get(format) ?? { available: 0, bytes: 0 };
            c.available += 1;
            c.bytes += bytes;
            counts.set(format, c);
          }
        } catch {
          // Not found or upstream down: count it as unchecked; the download job will report the real reason.
          unavailable.push(id);
        }
      }),
    );
  } catch {
    return apiError(502, 'UPSTREAM_ERROR', 'Could not reach archive.org.');
  }

  const response: FormatsResponse = {
    total: ids.length,
    restricted,
    unavailable,
    formats: FRIENDLY_FORMATS.map((format) => ({
      format,
      available: counts.get(format)?.available ?? 0,
      bytes: counts.get(format)?.bytes ?? 0,
    })),
  };
  return NextResponse.json({ data: response });
}
