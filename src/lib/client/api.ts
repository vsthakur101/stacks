'use client';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** JSON call to our own API. Always sends application/json (required by the server's guard). */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string } } | null;
  if (!res.ok || !json || json.error) {
    throw new ApiError(json?.error?.code ?? 'HTTP_ERROR', json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

export { formatBytesServer as formatBytes } from '@/lib/format';
