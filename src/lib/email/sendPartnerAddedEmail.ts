/**
 * Sends the "you've been added to a trip as a default travel partner" email
 * via SendGrid. Called fire-and-forget from /api/trips/save when the trip
 * organizer has the recipient set as their default_partner_id.
 *
 * Returns void on success. Throws on SendGrid failure so the caller's
 * .catch() can log it. The caller MUST NOT await this on the critical path
 * of trip creation — the email is auxiliary and SendGrid latency would
 * otherwise stretch the trip-save response.
 *
 * Required env vars:
 *   SENDGRID_API_KEY     — when unset, this function logs and returns (no throw).
 *   SENDGRID_FROM_EMAIL  — verified sender. Falls back to hello@tripcoord.ai.
 *   NEXT_PUBLIC_APP_URL  — used in the CTA href. Falls back to www.tripcoord.ai.
 */
export async function sendPartnerAddedEmail(args: {
  toEmail: string;
  toName: string | null;
  organizerName: string;
  tripName: string;
  tripId: string;
}): Promise<void> {
  const { toEmail, toName, organizerName, tripName, tripId } = args;
  if (!toEmail) return;

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[partner-email] SENDGRID_API_KEY not set — skipping send');
    return;
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'hello@tripcoord.ai';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.tripcoord.ai';
  const prefsUrl = `${appUrl}/trip/${tripId}/preferences`;

  // Greet with a name when we have one — falls back to a plain "Hi there"
  // so we don't surface "Hi null" or "Hi undefined" in the body.
  const greeting = toName ? `Hi ${escapeHtml(toName)},` : 'Hi there,';

  const safeOrganizer = escapeHtml(organizerName);
  const safeTrip = escapeHtml(tripName);

  const subject = `${organizerName} added you to ${tripName} on tripcoord`;
  const bodyText =
    `${toName ? `Hi ${toName},\n\n` : 'Hi there,\n\n'}` +
    `${organizerName} added you to "${tripName}" on tripcoord.\n\n` +
    `To make sure the AI itinerary fits both of you, share your travel preferences — it's a 1-minute mini-wizard:\n\n` +
    `${prefsUrl}\n\n---\ntripcoord · group travel made easy\n${appUrl}\n`;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: fromEmail, name: 'tripcoord' },
      reply_to: { email: fromEmail, name: 'tripcoord' },
      subject,
      content: [
        { type: 'text/plain', value: bodyText },
        {
          type: 'text/html',
          value: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#0c4a6e;padding:32px 32px 24px;text-align:center;">
          <p style="font-size:36px;margin:0 0 8px;">✈️</p>
          <h1 style="color:#ffffff;font-size:24px;margin:0 0 4px;font-weight:700;">You're on the trip</h1>
          <p style="color:#7dd3fc;font-size:13px;margin:0;">tripcoord · group travel made easy</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#3f3f46;font-size:16px;line-height:1.7;margin:0 0 16px;">${greeting}</p>
          <p style="color:#3f3f46;font-size:16px;line-height:1.7;margin:0 0 16px;">
            <strong>${safeOrganizer}</strong> added you to <strong>${safeTrip}</strong> on tripcoord as their travel companion.
          </p>
          <p style="color:#3f3f46;font-size:16px;line-height:1.7;margin:0 0 28px;">
            Take a minute to share your travel preferences so the AI itinerary fits both of you:
          </p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="background:#0c4a6e;border-radius:100px;">
              <a href="${prefsUrl}" style="display:inline-block;color:#ffffff;padding:14px 32px;text-decoration:none;font-weight:700;font-size:15px;border-radius:100px;">Open My Preferences →</a>
            </td></tr>
          </table>
          <p style="color:#a1a1aa;font-size:12px;margin:0;">Can't click the button? Copy this link into your browser:<br>
          <a href="${prefsUrl}" style="color:#0c4a6e;word-break:break-all;">${prefsUrl}</a></p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e4e4e7;text-align:center;">
          <p style="color:#a1a1aa;font-size:11px;margin:0;">
            You received this because ${safeOrganizer} has you set as their default travel partner on tripcoord.<br>
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
    const rawText = await res.text().catch(() => '');
    let errMsg = '';
    try {
      const parsed = rawText ? JSON.parse(rawText) : null;
      errMsg = parsed?.errors?.[0]?.message || (parsed ? JSON.stringify(parsed) : '');
    } catch {
      errMsg = rawText.slice(0, 200);
    }
    if (!errMsg) errMsg = `empty response body (HTTP ${res.status})`;
    throw new Error(`SendGrid ${res.status}: ${errMsg}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
