import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/invite/email
 * Sends a trip invite email via Resend.
 *
 * Required env vars:
 *   RESEND_API_KEY        — from resend.com
 *   NEXT_PUBLIC_APP_URL   — e.g. https://tripcoord.app (used for join links)
 *
 * Body: { email, tripId, tripName, inviterName, message? }
 */
export async function POST(request: NextRequest) {
  const { email, tripId, tripName, inviterName, message } = await request.json();

  if (!email || !tripId) {
    return NextResponse.json({ error: 'email and tripId required' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'your_resend_api_key_here') {
    // Not yet configured — return a helpful stub response in dev
    console.log('[invite/email] RESEND_API_KEY not set. Would have sent to:', email);
    return NextResponse.json({ success: true, stub: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tripcoord.ai';
  const joinUrl = `${appUrl}/join/${tripId}`;
  const subject = `${inviterName || 'Someone'} invited you to join ${tripName || 'a trip'} on tripcoord`;
  const body = message || `${inviterName || 'A friend'} has invited you to join <strong>${tripName}</strong> on tripcoord — AI-powered group travel planning.`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'tripcoord <onboarding@resend.dev>',
        to: email,
        subject,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fafaf9;border-radius:16px;">
            <div style="text-align:center;margin-bottom:28px;">
              <span style="font-size:32px;">✈️</span>
              <h1 style="color:#0c4a6e;font-size:26px;margin:12px 0 4px;">You're invited!</h1>
              <p style="color:#71717a;font-size:14px;margin:0;">tripcoord · group travel made easy</p>
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
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Resend error');
    return NextResponse.json({ success: true, id: data.id });
  } catch (err) {
    console.error('[invite/email] error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
