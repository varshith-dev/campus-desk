// Adds a content security policy with a fresh nonce to every page. Scripts run only if they are from this site or carry the
// nonce, so injected script cannot run. connect-src allows https because a visitor may point the page at their own model router.
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(req.headers);
  // First visit: hand out a session token now, so every request the page makes next shares one guest.
  let fresh: string | undefined;
  if (!req.cookies.get('cd_session')?.value) {
    fresh = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    headers.set('cookie', [req.headers.get('cookie'), `cd_session=${fresh}`].filter(Boolean).join('; '));
  }
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  if (fresh) res.cookies.set('cd_session', fresh, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: 30 * 86_400 });
  return res;
}

export const config = {
  matcher: [{ source: '/((?!api|_next/static|_next/image|favicon.svg|runtime|.*\\.json$).*)', missing: [{ type: 'header', key: 'next-router-prefetch' }, { type: 'header', key: 'purpose', value: 'prefetch' }] }],
};
