/**
 * GET /api/cron/lifecycle-emails
 *
 * Vercel Cron entry point — runs daily at 15:00 UTC (9 AM Central).
 * Sends lifecycle drip emails via SendGrid for engaged moments in the
 * trip lifecycle:
 *
 *   stalled       — trip started in Trip Builder 7+ days ago, never
 *                   produced an itinerary. "Finish planning your trip."
 *   upcoming_14d  — trip starts in ~14 days. Prep checklist nudge.
 *   upcoming_7d   — trip starts in ~7 days. "Generate your packing list."
 *   upcoming_1d   — trip starts tomorrow. Day-of guide reminder.
 *   post_trip     — trip ended ~3 days ago. "Add your memories."
 *
 * Idempotency: every send first inserts a row into lifecycle_emails_sent
 * with UNIQUE (user_id, trip_id, email_type). If the insert returns 0 rows
 * (conflict), we've already sent — skip silently. If the SendGrid call
 * then fails, we delete the tracking row so tomorrow's run retries.
 *
 * Auth: Bearer ${CRON_SECRET}. Without the env var, returns 500.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type EmailType = 'stalled' | 'upcoming_14d' | 'upcoming_7d' | 'upcoming_1d' | 'post_trip';

interface EmailJob {
  userId: string;
  email: string;
  firstName: string;
  tripId: string;
  tripTitle: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  type: EmailType;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tripcoord.ai';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@tripcoord.ai';

function firstName(name: string | null, email: string): string {
  if (name) return name.split(' ')[0];
  return email.split('@')[0];
}

function tripUrl(tripId: string, sub: 'itinerary' | 'prep' | 'memories' | 'dayof' = 'itinerary'): string {
  return `${APP_URL}/trip/${tripId}/${sub}`;
}

// ─── Email content ──────────────────────────────────────────────────────────
// One inline template per type. Keep markup minimal — Nunito/Cormorant aren't
// available in email clients, system fonts only. Header strip matches the
// invite-email visual identity (sky-800 band, ✈️ glyph, sky-300 subtitle).

function buildEmail(job: EmailJob): { subject: string; html: string; text: string } {
  const name = job.firstName;
  const dest = job.destination || job.tripTitle;
  const itineraryUrl = tripUrl(job.tripId);
  const prepUrl = tripUrl(job.tripId, 'prep');
  const memoriesUrl = tripUrl(job.tripId, 'memories');
  const dayofUrl = tripUrl(job.tripId, 'dayof');

  let subject = '';
  let preheader = '';
  let bodyText = '';
  let primaryCta: { label: string; url: string } = { label: 'Open your trip', url: itineraryUrl };
  let secondaryCta: { label: string; url: string } | null = null;

  switch (job.type) {
    case 'stalled':
      subject = `Finish planning your ${dest} trip`;
      preheader = `You started planning ${dest} a week ago — pick up where you left off.`;
      bodyText = `Hi ${name},\n\nYou started planning your trip to ${dest} a week ago, but the itinerary isn't finished yet. Your group's waiting!\n\nIt takes about two minutes to wrap up — tripcoord remembers everything you've entered.`;
      primaryCta = { label: 'Continue planning', url: itineraryUrl };
      break;
    case 'upcoming_14d':
      subject = `${dest} in 2 weeks — let's get ready`;
      preheader = `Two weeks out. Here's what's worth doing now.`;
      bodyText = `Hi ${name},\n\n${dest} is two weeks away. A few things worth knocking out this week:\n\n• Double-check passport & visa requirements\n• Confirm hotel check-ins and flight times\n• Skim the prep checklist inside tripcoord\n• Share the itinerary with anyone back home who needs it`;
      primaryCta = { label: 'Open prep checklist', url: prepUrl };
      secondaryCta = { label: 'View itinerary', url: itineraryUrl };
      break;
    case 'upcoming_7d':
      subject = `${dest} in 7 days — packing list ready`;
      preheader = `One week out. Pack smart based on the actual weather forecast.`;
      bodyText = `Hi ${name},\n\nSeven days until ${dest}. tripcoord can build you a smart packing list using the actual weather forecast for your dates plus the activities you've planned.\n\nMake sure your prep tasks are wrapped and dive in.`;
      primaryCta = { label: 'Open prep & packing', url: prepUrl };
      secondaryCta = { label: 'View itinerary', url: itineraryUrl };
      break;
    case 'upcoming_1d':
      subject = `${dest} tomorrow — your Day-Of guide is ready`;
      preheader = `Last-minute view of tomorrow's plan, addresses, and group chat.`;
      bodyText = `Hi ${name},\n\nYou're off to ${dest} tomorrow! Your Day-Of guide is ready: each day's plan, restaurant addresses, transit links, group chat — all in one place.\n\nSafe travels.`;
      primaryCta = { label: 'Open Day-Of guide', url: dayofUrl };
      secondaryCta = { label: 'View itinerary', url: itineraryUrl };
      break;
    case 'post_trip':
      subject = `How was ${dest}?`;
      preheader = `Add your photos and memories so the trip lives on.`;
      bodyText = `Hi ${name},\n\nWelcome back from ${dest}! Add your photos and a few reactions to your itinerary while it's fresh — your group chat will love it, and your Trip Story is waiting to be shared.`;
      primaryCta = { label: 'Add your memories', url: memoriesUrl };
      secondaryCta = { label: 'View itinerary', url: itineraryUrl };
      break;
  }

  const secondaryHtml = secondaryCta
    ? `<p style="color:#a1a1aa;font-size:13px;margin:12px 0 0;text-align:center;"><a href="${secondaryCta.url}" style="color:#0c4a6e;">${secondaryCta.label} →</a></p>`
    : '';
  const secondaryText = secondaryCta ? `\n\n${secondaryCta.label}: ${secondaryCta.url}` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:600px;width:100%;">
        <tr><td style="background:#0c4a6e;padding:28px 32px 20px;text-align:center;">
          <p style="font-size:32px;margin:0 0 6px;">✈️</p>
          <p style="color:#7dd3fc;font-size:13px;margin:0;">tripcoord · group travel made easy</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="color:#3f3f46;font-size:16px;line-height:1.7;margin:0 0 24px;white-space:pre-line;">${bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#0c4a6e;border-radius:100px;">
              <a href="${primaryCta.url}" style="display:inline-block;color:#ffffff;padding:14px 32px;text-decoration:none;font-weight:700;font-size:15px;border-radius:100px;">${primaryCta.label} →</a>
            </td></tr>
          </table>
          ${secondaryHtml}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:18px 32px;border-top:1px solid #e4e4e7;text-align:center;">
          <p style="color:#a1a1aa;font-size:11px;margin:0 0 4px;">
            You're getting this because you've got an active trip on tripcoord.
          </p>
          <p style="color:#a1a1aa;font-size:11px;margin:0;">
            <a href="${APP_URL}/settings" style="color:#0c4a6e;">Manage notifications</a> · <a href="${APP_URL}" style="color:#0c4a6e;">tripcoord.ai</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${bodyText}\n\n${primaryCta.label}: ${primaryCta.url}${secondaryText}\n\n---\ntripcoord · group travel made easy\nManage notifications: ${APP_URL}/settings`;

  return { subject, html, text };
}

// ─── SendGrid send ──────────────────────────────────────────────────────────

async function sendOne(apiKey: string, job: EmailJob): Promise<{ ok: boolean; reason?: string }> {
  const { subject, html, text } = buildEmail(job);

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: job.email }] }],
        from: { email: FROM_EMAIL, name: 'tripcoord' },
        reply_to: { email: FROM_EMAIL, name: 'tripcoord' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });
    if (!res.ok) {
      const rawText = await res.text().catch(() => '');
      return { ok: false, reason: `HTTP ${res.status}: ${rawText.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

// ─── Candidate queries ──────────────────────────────────────────────────────
// Each helper returns the EmailJob list for one email type. They're kept
// small + window-based so a single missed cron run doesn't silently drop
// users — the next day's run picks up anyone still in the window.

type AdminClient = ReturnType<typeof createAdminClient>;

interface TripWithItinerary {
  id: string;
  title: string;
  destination: string;
  organizer_id: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  itinerary_generated_at: string | null;
}

interface ProfileLite {
  id: string;
  email: string | null;
  name: string | null;
}

async function loadProfiles(supabase: AdminClient, ids: string[]): Promise<Map<string, ProfileLite>> {
  const out = new Map<string, ProfileLite>();
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from('profiles')
    .select('id, email, name')
    .in('id', ids);
  for (const p of data ?? []) out.set(p.id, p as ProfileLite);
  return out;
}

function buildJobsFromTrips(
  trips: TripWithItinerary[],
  profiles: Map<string, ProfileLite>,
  type: EmailType,
): EmailJob[] {
  const jobs: EmailJob[] = [];
  for (const t of trips) {
    if (!t.organizer_id) continue;
    const profile = profiles.get(t.organizer_id);
    if (!profile?.email) continue;
    jobs.push({
      userId: profile.id,
      email: profile.email,
      firstName: firstName(profile.name, profile.email),
      tripId: t.id,
      tripTitle: t.title || t.destination || 'your trip',
      destination: t.destination || t.title,
      startDate: t.start_date,
      endDate: t.end_date,
      type,
    });
  }
  return jobs;
}

async function findStalledJobs(supabase: AdminClient): Promise<EmailJob[]> {
  // Trip created 6-14 days ago AND itinerary never generated. Wide window
  // so a single missed cron run doesn't permanently strand a user.
  const now = new Date();
  const lowerBound = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const upperBound = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

  const { data: trips } = await supabase
    .from('trips')
    .select('id, title, destination, organizer_id, start_date, end_date, created_at, itinerary_generated_at')
    .is('itinerary_generated_at', null)
    .gte('created_at', lowerBound.toISOString())
    .lte('created_at', upperBound.toISOString())
    .not('organizer_id', 'is', null)
    .limit(200);

  const tripList = (trips ?? []) as TripWithItinerary[];
  const profileIds = tripList.map(t => t.organizer_id).filter((id): id is string => !!id);
  const profiles = await loadProfiles(supabase, profileIds);
  return buildJobsFromTrips(tripList, profiles, 'stalled');
}

async function findUpcomingJobs(
  supabase: AdminClient,
  daysOut: number,
  type: EmailType,
): Promise<EmailJob[]> {
  // start_date in a 2-day window around (today + daysOut) to ensure we catch
  // everyone even with timezone drift / missed runs. The UNIQUE constraint
  // on lifecycle_emails_sent guarantees no double-send.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(today.getTime() + daysOut * 24 * 60 * 60 * 1000);
  const lower = new Date(target.getTime() - 24 * 60 * 60 * 1000);
  const upper = new Date(target.getTime() + 24 * 60 * 60 * 1000);

  const { data: trips } = await supabase
    .from('trips')
    .select('id, title, destination, organizer_id, start_date, end_date, created_at, itinerary_generated_at')
    .gte('start_date', lower.toISOString().slice(0, 10))
    .lte('start_date', upper.toISOString().slice(0, 10))
    .not('organizer_id', 'is', null)
    .not('itinerary_generated_at', 'is', null) // only trips with real itineraries
    .limit(200);

  const tripList = (trips ?? []) as TripWithItinerary[];
  const profileIds = tripList.map(t => t.organizer_id).filter((id): id is string => !!id);
  const profiles = await loadProfiles(supabase, profileIds);
  return buildJobsFromTrips(tripList, profiles, type);
}

async function findPostTripJobs(supabase: AdminClient): Promise<EmailJob[]> {
  // Trip ended 2-7 days ago. Window catches both the sweet-spot (3 days
  // out, memories still fresh) and any missed runs further back.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const lower = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const upper = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

  const { data: trips } = await supabase
    .from('trips')
    .select('id, title, destination, organizer_id, start_date, end_date, created_at, itinerary_generated_at')
    .gte('end_date', lower.toISOString().slice(0, 10))
    .lte('end_date', upper.toISOString().slice(0, 10))
    .not('organizer_id', 'is', null)
    .limit(200);

  const tripList = (trips ?? []) as TripWithItinerary[];
  const profileIds = tripList.map(t => t.organizer_id).filter((id): id is string => !!id);
  const profiles = await loadProfiles(supabase, profileIds);
  return buildJobsFromTrips(tripList, profiles, 'post_trip');
}

// ─── Process queue ──────────────────────────────────────────────────────────

async function processJob(
  supabase: AdminClient,
  apiKey: string,
  job: EmailJob,
): Promise<'sent' | 'duplicate' | 'failed'> {
  // 1. Claim the send by inserting the tracking row. If a row already exists
  //    (UNIQUE conflict), the insert returns nothing — we've already sent.
  const { data: claim, error: claimErr } = await supabase
    .from('lifecycle_emails_sent')
    .insert({ user_id: job.userId, trip_id: job.tripId, email_type: job.type })
    .select('id')
    .maybeSingle();
  if (claimErr) {
    // Conflict error (unique violation) is the expected duplicate case
    if (claimErr.code === '23505') return 'duplicate';
    console.error('[cron/lifecycle-emails] claim insert failed:', claimErr);
    return 'failed';
  }
  if (!claim?.id) return 'duplicate';

  // 2. Actually send. If send fails, release the claim so tomorrow's run retries.
  const { ok, reason } = await sendOne(apiKey, job);
  if (!ok) {
    console.warn('[cron/lifecycle-emails] SendGrid failed for', job.email, job.type, '-', reason);
    await supabase.from('lifecycle_emails_sent').delete().eq('id', claim.id);
    return 'failed';
  }
  return 'sent';
}

export async function GET(req: NextRequest) {
  const cronAuth = verifyCronSecret(req, 'cron/lifecycle-emails');
  if (!cronAuth.ok) return cronAuth.response;

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    // A disabled-email config is not an error — log a warning and 200 so the
    // daily cron run doesn't go red in the logs.
    console.warn('[cron/lifecycle-emails] SENDGRID_API_KEY is not set — skipping send');
    return NextResponse.json({ ok: true, skipped: 'no SENDGRID_API_KEY' });
  }

  const supabase = createAdminClient();
  const counters: Record<EmailType, { sent: number; duplicate: number; failed: number; candidates: number }> = {
    stalled:      { sent: 0, duplicate: 0, failed: 0, candidates: 0 },
    upcoming_14d: { sent: 0, duplicate: 0, failed: 0, candidates: 0 },
    upcoming_7d:  { sent: 0, duplicate: 0, failed: 0, candidates: 0 },
    upcoming_1d:  { sent: 0, duplicate: 0, failed: 0, candidates: 0 },
    post_trip:    { sent: 0, duplicate: 0, failed: 0, candidates: 0 },
  };

  try {
    const jobBatches: EmailJob[][] = await Promise.all([
      findStalledJobs(supabase),
      findUpcomingJobs(supabase, 14, 'upcoming_14d'),
      findUpcomingJobs(supabase, 7, 'upcoming_7d'),
      findUpcomingJobs(supabase, 1, 'upcoming_1d'),
      findPostTripJobs(supabase),
    ]);

    for (const batch of jobBatches) {
      for (const job of batch) {
        counters[job.type].candidates++;
        const result = await processJob(supabase, apiKey, job);
        counters[job.type][result]++;
      }
    }

    return NextResponse.json({ ok: true, counters });
  } catch (err) {
    console.error('[cron/lifecycle-emails] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected error', counters }, { status: 500 });
  }
}
