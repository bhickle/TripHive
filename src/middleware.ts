import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PREVIEW_COOKIE = 'tc_preview'; // build bump
// PREVIEW_SECRET: prefers the Vercel env var if set; otherwise falls back to
// the shared pre-launch testing secret 'tc2026' so invited testers can get
// past the coming-soon gate without Brandon having to add the env var first.
//
// Trade-off (re-introduced 2026-05-13 per Brandon): anyone who reads the
// bundled middleware JS can see the fallback value, so 'tc2026' is NOT a
// real access control. It's a "speedbump for the public" while pre-launch
// testers (friends, family) can share the value verbally. Before launch:
// (1) set PREVIEW_SECRET to a strong value in Vercel and (2) remove this
// fallback so the gate can't be bypassed by reading the source bundle.
const PREVIEW_SECRET = process.env.PREVIEW_SECRET ?? 'tc2026';

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

  // ── Always allow all auth pages — login, signup, reset-password,
  // update-password, and the OAuth callback. A password-reset / email-confirm
  // link must work for anyone, including users without the preview cookie. ──
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next();
  }

  // ── Preview key in query string → set cookie & redirect to clean URL ──
  // PREVIEW_SECRET always has a value (env var or 'tc2026' fallback), so the
  // truthiness guard below mainly belongs-and-belts an accidental future
  // change that clears the fallback. Without it, an attacker supplying an
  // empty ?preview= against an empty PREVIEW_SECRET would slip through.
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
