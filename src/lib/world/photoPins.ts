/**
 * Photo-pin selection for the /world map.
 *
 * Brandon's intent (locked 2026-05-19):
 *   - Adaptive cap based on trip count so a 1-trip map feels lived-in
 *     and a 10-trip map doesn't swarm.
 *   - Per-city spread — distribute a trip's photo budget across its
 *     visited_cities so pins fan out geographically instead of
 *     clustering on one destination point.
 *   - Cover-image fallback for cities with no uploaded photos.
 *   - Travel Pro-tier only (gated at the UI layer; this module is tier-agnostic).
 *
 * Algorithm summary:
 *   For each completed trip:
 *     1. Prefer photos whose day_number maps to a city via the trip's
 *        itinerary (most accurate city assignment).
 *     2. Round-robin remaining photos across the trip's geocodable
 *        cities (unused-first, so cities that already have a photo
 *        don't get duplicates until every city does).
 *     3. If the trip ran out of photos before hitting its budget,
 *        fall back to cover_image, one per still-unused city.
 *     4. If no photos AND no cover image, emit plain markers (one per
 *        city, up to budget) so the trip still shows on the map.
 */

import type { ItineraryDay } from '@/lib/types';

export interface PhotoPin {
  /** City name — used in tooltips and as click context. */
  city: string;
  lat: number;
  lon: number;
  /** Public URL to a photo or cover image; null = render generic marker. */
  photoUrl: string | null;
  tripId: string;
  tripTitle: string;
  /** True when photoUrl is the trip cover image rather than an uploaded
   *  photo. UI can dim or label these differently. */
  isCoverFallback: boolean;
  /** Stable React key — unique across pins even when multiple pins share
   *  the same city (which happens for single-city trips with many photos). */
  key: string;
}

/** Adaptive budget so the map scales with travel volume. */
export function getPhotoBudget(totalCompletedTrips: number): number {
  if (totalCompletedTrips <= 1) return 8;
  if (totalCompletedTrips <= 3) return 5;
  if (totalCompletedTrips <= 9) return 3;
  return 2;
}

export interface TripForPins {
  id: string;
  title: string;
  destination: string;
  visitedCities: string[];
  coverImage: string | null;
  itineraryDays: ItineraryDay[];
}

export interface PhotoForPins {
  tripId: string;
  publicUrl: string;
  dayNumber: number | null;
  takenAt: string | null;
  createdAt: string | null;
}

