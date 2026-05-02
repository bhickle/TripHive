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
  const bodyHtml = message
    ? message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : `${inviterName || 'A friend'} has invited you to join <strong>${tripName}</strong> on TripCoord — AI-powered group travel planning.`;
  const bodyText = message || `${inviterName || 'A friend'} has invited you to join ${tripName || 'a trip'} on TripCoord.\n\nJoin here: ${joinUrl}`;

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
        reply_to: { email: fromEmail, name: 'TripCoord' },
        subject,
        // Plain text version helps avoid spam filters
        content: [
          {
            type: 'text/plain',
            value: `${bodyText}\n\nJoin the trip: ${joinUrl}\n\n---\nTripCoord · group travel made easy\n${appUrl}`,
          },
          {
            type: 'text/html',
            value: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#0c4a6e;padding:32px 32px 24px;text-align:center;">
          <p style="font-size:36px;margin:0 0 8px;">✈️</p>
          <h1 style="color:#ffffff;font-size:24px;margin:0 0 4px;font-weight:700;">You're invited!</h1>
          <p style="color:#7dd3fc;font-size:13px;margin:0;">TripCoord · group travel made easy</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="color:#3f3f46;font-size:16px;line-height:1.7;margin:0 0 28px;">${bodyHtml}</p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#0c4a6e;border-radius:100px;">
              <a href="${joinUrl}" style="display:inline-block;color:#ffffff;padding:14px 32px;text-decoration:none;font-weight:700;font-size:15px;border-radius:100px;">Join the Trip →</a>
            </td></tr>
          </table>
          <p style="color:#a1a1aa;font-size:12px;margin:0;">Can't click the button? Copy this link into your browser:<br>
          <a href="${joinUrl}" style="color:#0c4a6e;word-break:break-all;">${joinUrl}</a></p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e4e4e7;text-align:center;">
          <p style="color:#a1a1aa;font-size:11px;margin:0;">
            You received this because someone invited you to a TripCoord trip.<br>
            <a href="${appUrl}" style="color:#0c4a6e;">tripcoord.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
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
