import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/invite/email
 * Sends a trip invite email via SendGrid, OR creates an in-app notification
 * if the invitee already has a TripCoord account.
 *
 * Required env vars (when email delivery is needed):
 *   SENDGRID_API_KEY       — from app.sendgrid.com → Settings → API Keys
 *   SENDGRID_FROM_EMAIL    — verified sender address in SendGrid
 *   NEXT_PUBLIC_APP_URL    — e.g. https://www.tripcoord.ai
 *
 * Body: { email, tripId, tripName, inviterName, message? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const { email, tripId, tripName, inviterName, message } = await request.json();

  if (!email || !tripId) {
    return NextResponse.json({ error: 'email and tripId required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify caller is the trip organizer
  const { data: trip } = await supabase
    .from('trips')
    .select('organizer_id')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip || trip.organizer_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Check if invitee already has a TripCoord account ─────────────────────
  // If yes, create an in-app notification instead of (or in addition to) email
  let existingUserId: string | null = null;
  try {
    const { data: authUser } = await supabase.auth.admin.listUsers();
    const matched = authUser?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (matched) existingUserId = matched.id;
  } catch {
    // Non-fatal — continue with email path
  }

  if (existingUserId) {
    // Insert in-app notification for the existing user
    await supabase.from('notifications').insert({
      user_id: existingUserId,
      type: 'trip_invite',
      trip_id: tripId,
      trip_name: tripName || null,
      inviter_name: inviterName || null,
      message: message || null,
    });
    // Don't return early — also send an email below so they get both
  }

  // ── Send email via SendGrid ───────────────────────────────────────────────
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    // Email service not yet configured — tell the client to fall back to the link
    return NextResponse.json({ success: false, noService: true });
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'hello@tripcoord.ai';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tripcoord.ai';
  const joinUrl = `${appUrl}/join/${tripId}`;
  const subject = `${inviterName || 'Someone'} invited you to join ${tripName || 'a trip'} on TripCoord`;
  const body = message || `${inviterName || 'A friend'} has invited you to join <strong>${tripName}</strong> on TripCoord — AI-powered group travel planning.`;

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: fromEmail, name: 'TripCoord' },
        subject,
        content: [
          {
            type: 'text/html',
            value: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fafaf9;border-radius:16px;">
                <div style="text-align:center;margin-bottom:28px;">
                  <span style="font-size:32px;">✈️</span>
                  <h1 style="color:#0c4a6e;font-size:26px;margin:12px 0 4px;">You're invited!</h1>
                  <p style="color:#71717a;font-size:14px;margin:0;">TripCoord · group travel made easy</p>
                </div>
                <div style="background:white;border-radius:12px;padding:24px;border:1px solid #e4e4e7;margin-bottom:24px;">
                  <p style="color:#3f3f46;font-size:16px;line-height:1.6;margin:0 0 20px;">${body}</p>
                  <a href="${joinUrl}"
                    style="display:inline-block;background:#0c4a6e;color:white;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700;font-size:15px;">
                    Join the Trip →
                  </a>
                </div>
                <p style="color:#a1a1aa;font-size:12px;text-align:center;">
                  Can't click the button? Copy this link:<br/>
                  <a href="${joinUrl}" style="color:#0c4a6e;">${joinUrl}</a>
                </p>
              </div>
            `,
          },
        ],
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errMsg = (data?.errors?.[0]?.message) || JSON.stringify(data);
      console.error(`[sg-err] ${res.status} | ${errMsg}`);
      throw new Error(`SendGrid ${res.status}: ${errMsg}`);
    }
    return NextResponse.json({ success: true, notified: existingUserId ? 'in_app_and_email' : 'email' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[invite/email] error:', msg);
    return NextResponse.json({ error: 'Failed to send email', detail: msg }, { status: 500 });
  }
}
