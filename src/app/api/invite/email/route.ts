import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/invite/email
 * Sends a trip invite email via SendGrid.
 *
 * Required env vars:
 *   SENDGRID_API_KEY      — from app.sendgrid.com → Settings → API Keys
 *   NEXT_PUBLIC_APP_URL   — e.g. https://www.tripcoord.ai (used for join links)
 *
 * Body: { email, tripId, tripName, inviterName, message? }
 */
export async function POST(request: NextRequest) {
  const { email, tripId, tripName, inviterName, message } = await request.json();

  if (!email || !tripId) {
    return NextResponse.json({ error: 'email and tripId required' }, { status: 400 });
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[invite/email] SENDGRID_API_KEY not set — email invite not sent to:', email);
    return NextResponse.json({ error: 'Email service not configured' }, { status: 503 });
  }

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
        from: { email: process.env.SENDGRID_FROM_EMAIL || 'hello@tripcoord.ai', name: 'TripCoord' },
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

    // SendGrid returns 202 Accepted with no body on success
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { errors?: { message: string }[] }).errors?.[0]?.message || 'SendGrid error');
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[invite/email] error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
