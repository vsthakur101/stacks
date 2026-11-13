import { NextResponse } from 'next/server';
import { z } from 'zod';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function apiError(status: number, code: string, message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

/**
 * The server can write files and open Finder, so every API call must come from this machine's own UI:
 * - Host must be a loopback name (defeats DNS rebinding).
 * - Mutations must carry a same-origin Origin (when present) and a JSON content type, which a
 *   cross-site page can only send after a CORS preflight that we never approve.
 */
export function guard(req: Request): NextResponse | null {
  const host = req.headers.get('host') ?? '';
  const hostname = host.replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(hostname)) return apiError(403, 'FORBIDDEN_HOST', 'Stacks only answers on localhost.');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.headers.get('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* fallthrough */
      }
      if (originHost !== host) return apiError(403, 'FORBIDDEN_ORIGIN', 'Cross-site requests are not allowed.');
    }
    const type = req.headers.get('content-type') ?? '';
    if (!type.startsWith('application/json')) return apiError(415, 'JSON_REQUIRED', 'Send application/json.');
  }
  return null;
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: apiError(400, 'INVALID_JSON', 'Request body must be JSON.') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      error: apiError(
        400,
        'VALIDATION_ERROR',
        'Invalid request.',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      ),
    };
  }
  return { data: parsed.data };
}
