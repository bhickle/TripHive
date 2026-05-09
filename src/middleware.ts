import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PREVIEW_COOKIE = 'tc_preview'; // build bump
// PREVIEW_SECRET MUST be set in Vercel for the coming-soon bypass to work.
// Previously the file shipped a guessable default (`tc2026`) — anyone
// reading the bundled middleware could bypass the gate. With no fallback,
// missing env causes EVERY query-string preview attempt to fail rather
// than silently honoring the leaked default. The cookie path still works
// for users who already have it set.
const PREVIEW_SECRET = process.env.PREVIEW_SECRET ?? '';

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // ── Always allow: API routes, Next.js internals, and static assets ──
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|otf)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // ── Always allow the coming-soon page itself ──
  if (pathname === '/coming-soon') {
    return NextResponse.next();
  }

  // ── Always allow join pages — SMS invitees don't have the preview cookie ──
  if (pathname.startsWith('/join/')) {
    return NextResponse.next();
  }

  // ── Always allow the OAuth callback — it arrives before the cookie is set ──
  if (pathname.startsWith('/auth/callback')) {
    return NextResponse.next();
  }

  // ── Preview key in query string → set cookie & redirect to clean URL ──
  // Empty PREVIEW_SECRET means the env var isn't set; deny ALL preview
  // attempts in that case so an attacker can't supply ?preview= with a
  // matching empty string.
  const previewKey = searchParams.get('preview');
  if (PREVIEW_SECRET && previewKey === PREVIEW_SECRET) {
    const cleanUrl = new URL(request.url);
    cleanUrl.searchParams.delete('preview');
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(PREVIEW_COOKIE, '1', {
      maxAge: 60 * 60 * 24 * 90, // 90 days
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
    });
    return response;
  }

  // ── Check for existing bypass cookie ──
  const hasCookie = request.cookies.get(PREVIEW_COOKIE)?.value === '1';
  if (!hasCookie) {
    return NextResponse.redirect(new URL('/coming-soon', request.url));
  }

  // ── Refresh Supabase session (keeps auth tokens alive) ──
  // Wrapped in try/catch so a Supabase hiccup never brings down the whole app.
  try {
    const { updateSession } = await import('@/lib/supabase/middleware');
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  } catch {
    // If Supabase session refresh fails, let the request through normally.
    return NextResponse.next();
  }
}

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
