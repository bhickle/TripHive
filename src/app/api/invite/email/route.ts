import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTripRole, getTripTravelerCap } from '@/lib/supabase/tripAccess';
import { consumeRateLimit } from '@/lib/supabase/rateLimit';

/**
 * POST /api/invite/email
 * Sends a trip invite email via SendGrid, OR creates an in-app notification
 * if the invitee already has a tripcoord account.
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

  // Verify caller is the trip organizer or a co-organizer.
  const role = await getTripRole(supabase, tripId, userId);
  if (!role || (role !== 'organizer' && role !== 'co_organizer')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Rate limit — this route spends real money (SendGrid) and reputation on
  // every call, and the rate-limit helper was previously unused here. Bound
  // both per-user and per-recipient hourly. Fails open if Supabase is down.
  const recipientKey = email.trim().toLowerCase();
  const [userOk, toOk] = await Promise.all([
    consumeRateLimit(`invite_email:user:${userId}`, 30, 3600),
    consumeRateLimit(`invite_email:to:${recipientKey}`, 5, 3600),
  ]);
  if (!userOk || !toOk) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many invites just now — please wait a little and try again.' },
      { status: 429 },
    );
  }

  // Traveler-cap pre-check: refuse to send an invite that the recipient
  // wouldn't be able to accept anyway (members POST would 403 with
  // TRAVELER_LIMIT). Without this the organizer burns a SendGrid send and
  // the recipient hits a dead-end on join. Counts current members + still-
  // pending invites so a burst of invites can't overshoot the cap together.
  const capInfo = await getTripTravelerCap(supabase, tripId);
  if (capInfo.currentTotal + capInfo.pendingInvites >= capInfo.cap) {
    return NextResponse.json(
      {
        error: 'TRAVELER_LIMIT',
        message: `This trip is at its ${capInfo.cap}-traveler limit (counting pending invites). Upgrade or buy a Trip Pass with more seats to invite more people.`,
      },
      { status: 403 },
    );
  }

  // ── Issue an invite token ─────────────────────────────────────────────────
  // Insert a trip_invites row up-front. The DB generates a 32-byte hex token
  // and a 7-day expires_at via the column defaults; we just capture the
  // token to embed in the URL. Phase 1 of the invite-token system: token is
  // optional on join (open share-link still works), but a tokened join is
  // tracked + consumed and gives us the audit trail. Phase 2 will add a
  // privacy flag on trips that requires the token.
  let inviteToken: string | null = null;
  try {
    const { data: invite, error: inviteError } = await supabase
      .from('trip_invites')
      .insert({ trip_id: tripId, invited_by: userId, email: email.trim() })
      .select('token')
      .single();
    if (inviteError) {
      console.warn('[invite/email] trip_invites insert failed:', inviteError.message);
    } else {
      inviteToken = invite?.token ?? null;
    }
  } catch (err) {
    console.warn('[invite/email] trip_invites insert threw:', err);
  }

  // ── Check if invitee already has a tripcoord account ─────────────────────
  // If yes, create an in-app notification instead of (or in addition to) email.
  //
  // Look the email up via the profiles table (single indexed query on email)
  // instead of auth.admin.listUsers() — that previous approach pulled every
  // user record from auth on every invite send, which is both expensive and a
  // service-role-data scan triggered by user input.
  let existingUserId: string | null = null;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();
    if (profile?.id) existingUserId = profile.id;
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
  // Embed the invite token in the URL so the join flow can validate + consume
  // it. Falls back to the open share-link form if token issuance failed.
  const joinUrl = inviteToken
    ? `${appUrl}/join/${tripId}?invite=${inviteToken}`
    : `${appUrl}/join/${tripId}`;
  const subject = `${inviterName || 'Someone'} invited you to join ${tripName || 'a trip'} on tripcoord`;
  // Escape any user-supplied text before it goes into the HTML body — a trip
  // named `<img src=x onerror=…>` would otherwise inject markup. (COMP-4)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bodyHtml = message
    ? esc(message)
    : `${esc(inviterName || 'A friend')} has invited you to join <strong>${esc(tripName || 'a trip')}</strong> on tripcoord — AI-powered group travel planning.`;
  const bodyText = message || `${inviterName || 'A friend'} has invited you to join ${tripName || 'a trip'} on tripcoord.\n\nJoin here: ${joinUrl}`;

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: fromEmail, name: 'tripcoord' },
        reply_to: { email: fromEmail, name: 'tripcoord' },
        subject,
        // Plain text version helps avoid spam filters
        content: [
          {
            type: 'text/plain',
            value: `${bodyText}\n\nJoin the trip: ${joinUrl}\n\n---\ntripcoord · group travel made easy\n${appUrl}`,
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
          <p style="color:#7dd3fc;font-size:13px;margin:0;">tripcoord · group travel made easy</p>
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
            You received this because someone invited you to a tripcoord trip.<br>
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
      // SendGrid usually returns JSON like { errors: [{ message, field, help }] }
      // but a non-JSON 5xx (gateway timeout, HTML error page) used to surface
      // here as the literal string "{}" because the .catch fallback returned
      // an empty object. Read text first, fall back through layers.
      const rawText = await res.text().catch(() => '');
      let errMsg = '';
      try {
        const parsed = rawText ? JSON.parse(rawText) : null;
        errMsg = parsed?.errors?.[0]?.message
          || (parsed ? JSON.stringify(parsed) : '');
      } catch {
        errMsg = rawText.slice(0, 200);
      }
      if (!errMsg) errMsg = `empty response body (HTTP ${res.status})`;
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
