import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // Verify the caller is the organizer of this trip
  if (tripId) {
    const supabase = createAdminClient();
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', tripId)
      .maybeSingle();

    if (!trip || trip.organizer_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL || 'https://tripcoord.app';
  const joinUrl = `${appUrl}/join/${tripId}`;
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

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Twilio error');
    return NextResponse.json({ success: true, sid: data.sid });
  } catch (err) {
    console.error('[invite/sms] error:', err);
    return NextResponse.json({ error: 'Failed to send SMS' }, { status: 500 });
  }
}
