import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/auth/send-reset-email
 * Generates a Supabase password-recovery link via the admin API, then sends
 * it via SendGrid with TripCoord branding (no "3rd party" warning).
 *
 * Body: { email }
 * Public route — no auth required (user doesn't have a session yet).
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({}));

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tripcoord.ai';
  const supabase = createAdminClient();

  // Generate the recovery link — this produces a Supabase-signed URL that
  // redirects to our /auth/update-password page after verifying the token.
  const { data, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: email.trim().toLowerCase(),
    options: {
      redirectTo: `${appUrl}/auth/update-password`,
    },
  });

  if (linkError) {
    // Don't reveal whether the email exists — silently succeed from the
    // user's perspective (same UX as Supabase's built-in flow).
    console.error('[send-reset-email] generateLink error:', linkError.message);
    return NextResponse.json({ success: true });
  }

  const resetLink = data?.properties?.action_link;
  if (!resetLink) {
    console.error('[send-reset-email] no action_link returned');
    return NextResponse.json({ success: true });
  }

  // ── Send via SendGrid ──────────────────────────────────────────────────────
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    // Email not configured — log and return success so the UI doesn't block.
    console.warn('[send-reset-email] SENDGRID_API_KEY not set; skipping send');
    return NextResponse.json({ success: true, noService: true });
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'hello@tripcoord.ai';

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email.trim() }] }],
        from: { email: fromEmail, name: 'TripCoord' },
        subject: 'Reset your TripCoord password',
        content: [
          {
            type: 'text/html',
            value: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fafaf9;border-radius:16px;">
                <div style="text-align:center;margin-bottom:28px;">
                  <span style="font-size:32px;">🔐</span>
                  <h1 style="color:#0c4a6e;font-size:26px;margin:12px 0 4px;">Reset your password</h1>
                  <p style="color:#71717a;font-size:14px;margin:0;">TripCoord · group travel made easy</p>
                </div>
                <div style="background:white;border-radius:12px;padding:24px;border:1px solid #e4e4e7;margin-bottom:24px;">
                  <p style="color:#3f3f46;font-size:16px;line-height:1.6;margin:0 0 20px;">
                    We received a request to reset your TripCoord password. Click the button below to choose a new one.
                    This link expires in <strong>1 hour</strong>.
                  </p>
                  <a href="${resetLink}"
                    style="display:inline-block;background:#0c4a6e;color:white;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700;font-size:15px;">
                    Reset Password →
                  </a>
                </div>
                <p style="color:#a1a1aa;font-size:13px;line-height:1.6;text-align:center;">
                  If you didn&apos;t request this, you can safely ignore this email — your password won&apos;t change.<br/>
                  Can&apos;t click the button? Copy this link:<br/>
                  <a href="${resetLink}" style="color:#0c4a6e;word-break:break-all;">${resetLink}</a>
                </p>
              </div>
            `,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData?.errors?.[0]?.message || JSON.stringify(errData);
      console.error(`[send-reset-email] SendGrid ${res.status}: ${msg}`);
      // Return success anyway — we don't want to hint that the email failed
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[send-reset-email] fetch error:', err);
    return NextResponse.json({ success: true });
  }
}
