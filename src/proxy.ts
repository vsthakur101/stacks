import { NextResponse, type NextRequest } from 'next/server';

/**
 * Passes the requested path to the root layout, which can't read it otherwise. The layout uses it to
 * render the Poster theme's section colour on the server, so a full page load never flashes the
 * default colour first.
 */
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-stacks-path', req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/|api/|favicon).*)'] };