export function selectPhotoPins(args: {
  trips: TripForPins[];
  photos: PhotoForPins[];
  coordsByCity: Map<string, { lat: number; lon: number }>;
}): PhotoPin[] {
  const budget = getPhotoBudget(args.trips.length);
  const pins: PhotoPin[] = [];

  // Group photos by tripId, sorted most-recent first so the algorithm
  // always picks the newest images.
  const photosByTrip = new Map<string, PhotoForPins[]>();
  for (const p of args.photos) {
    if (!p.publicUrl) continue;
    const arr = photosByTrip.get(p.tripId) ?? [];
    arr.push(p);
    photosByTrip.set(p.tripId, arr);
  }
  for (const arr of Array.from(photosByTrip.values())) {
    arr.sort((a, b) => {
      const ta = a.takenAt ?? a.createdAt ?? '';
      const tb = b.takenAt ?? b.createdAt ?? '';
      return tb.localeCompare(ta);
    });
  }

  for (const trip of args.trips) {
    const geocodable = trip.visitedCities.filter(c => args.coordsByCity.has(c));
    if (geocodable.length === 0) continue;

    // day_number → city (only includes cities we can geocode, so any
    // resolved match guarantees a valid pin location).
    const dayToCity = new Map<number, string>();
    for (const d of trip.itineraryDays) {
      if (d.city && args.coordsByCity.has(d.city)) {
        dayToCity.set(d.day, d.city);
      }
    }

    const tripPhotos = photosByTrip.get(trip.id) ?? [];

    // ── Pass 1: city-tagged photos (best signal) ──────────────────────────
    // Each known city gets at most one photo in this pass, prioritising
    // recency. Single-city trips will fall through to pass 2 for
    // additional photos on the same city.
    const chosen: Array<{ photoUrl: string; city: string; isCover: boolean }> = [];
    const cityHasPhoto = new Set<string>();
    for (const photo of tripPhotos) {
      if (chosen.length >= budget) break;
      const city = photo.dayNumber != null ? dayToCity.get(photo.dayNumber) : undefined;
      if (city && !cityHasPhoto.has(city)) {
        chosen.push({ photoUrl: photo.publicUrl, city, isCover: false });
        cityHasPhoto.add(city);
      }
    }

    // ── Pass 2: untagged or surplus photos ────────────────────────────────
    // Round-robin across cities, starting with cities that don't yet have
    // a photo (so we spread before we duplicate). After every city has
    // one, additional photos go on the same cities in rotation.
    const unusedCities = geocodable.filter(c => !cityHasPhoto.has(c));
    const rotation = unusedCities.length > 0
      ? [...unusedCities, ...geocodable]
      : geocodable;
    let ri = 0;
    const alreadyPlacedUrls = new Set(chosen.map(c => c.photoUrl));
    for (const photo of tripPhotos) {
      if (chosen.length >= budget) break;
      if (alreadyPlacedUrls.has(photo.publicUrl)) continue;
      const city = rotation[ri % rotation.length];
      ri++;
      chosen.push({ photoUrl: photo.publicUrl, city, isCover: false });
      alreadyPlacedUrls.add(photo.publicUrl);
    }

    // ── Pass 3: cover-image fallback ──────────────────────────────────────
    // One per still-unused city. Caps before reaching budget so a 1-city
    // trip with no photos doesn't stamp the cover image 8 times.
    if (chosen.length < budget && trip.coverImage) {
      const stillUnused = geocodable.filter(
        c => !chosen.some(ch => ch.city === c),
      );
      for (const city of stillUnused) {
        if (chosen.length >= budget) break;
        chosen.push({ photoUrl: trip.coverImage, city, isCover: true });
      }
    }

    // ── Pass 4: no photos AND no cover — plain markers ────────────────────
    // Ensures the trip still shows on the map. One marker per city, up to
    // budget.
    if (chosen.length === 0) {
      const slice = geocodable.slice(0, budget);
      for (const city of slice) {
        chosen.push({ photoUrl: '', city, isCover: false });
      }
    }

    // ── Emit pins ─────────────────────────────────────────────────────────
    for (let i = 0; i < chosen.length; i++) {
      const c = chosen[i];
      const coords = args.coordsByCity.get(c.city);
      if (!coords) continue;
      pins.push({
        city: c.city,
        lat: coords.lat,
        lon: coords.lon,
        photoUrl: c.photoUrl || null,
        tripId: trip.id,
        tripTitle: trip.title,
        isCoverFallback: c.isCover,
        key: `${trip.id}:${i}:${c.city}`,
      });
    }
  }

  return pins;
}

/**
 * Tiny deterministic jitter so multiple pins on the same city don't
 * stack invisibly on the map. Spreads pins on a small ring around the
 * base coordinates. Same trip+city always produces the same offset so
 * the jitter is stable across renders (important for React keys).
 *
 * Radius is ~16km wherever the pin is — a Singapore pin at the equator
 * no longer drifts into Malaysia (the old 0.6° lat/lon flat offset was
 * ~66km at the equator, enough to cross national borders). Longitude
 * delta is scaled by cos(lat) so 1° lon shrinks at high latitudes —
 * keeps the visual ring round on the rendered map instead of an
 * elongated oval near the poles.
 */
const JITTER_RADIUS_DEG = 0.15; // ~16km at the equator

export function jitterPinCoords(pin: PhotoPin, index: number, total: number): { lat: number; lon: number } {
  if (total <= 1) return { lat: pin.lat, lon: pin.lon };
  const angle = (index / total) * Math.PI * 2;
  const latOffset = Math.sin(angle) * JITTER_RADIUS_DEG;
  // 1 degree of longitude is shorter at higher latitudes. Dividing the
  // lon offset by cos(lat) keeps the ring visually consistent in km
  // whether the pin is in Quito or Reykjavík.
  const lonScale = Math.max(0.2, Math.cos((pin.lat * Math.PI) / 180));
  const lonOffset = (Math.cos(angle) * JITTER_RADIUS_DEG) / lonScale;
  return {
    lat: pin.lat + latOffset,
    lon: pin.lon + lonOffset,
  };
}
