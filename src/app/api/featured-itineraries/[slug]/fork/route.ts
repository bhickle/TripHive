import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Activity, ItineraryDay } from '@/lib/types';
import type { Json } from '@/lib/supabase/database.types';

/**
 * POST /api/featured-itineraries/[slug]/fork
 *
 * Body (all optional): { startDate?: string (YYYY-MM-DD), endDate?: string }
 *
 * "Use as starting point" for a curated featured itinerary. Copies the
 * pre-built (cached) featured days into a brand-new trip owned by the caller —
 * NO AI generation, so it costs zero credits. This is the free path offered to
 * every tier on Discover; the AI "Personalize" path is gated separately on the
 * client.
 *
 * Featured itineraries are stored in a simpler schema than trip itineraries:
 *   featured day      = { day, title, activities: [{ time, title, cost_usd,
 *                         description, affiliate_url, affiliate_label }] }
 *   trip ItineraryDay = { day, date, theme, tracks: { shared, track_a, track_b } }
 * so we transform here rather than raw-copying. Activities all land on the
 * shared track (featured itineraries have no split tracks).
 */

interface FeaturedActivity {
  time?: string;
  title?: string;
  cost_usd?: number;
  description?: string;
  affiliate_url?: string;
  affiliate_label?: string;
}
interface FeaturedDay {
  day?: number;
  title?: string;
  activities?: FeaturedActivity[];
}

/** Transform the cached featured days into the app's ItineraryDay shape. */
function toItineraryDays(featuredDays: FeaturedDay[], startDate: string | null): ItineraryDay[] {
  return featuredDays.map((fd, idx) => {
    const dayNum = typeof fd.day === 'number' ? fd.day : idx + 1;

    // Derive a real date only when the user gave a start date in the modal;
    // otherwise leave blank (the itinerary page tolerates empty dates and the
    // user sets them later).
    let date = '';
    if (startDate) {
      const d = new Date(`${startDate}T00:00:00`);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() + (dayNum - 1));
        date = d.toISOString().slice(0, 10);
      }
    }

    const shared: Activity[] = (fd.activities ?? []).map((a, i) => ({
      id: `feat-${dayNum}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      dayNumber: dayNum,
      timeSlot: a.time ?? 'morning',
      title: a.title ?? '',
      name: a.title ?? '',
      description: a.description ?? '',
      costEstimate: typeof a.cost_usd === 'number' ? a.cost_usd : 0,
      bookingUrl: a.affiliate_url || undefined,
      confidence: 1,
      verified: false,
      track: 'shared' as const,
    }));

    return {
      day: dayNum,
      date,
      theme: fd.title ?? `Day ${dayNum}`,
      tracks: { shared, track_a: [], track_b: [] },
    };
  });
}

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Optional dates from the fork modal.
    let bodyDates: { startDate?: string | null; endDate?: string | null } = {};
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === 'object') bodyDates = parsed;
    } catch { /* no body — continue with nulls */ }
    const startDate = typeof bodyDates.startDate === 'string' ? bodyDates.startDate : null;
    const endDate = typeof bodyDates.endDate === 'string' ? bodyDates.endDate : null;

    const supabase = createAdminClient();

    // Fetch the cached featured itinerary (published only).
    const { data: featured, error: featErr } = await supabase
      .from('featured_itineraries')
      .select('slug, destination, country, title, hero_image, duration_days, vibes, avg_cost_per_day, itinerary, published')
      .eq('slug', params.slug)
      .eq('published', true)
      .single();

    if (featErr || !featured) {
      return NextResponse.json({ error: 'Featured itinerary not found' }, { status: 404 });
    }

    const featuredDays = ((featured.itinerary as { days?: FeaturedDay[] } | null)?.days) ?? [];
    if (featuredDays.length === 0) {
      return NextResponse.json({ error: 'This itinerary has no days to copy' }, { status: 422 });
    }
    const days = toItineraryDays(featuredDays, startDate);

    const destination = featured.country
      ? `${featured.destination}, ${featured.country}`
      : featured.destination;
    // Bind trip_length to the days we actually copied (not the catalog's
    // duration_days column), so the trip can't claim a length its itinerary
    // doesn't have if the two ever drift.
    const tripLength = days.length;

    // Create the new trip (organizer = caller). No fork_source_id — that column
    // references trips, and the source here is a featured itinerary, not a trip.
    const { data: newTrip, error: insertErr } = await supabase
      .from('trips')
      .insert({
        organizer_id: user.id,
        title: featured.title || `${featured.destination} Trip`,
        destination,
        start_date: startDate,
        end_date: endDate,
        trip_length: tripLength,
        group_size: 2,
        status: 'planning',
        cover_image: featured.hero_image ?? null,
        // Preferences are built fresh from the featured catalog (vibes only),
        // not copied from any source trip blob — already effectively an
        // allow-list, so nothing private to strip here.
        preferences: { vibes: featured.vibes ?? [] },
        is_public_template: false,
        is_private: false, // a fork shouldn't be private by default

      })
      .select('id')
      .single();

    if (insertErr || !newTrip) {
      console.error('featured fork insert trip error:', insertErr);
      return NextResponse.json({ error: 'Failed to create trip' }, { status: 500 });
    }

    // Insert the itinerary (transformed days). Roll back the trip row if this
    // fails so the user doesn't land on an empty skeleton.
    const { error: itinErr } = await supabase
      .from('itineraries')
      .insert({
        trip_id: newTrip.id,
        days: days as unknown as Json,
        original_days: days as unknown as Json,
        meta: {
          destination,
          title: featured.title,
          startDate,
          endDate,
          groupSize: 2,
          preferences: { vibes: featured.vibes ?? [] },
          bookedHotels: [],
          bookedFlight: null,
        } as unknown as Json,
        source: 'ai',
      });
    if (itinErr) {
      console.error('featured fork itinerary insert failed:', itinErr);
      const { error: rollbackErr } = await supabase.from('trips').delete().eq('id', newTrip.id);
      if (rollbackErr) console.error('featured fork rollback also failed (orphan trip):', newTrip.id, rollbackErr);
      return NextResponse.json({ error: 'Failed to copy itinerary' }, { status: 500 });
    }

    // Caller becomes the organizer member so member-scoped checks pass.
    const { error: memberErr } = await supabase
      .from('trip_members')
      .insert({ trip_id: newTrip.id, user_id: user.id, role: 'organizer' });
    if (memberErr) {
      console.error('featured fork trip_members insert failed:', memberErr);
      const { error: rollbackErr } = await supabase.from('trips').delete().eq('id', newTrip.id);
      if (rollbackErr) console.error('featured fork rollback also failed (orphan trip):', newTrip.id, rollbackErr);
      return NextResponse.json({ error: 'Failed to set up trip membership' }, { status: 500 });
    }

    return NextResponse.json({ tripId: newTrip.id });
  } catch (err) {
    console.error('featured fork POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
