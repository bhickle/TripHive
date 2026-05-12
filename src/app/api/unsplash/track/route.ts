import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

/**
 * POST /api/unsplash/track   [auth required]
 * Body: { downloadLocation: string }
 *
 * Pings Unsplash's per-photo download endpoint as required by their API
 * guidelines: "whenever you ostensibly use the file, you must send a
 * request to the download endpoint to increment the number of downloads."
 *
 * Required for production-mode approval. Server-side proxy keeps the
 * access key off the client. The client gates calls via sessionStorage
 * so each photo is tracked at most once per browser session.
 *
 * Auth gate: pre-launch QA flagged this as quota-drainable.
 *
 * Fire-and-forget — the response body just contains a download URL we
 * don't need. Errors are swallowed so a tracking blip never breaks the UI.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const { downloadLocation } = await req.json();
    if (!downloadLocation || typeof downloadLocation !== 'string') {
      return NextResponse.json({ error: 'downloadLocation required' }, { status: 400 });
    }
    if (!downloadLocation.startsWith('https://api.unsplash.com/')) {
      return NextResponse.json({ error: 'invalid downloadLocation' }, { status: 400 });
    }

    const key = process.env.UNSPLASH_ACCESS_KEY;
    if (!key) return NextResponse.json({ ok: true }); // silent no-op

    fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}` },
    }).catch(() => { /* fire and forget */ });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
