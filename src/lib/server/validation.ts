import { z } from 'zod';
import { FRIENDLY_FORMATS, SECTION_IDS } from '@/lib/shared/types';
import { isSafeIdentifier } from './catalog/archive';

export const MAX_TRAY_ITEMS = 500;

export const identifierSchema = z.string().refine(isSafeIdentifier, 'Invalid archive.org identifier');

export const trayItemSchema = z.object({
  identifier: identifierSchema,
  title: z.string().trim().min(1).max(500),
  section: z.enum(SECTION_IDS),
  publication: z.string().trim().max(300).optional(),
  year: z.number().int().min(1).max(2100).optional(),
  date: z
    .string()
    .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/)
    .optional(),
  // Local cover-cache paths (/cover/...) or, for selections saved before the cache, full URLs.
  thumbnail: z
    .string()
    .max(600)
    .refine((t) => t.startsWith('/cover/') || /^https:\/\//.test(t), 'Invalid thumbnail')
    .optional(),
});

export const createDownloadSchema = z.object({
  items: z.array(trayItemSchema).min(1).max(MAX_TRAY_ITEMS),
  format: z.enum(FRIENDLY_FORMATS),
  fallback: z.enum(['skip', 'pdf', 'text']),
});
