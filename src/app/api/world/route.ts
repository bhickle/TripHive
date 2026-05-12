import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { destinationToCountry, countryToId, countryToContinent, CONTINENT_TOTALS } from '@/lib/world/countryLookup';
import { geocodeCities } from '@/lib/world/geocodeCity';
import { evaluateBadges, type TripForBadge } from '@/lib/world/badges';

/**
 * GET /api/world
 * Returns the data backing the user's "My World" map page:
 *   - countries[]: { name, id, visitCount }
 *   - cities[]:    { name, lon, lat, country, visitCount }
 *   - continents:  { name → { visited, total } }
 *   - stats:       { totalCities, totalCountries, totalContinents, daysAbroad }
 *   - badges:      computed via evaluateBadges (no persistence yet)
 *   - stamps[]:    one per completed trip, derived from trip data
 *
 * "Visited" = trip status === 'completed' (date-derived, see /api/trips
 * for the canonical status computation). Only the trips the user OWNS
 * are counted — co-organizing or being a member doesn't contribute to
 * "your world" because it's a personal achievement surface.
 */
export async function GET() {
  try {
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // auth failed
    }
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Pull all the user's trips (owned only). Status filter is computed
    // below from the dates — we use the date-derived computation rather
    // than trip.status because the stored column can lag.
    const { data: trips, error: tripsErr } = await supabase
      .from('trips')
      .select('id, destination, start_date, end_date, trip_length, group_size, status, visited_cities, preferences, cover_image')
      .eq('organizer_id', userId);
    if (tripsErr) {
      console.error('[/api/world] trips load error', tripsErr);
      return NextResponse.json({ error: 'Failed to load trips' }, { status: 500 });
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    type TripRow = {
      id: string;
      destination: string;
      start_date: string | null;
      end_date: string | null;
      trip_length: number | null;
      group_size: number | null;
      status: string | null;
      visited_cities: string[] | null;
      preferences: Record<string, unknown> | null;
      cover_image: string | null;
    };
    const computeStatus = (t: TripRow): 'planning' | 'active' | 'completed' => {
      if (!t.start_date) return 'planning';
      const start = new Date(t.start_date + 'T12:00:00');
      if (now < start) return 'planning';
      if (!t.end_date) return 'active';
      const end = new Date(t.end_date + 'T12:00:00');
      return now <= end ? 'active' : 'completed';
    };

    const allTrips = (trips ?? []) as TripRow[];
    const completed = allTrips.filter(t => computeStatus(t) === 'completed');

    // Aggregate countries (with visit counts) from completed trip destinations.
    const countryCounts = new Map<string, number>();
    for (const t of completed) {
      const country = destinationToCountry(t.destination);
      if (country) countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);
    }
    const countries = Array.from(countryCounts.entries()).map(([name, visitCount]) => ({
      name,
      id: countryToId(name),
      visitCount,
    }));

    // Cities per trip — prefer user-tagged visited_cities, fall back to
    // destination's first segment. Track which trip each city came from
    // so we can attach a representative photo (for the Nomad photo-pin
    // gallery) by joining trip_photos.
    const cityVisitCounts = new Map<string, { country: string | null; count: number; tripIds: string[] }>();
    for (const t of completed) {
      const country = destinationToCountry(t.destination);
      const cityNames = (t.visited_cities && t.visited_cities.length > 0)
        ? t.visited_cities
        : [t.destination.split(',')[0]?.trim()].filter((s): s is string => !!s);
      for (const raw of cityNames) {
        const city = raw.trim();
        if (!city) continue;
        const existing = cityVisitCounts.get(city);
        cityVisitCounts.set(city, {
          country: existing?.country ?? country,
          count: (existing?.count ?? 0) + 1,
          tripIds: existing ? [...existing.tripIds, t.id] : [t.id],
        });
      }
    }

    // Resolve every city to lat/lon via the 3-tier geocoder (hardcoded
    // dict → city_geocache table → Google Geocoding API → country
    // centroid). Batched + cached so subsequent loads are near-instant.
    const cityList = Array.from(cityVisitCounts.entries()).map(([name, { country }]) => ({
      city: name,
      country,
    }));
    const coordsMap = await geocodeCities(supabase, cityList);

    // Photo per city — one representative trip_photos.public_url per
    // unique city, drawn from any of the trips that visited it. Picks
    // the most recent uploaded photo so users see fresh imagery.
    const allTripIds = Array.from(new Set(
      Array.from(cityVisitCounts.values()).flatMap(v => v.tripIds),
    ));
    const cityPhotos = new Map<string, string>();
    if (allTripIds.length > 0) {
      const { data: photos } = await supabase
        .from('trip_photos')
        .select('trip_id, public_url, created_at')
        .in('trip_id', allTripIds)
        .not('public_url', 'is', null)
        .order('created_at', { ascending: false });
      if (photos) {
        // Map trip_id → most recent public_url (the order asc=false
        // means the first photo we see per trip is the newest).
        const photoByTrip = new Map<string, string>();
        for (const p of photos) {
          if (p.public_url && !photoByTrip.has(p.trip_id)) {
            photoByTrip.set(p.trip_id, p.public_url);
          }
        }
        // For each city, grab the photo from its first associated trip
        // that has one. Cities visited on multiple trips pick the most
        // recently uploaded photo across those trips.
        for (const [city, { tripIds }] of Array.from(cityVisitCounts.entries())) {
          for (const tid of tripIds) {
            const photo = photoByTrip.get(tid);
            if (photo) { cityPhotos.set(city, photo); break; }
          }
        }
      }
    }

    const cities = Array.from(cityVisitCounts.entries())
      .map(([name, { country, count, tripIds }]) => {
        const coords = coordsMap.get(name);
        if (!coords) return null;
        return {
          name,
          lon: coords.lon,
          lat: coords.lat,
          country,
          visitCount: count,
          // Nomad photo-pin uses this; lower tiers ignore it.
          photoUrl: cityPhotos.get(name) ?? null,
          // Link target — clicking a photo pin opens the most recent
          // trip that visited this city.
          tripId: tripIds[tripIds.length - 1],
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // Continents — count of distinct continents touched.
    const continentsVisited = new Set<string>();
    for (const c of countries) {
      const cont = countryToContinent(c.name);
      if (cont) continentsVisited.add(cont);
    }
    const continents: Record<string, { visited: number; total: number }> = {};
    for (const [contName, total] of Object.entries(CONTINENT_TOTALS)) {
      const visited = countries.filter(c => countryToContinent(c.name) === contName).length;
      continents[contName] = { visited, total };
    }

    // Days abroad — sum of trip_length for completed trips, or date-diff fallback.
    let daysAbroad = 0;
    for (const t of completed) {
      if (t.trip_length && t.trip_length > 0) {
        daysAbroad += t.trip_length;
        continue;
      }
      if (!t.start_date || !t.end_date) continue;
      const s = new Date(t.start_date + 'T12:00:00').getTime();
      const e = new Date(t.end_date + 'T12:00:00').getTime();
      if (!isNaN(s) && !isNaN(e) && e >= s) {
        daysAbroad += Math.ceil((e - s) / (1000 * 60 * 60 * 24));
      }
    }

    // Photo count — for the Photo Journalist badge.
    const { count: photoCountRaw } = await supabase
      .from('trip_photos')
      .select('*', { count: 'exact', head: true })
      .eq('uploaded_by', userId);
    const photoCount = photoCountRaw ?? 0;

    // Badges — computed on the fly. citiesVisited Set uses lowercase city
    // names for de-duplication.
    const citiesVisitedSet = new Set(Array.from(cityVisitCounts.keys()).map(c => c.toLowerCase()));
    const tripsForBadges: TripForBadge[] = completed.map(t => ({
      id: t.id,
      destination: t.destination,
      groupSize: t.group_size ?? 1,
      status: 'completed' as const,
      priorities: Array.isArray(t.preferences?.priorities)
        ? (t.preferences!.priorities as string[])
        : [],
      isOrganizer: true,
    }));
    const badges = evaluateBadges({
      completedTrips: tripsForBadges,
      countriesVisited: new Set(Array.from(countryCounts.keys())),
      continentsVisited,
      citiesVisited: citiesVisitedSet,
      photoCount,
    });

    // ── Persist newly-earned badges + fire notifications ────────────
    // Insert (ON CONFLICT DO NOTHING) every currently-earned badge.
    // Rows that ALREADY existed don't fire notifications; new rows do.
    // Done after the badges array is computed so we capture earned_at
    // and can decorate the response with it.
    const earnedIds = badges.filter(b => b.earned).map(b => b.id);
    const earnedAtMap = new Map<string, string>();
    if (earnedIds.length > 0) {
      try {
        // Fetch existing rows so we know which ones are NEW this request.
        const { data: existing } = await supabase
          .from('user_badges')
          .select('badge_id, earned_at')
          .eq('user_id', userId)
          .in('badge_id', earnedIds);
        const existingIds = new Set((existing ?? []).map(r => r.badge_id));
        for (const row of existing ?? []) {
          earnedAtMap.set(row.badge_id, row.earned_at);
        }

        const newlyEarned = earnedIds.filter(id => !existingIds.has(id));
        if (newlyEarned.length > 0) {
          const now = new Date().toISOString();
          const rows = newlyEarned.map(badge_id => ({
            user_id: userId,
            badge_id,
            earned_at: now,
          }));
          const { error: insertErr } = await supabase
            .from('user_badges')
            .insert(rows);
          if (insertErr) {
            console.warn('[/api/world] user_badges insert failed:', insertErr);
          } else {
            for (const id of newlyEarned) earnedAtMap.set(id, now);
            // Fire one notification per newly-earned badge. Best-effort —
            // failure here doesn't block the response.
            const notifRows = newlyEarned.map(id => {
              const def = badges.find(b => b.id === id);
              return {
                user_id: userId,
                type: 'badge_earned',
                trip_id: null,
                trip_name: null,
                inviter_name: null,
                message: def ? `You earned ${def.title} ${def.emoji}` : `New badge earned`,
              };
            });
            await supabase.from('notifications').insert(notifRows);
          }
        }
      } catch (err) {
        console.warn('[/api/world] badge persistence error:', err);
      }
    }
    // Decorate badges with earnedAt for client display.
    const badgesWithTimestamps = badges.map(b => ({
      ...b,
      earnedAt: b.earned ? (earnedAtMap.get(b.id) ?? null) : null,
    }));

    // Stamps — one per completed trip. Vibe label + emoji derived from
    // the dominant priority.
    const STAMP_EMOJI: Record<string, { emoji: string; label: string; color: string }> = {
      food:        { emoji: '🥖', label: 'Foodie',     color: 'rose' },
      nightlife:   { emoji: '🍸', label: 'Nightlife',  color: 'violet' },
      history:     { emoji: '🏛️', label: 'History',    color: 'amber' },
      culture:     { emoji: '🎭', label: 'Culture',    color: 'amber' },
      beach:       { emoji: '🏖️', label: 'Beach',      color: 'emerald' },
      nature:      { emoji: '🌿', label: 'Nature',     color: 'emerald' },
      adventure:   { emoji: '⚡', label: 'Adventure',  color: 'orange' },
      sports:      { emoji: '⛹️', label: 'Sports',     color: 'orange' },
      wellness:    { emoji: '💆', label: 'Wellness',   color: 'sky' },
      shopping:    { emoji: '🛍️', label: 'Shopping',   color: 'pink' },
      photography: { emoji: '📷', label: 'Photo',      color: 'slate' },
      themepark:   { emoji: '🎢', label: 'Theme Park', color: 'rose' },
      family:      { emoji: '👨‍👩‍👧', label: 'Family',     color: 'emerald' },
    };
    const stamps = completed.map(t => {
      const priorities = Array.isArray(t.preferences?.priorities)
        ? (t.preferences!.priorities as string[]).map(p => p.toLowerCase())
        : [];
      const topPriority = priorities.find(p => STAMP_EMOJI[p]) ?? 'culture';
      const meta = STAMP_EMOJI[topPriority] ?? STAMP_EMOJI.culture;
      return {
        tripId: t.id,
        destination: t.destination.split(',')[0]?.trim() ?? t.destination,
        date: t.start_date ?? null,
        emoji: meta.emoji,
        vibe: meta.label,
        color: meta.color,
      };
    });

    return NextResponse.json({
      stats: {
        totalCities: cityVisitCounts.size,
        totalCountries: countryCounts.size,
        totalContinents: continentsVisited.size,
        daysAbroad,
      },
      countries,
      cities,
      continents,
      badges: badgesWithTimestamps,
      stamps,
    });
  } catch (err) {
    console.error('[/api/world] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
