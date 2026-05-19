import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/lib/supabase/database.types';
import { TIER_LIMITS, type SubscriptionTier } from '@/lib/types';
import { sendPartnerAddedEmail } from '@/lib/email/sendPartnerAddedEmail';

type TripInsert = Database['public']['Tables']['trips']['Insert'];
type ItineraryInsert = Database['public']['Tables']['itineraries']['Insert'];

/**
 * POST /api/trips/save
 * Persists a newly generated trip + itinerary to Supabase.
 * Returns the Supabase trip ID so the client can navigate to /trip/[id]/itinerary.
 *
 * Uses the admin (service role) client for DB writes to avoid RLS/cookie issues.
 * Uses the cookie-based client only to identify the current user.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tripMeta, itinerary, skeleton } = body as {
      tripMeta: {
        destination: string;
        title: string;
        startDate: string;
        endDate: string;
        groupType: string;
        groupSize: number;
        tripLength?: number;
        budget: number;
        budgetBreakdown: Record<string, number>;
        bookedHotels: Json[];
        bookedFlight: Json | null;
        preferences: { [key: string]: Json | undefined };
        practicalNotes?: Json;
        departureInfo?: Json;
        hotelSuggestions?: Json;
        isCruise?: boolean;
        cruiseLine?: string;
      };
      itinerary: Json[] | null;
      /** skeleton=true: create trip + empty itinerary row immediately, before generation starts.
       *  Used by the live-build flow so the itinerary page has a real trip ID to work with. */
      skeleton?: boolean;
    };

    // itinerary may be null for draft saves (Option B: invite-first flow)
    if (!tripMeta?.destination) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const isSkeleton = skeleton === true;
    const isDraft = !isSkeleton && (!itinerary || itinerary.length === 0);

    // Identify the current user. Trips are owner-scoped; we never allow
    // anonymous trip writes through this route (admin client below
    // bypasses RLS, so we MUST gate at the route level — without this
    // check, anon bots could poison the trips/itineraries tables).
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // fall through — userId stays null, then we 401 below
    }
    if (!userId) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'You must be signed in to save a trip.' },
        { status: 401 },
      );
    }

    // All DB writes use the admin client (bypasses RLS, no cookie dependency)
    const supabase = createAdminClient();

    // ── Tier caps (server-side enforcement) ───────────────────────────────────
    // Trip Builder enforces maxBookedHotels client-side, but the save route
    // was trusting the client. Re-check here so a crafted POST can't
    // persist 10 hotels on a free trip. We trim the array silently rather
    // than 400 — the user's other choices (destination, dates, etc.)
    // shouldn't be discarded over a hotel-cap overage.
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .maybeSingle();
    const callerTier = (callerProfile?.subscription_tier as SubscriptionTier | undefined) ?? 'free';
    const hotelCap = TIER_LIMITS[callerTier].maxBookedHotels;
    if (Array.isArray(tripMeta.bookedHotels) && tripMeta.bookedHotels.length > hotelCap) {
      console.warn(
        `[trips/save] trimming bookedHotels from ${tripMeta.bookedHotels.length} to ${hotelCap} for ${callerTier} user ${userId}`,
      );
      tripMeta.bookedHotels = tripMeta.bookedHotels.slice(0, hotelCap);
    }

    // ── 1. Insert the trip row ────────────────────────────────────────────────
    const tripInsert: TripInsert = {
      organizer_id: userId,
      // title is NOT NULL — fall back to 'My Trip' if AI didn't return one
      title: tripMeta.title || 'My Trip',
      destination: tripMeta.destination,
      start_date: tripMeta.startDate || null,
      end_date: tripMeta.endDate || null,
      trip_length: (isDraft || isSkeleton) ? (tripMeta.tripLength ?? 0) : (itinerary?.length ?? 0),
      group_size: tripMeta.groupSize ?? 1,
      group_type: tripMeta.groupType ?? null,
      budget_total: tripMeta.budget ?? 0,
      budget_breakdown: tripMeta.budgetBreakdown ?? {},
      booked_hotels: tripMeta.bookedHotels ?? [],
      booked_flight: tripMeta.bookedFlight ?? null,
      preferences: tripMeta.preferences ?? {},
      status: isDraft ? 'draft' : (isSkeleton ? 'planning' : 'planning'),
      // Stamp the generation time when an itinerary is included (not for skeleton or draft)
      itinerary_generated_at: (!isDraft && !isSkeleton) ? new Date().toISOString() : null,
    };

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert(tripInsert)
      .select('id')
      .single();

    if (tripError || !trip) {
      console.error('Trip insert error:', JSON.stringify(tripError));
      return NextResponse.json({ error: 'Failed to save trip', detail: tripError?.message }, { status: 500 });
    }

    // ── 2. Insert the itinerary row ───────────────────────────────────────────
    // For full saves: insert complete days. For skeleton saves: insert empty days
    // so the PATCH route can update them incrementally during live-build generation.
    // For draft saves (invite-first flow): skip the itinerary row entirely.
    if (!isDraft) {
      const itinInsert: ItineraryInsert = {
        trip_id: trip.id,
        days: isSkeleton ? [] : itinerary,
        // original_days: AI baseline snapshot. Only set on full saves
        // (not skeleton) — skeleton rows don't yet have a real itinerary,
        // so writing an empty array as "original" would make Revert wipe
        // the eventual filled-in days. The first non-skeleton PATCH that
        // populates days will also populate original_days (see PATCH
        // handler in /api/trips/[id]).
        original_days: isSkeleton ? null : itinerary,
        meta: {
          destination: tripMeta.destination,
          title: tripMeta.title,
          startDate: tripMeta.startDate,
          endDate: tripMeta.endDate,
          budget: tripMeta.budget,
          budgetBreakdown: tripMeta.budgetBreakdown,
          bookedHotels: tripMeta.bookedHotels,
          bookedFlight: tripMeta.bookedFlight,
          groupType: tripMeta.groupType,
          groupSize: tripMeta.groupSize,
          preferences: tripMeta.preferences ?? {},
          practicalNotes: tripMeta.practicalNotes ?? null,
          departureInfo: tripMeta.departureInfo ?? null,
          hotelSuggestions: tripMeta.hotelSuggestions ?? null,
          isCruise: tripMeta.isCruise ?? false,
          cruiseLine: tripMeta.cruiseLine ?? '',
        },
        source: 'ai',
      };

      const { error: itinError } = await supabase
        .from('itineraries')
        .insert(itinInsert);

      if (itinError) {
        console.error('Itinerary insert error:', JSON.stringify(itinError));
        // Clean up the trip row if itinerary failed
        await supabase.from('trips').delete().eq('id', trip.id);
        return NextResponse.json({ error: 'Failed to save itinerary' }, { status: 500 });
      }
    }

    // ── 3. Auto-add the user's default travel partner as a member ─────────
    // When the user has set a default partner in Settings, every new trip
    // they create auto-shares with that person — they're added as a
    // 'member' immediately so chat/votes/photos light up without an
    // invite round-trip. New trips only (this fires on insert); past
    // trips aren't backfilled. Failures are logged but don't fail the
    // trip save — the partner can always be invited manually from the
    // Group page.
    if (userId && !isDraft) {
      try {
        const { data: organizerProfile } = await supabase
          .from('profiles')
          .select('default_partner_id, name, email')
          .eq('id', userId)
          .maybeSingle();
        const partnerId = organizerProfile?.default_partner_id ?? null;
        if (partnerId) {
          const { data: partnerProfile } = await supabase
            .from('profiles')
            .select('id, name, email')
            .eq('id', partnerId)
            .maybeSingle();
          if (partnerProfile) {
            const { error: memberErr } = await supabase
              .from('trip_members')
              .insert({
                trip_id: trip.id,
                user_id: partnerProfile.id,
                name: partnerProfile.name ?? partnerProfile.email?.split('@')[0] ?? 'Partner',
                email: partnerProfile.email,
                role: 'member',
              });
            if (memberErr) {
              console.warn('[trips/save] default partner auto-add failed:', memberErr.message);
            } else {
              // Notification: without this, the partner is silently added to
              // the trip and has no breadcrumb that a new trip even exists —
              // the bell stays empty for this trip and they click an older
              // unread notification thinking it's the new one (Brandon +
              // Luke saw this 2026-05-12). 'partner_added' falls through to
              // the default /trip/[id]/itinerary route, which is the right
              // landing for someone who's already a member.
              const organizerName =
                organizerProfile?.name
                ?? organizerProfile?.email?.split('@')[0]
                ?? 'A friend';
              const { error: notifErr } = await supabase
                .from('notifications')
                .insert({
                  user_id: partnerProfile.id,
                  type: 'partner_added',
                  trip_id: trip.id,
                  trip_name: tripMeta.title || tripMeta.destination,
                  inviter_name: organizerName,
                  message: 'Open the trip to add your preferences.',
                });
              if (notifErr) {
                console.warn('[trips/save] partner notification insert failed:', notifErr.message);
              }

              // Email the partner too. The in-app notification alone is
              // brittle — if they don't open TripCoord soon, the trip is
              // invisible to them and the organizer assumes the auto-add
              // didn't work. Fire-and-forget; never fail the trip save.
              sendPartnerAddedEmail({
                toEmail: partnerProfile.email ?? '',
                toName: partnerProfile.name ?? null,
                organizerName,
                tripName: tripMeta.title || tripMeta.destination || 'a trip',
                tripId: trip.id,
              }).catch((emailErr) => {
                console.warn('[trips/save] partner email send failed:', emailErr);
              });
            }
          }
        }
      } catch (partnerErr) {
        // Never let the partner auto-add break the trip save itself —
        // log and move on; the user can invite manually.
        console.warn('[trips/save] default partner lookup failed:', partnerErr);
      }
    }

    return NextResponse.json({ tripId: trip.id, isDraft });
  } catch (err) {
    console.error('Save trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
