import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, guard, parseBody } from '@/lib/server/api';
import { peekItem } from '@/lib/server/catalog/archive';
import { saveProgress } from '@/lib/server/library/progress';
import { findLibraryFile, itemForFile, titleFromFileName } from '@/lib/server/library/scan';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  file: z.string().min(1).max(1000),
  page: z.number().int().min(1).max(1_000_000),
  total: z.number().int().min(1).max(1_000_000),
});

/** Saves where the reader is. Only files the Library scan knows can be recorded. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const body = await parseBody(req, bodySchema);
  if ('error' in body) return body.error;
  const root = getSettings().downloadRoot;
  const file = await findLibraryFile(root, body.data.file);
  if (!file) return apiError(404, 'NOT_FOUND', 'That file isn’t in your download folder.');
  const item = await itemForFile(root, file.relative);
  const title = (item && peekItem(item.identifier)?.title) ?? titleFromFileName(file.name);
  saveProgress({ file: file.relative, identifier: item?.identifier ?? null, title, page: body.data.page, total: body.data.total });
  return NextResponse.json({ data: { ok: true } });
}
