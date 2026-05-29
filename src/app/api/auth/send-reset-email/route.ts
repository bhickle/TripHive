import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit, clientIpFromRequest } from '@/lib/supabase/rateLimit';

/**
 * POST /api/auth/send-reset-email
 * Generates a Supabase password-recovery link via the admin API, then sends
 * it via SendGrid with tripcoord branding (no "3rd party" warning).
 *
 * Body: { email }
 * Public route — no auth required (user doesn't have a session yet).
 *
 * Abuse mitigation: dual rate limit (per-IP + per-recipient) bounds both
 * spam-bombing of a single inbox and SendGrid-quota burn from a single
 * attacker. Limits chosen low enough to deter abuse, high enough to
 * accommodate a legitimate user who fat-fingers their email a few times.
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({}));

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 });
  }

  // Reject obvious junk before we touch Supabase or SendGrid. Generic regex
  // here, not full RFC validation — the goal is to filter out attacks that
  // try to feed garbage into the link generator.
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 });
  }

  // Per-IP gate: a single attacker shouldn't be able to burn through the
  // SendGrid quota or harvest signup timing. 5 sends per hour leaves room
  // for a legitimate user who's confused but stops a script cold.
  const ip = clientIpFromRequest(request);
  const ipAllowed = await consumeRateLimit(`reset_email:ip:${ip}`, 5, 60 * 60);
  if (!ipAllowed) {
    console.warn(`[send-reset-email] IP rate limit hit: ${ip}`);
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }
  // Per-recipient gate: stops spam-bombing a single victim even from a
  // botnet of IPs. 3 emails per hour to one inbox is plenty for a real
  // user clicking Reset twice.
  const recipientAllowed = await consumeRateLimit(`reset_email:to:${trimmed}`, 3, 60 * 60);
  if (!recipientAllowed) {
    // Return success anyway — same as we do for unknown emails, so
    // attackers can't probe whether they're being throttled per-inbox.
    console.warn(`[send-reset-email] recipient rate limit hit: ${trimmed}`);
    return NextResponse.json({ success: true });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tripcoord.ai';
  const supabase = createAdminClient();

  // Generate the recovery link — this produces a Supabase-signed URL that
  // redirects to our /auth/update-password page after verifying the token.
  const { data, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: trimmed,
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
        personalizations: [{ to: [{ email: trimmed }] }],
        from: { email: fromEmail, name: 'tripcoord' },
        subject: 'Reset your tripcoord password',
        content: [
          {
            type: 'text/html',
            value: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#fafaf9;border-radius:16px;">
                <div style="text-align:center;margin-bottom:28px;">
                  <span style="font-size:32px;">🔐</span>
                  <h1 style="color:#0c4a6e;font-size:26px;margin:12px 0 4px;">Reset your password</h1>
                  <p style="color:#71717a;font-size:14px;margin:0;">tripcoord · group travel made easy</p>
                </div>
                <div style="background:white;border-radius:12px;padding:24px;border:1px solid #e4e4e7;margin-bottom:24px;">
                  <p style="color:#3f3f46;font-size:16px;line-height:1.6;margin:0 0 20px;">
                    We received a request to reset your tripcoord password. Click the button below to choose a new one.
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
