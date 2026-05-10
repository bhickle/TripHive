import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTripRole } from '@/lib/supabase/tripAccess';

/**
 * POST /api/invite/sms
 * Sends a trip invite SMS via Twilio.
 * Requires the caller to be the trip organizer.
 *
 * Required env vars:
 *   TWILIO_ACCOUNT_SID    — from console.twilio.com
 *   TWILIO_AUTH_TOKEN     — from console.twilio.com
 *   TWILIO_PHONE_NUMBER   — your Twilio number, e.g. +15551234567
 *   NEXT_PUBLIC_APP_URL   — e.g. https://tripcoord.app
 *
 * Body: { phone, tripId, tripName, inviterName }
 */
export async function POST(request: NextRequest) {
  // Auth — must be signed in
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const { phone, tripId, tripName, inviterName } = await request.json();

  // Verify the caller is the organizer or a co-organizer of this trip
  let inviteToken: string | null = null;
  if (tripId) {
    const supabase = createAdminClient();
    const role = await getTripRole(supabase, tripId, userId);
    if (!role || (role !== 'organizer' && role !== 'co_organizer')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Issue an invite token (Phase 1 of the invite-token system — token is
    // optional on join today, but this populates trip_invites for audit
    // and lays groundwork for the privacy gate). DB column defaults
    // generate the token + 7-day expires_at.
    try {
      const { data: invite, error } = await supabase
        .from('trip_invites')
        .insert({ trip_id: tripId, invited_by: userId, phone: (phone || '').trim() })
        .select('token')
        .single();
      if (error) {
        console.warn('[invite/sms] trip_invites insert failed:', error.message);
      } else {
        inviteToken = invite?.token ?? null;
      }
    } catch (err) {
      console.warn('[invite/sms] trip_invites insert threw:', err);
    }
  }

  if (!phone || !tripId) {
    return NextResponse.json({ error: 'phone and tripId required' }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone  = process.env.TWILIO_PHONE_NUMBER;

  if (
    !accountSid || accountSid === 'your_twilio_account_sid_here' ||
    !authToken  || authToken  === 'your_twilio_auth_token_here'  ||
    !fromPhone  || fromPhone  === 'your_twilio_phone_number_here'
  ) {
    // Not yet configured — return a helpful stub response in dev
    console.log('[invite/sms] Twilio not configured. Would have texted:', phone);
    return NextResponse.json({ success: true, stub: true });
  }

  // Fallback domain corrected from `tripcoord.app` (wrong TLD) to
  // `tripcoord.ai` so SMS invites still link somewhere sensible if
  // NEXT_PUBLIC_APP_URL is unset in any environment.
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tripcoord.ai';
  // Embed the invite token in the URL so the join flow can validate + consume
  // it. Falls back to the open share-link form if token issuance failed.
  const joinUrl = inviteToken
    ? `${appUrl}/join/${tripId}?invite=${inviteToken}`
    : `${appUrl}/join/${tripId}`;
  const body    = `${inviterName || 'Someone'} invited you to ${tripName || 'a trip'} on tripcoord! Join here: ${joinUrl}`;

  try {
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ Body: body, From: fromPhone, To: phone }).toString(),
      },
    );

    // Twilio surface: { code: number, message: string, more_info: url }
    // for errors. Capture both so the client can distinguish a transient
    // failure from a permanent one (invalid number, blocked recipient, etc.).
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = data?.code ? `Twilio ${data.code}` : `HTTP ${res.status}`;
      const message = data?.message || 'Send failed';
      throw new Error(`${code}: ${message}`);
    }
    return NextResponse.json({ success: true, sid: data.sid });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('[invite/sms] error:', detail);
    return NextResponse.json({ error: 'Failed to send SMS', detail }, { status: 500 });
  }
}
