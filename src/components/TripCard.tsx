'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, Users, ArrowRight, Trash2, X, CopyPlus } from 'lucide-react';
import { Trip } from '@/lib/types';

// Photo metadata returned by /api/unsplash/photo. Photographer + links are
// surfaced in the bottom-right attribution chip when present (required for
// Unsplash production approval).
interface DynamicPhoto {
  url: string;
  photographer: string | null;
  photographerUrl: string | null;
  photoUrl: string | null;
  downloadLocation: string | null;
}

// Module-level cache so multiple TripCards rendering the same destination
// hit the API at most once per page load. Survives only this React tree —
// the API route itself caches at the Next.js fetch layer for 7 days.
const dynamicPhotoCache = new Map<string, DynamicPhoto | null>();

// Unsplash requires a UTM-tagged link back to their site / photographer
// profile. Production-approval reviewers actually check this.
const UTM = '?utm_source=tripcoord&utm_medium=referral';

// Fires the Unsplash download-tracking call for this photo, gated by
// sessionStorage so each photo is tracked at most once per browser
// session even across multiple cards or revisits to the same page.
function maybeTrackDownload(photo: DynamicPhoto | null | undefined) {
  if (!photo?.downloadLocation) return;
  if (typeof window === 'undefined') return;
  const key = `unsplash_tracked_${photo.downloadLocation}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // sessionStorage can throw in private mode; fall through and just
    // fire the track call — over-tracking is harmless, under-tracking
    // would fail Unsplash review.
  }
  fetch('/api/unsplash/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
  }).catch(() => { /* silent */ });
}

// Persists the resolved Unsplash URL to the trip's cover_image column so
// every subsequent load is instant — no gradient flash, no API roundtrip.
// Gated by sessionStorage to fire at most once per trip per browser
// session (PATCH is idempotent but spamming the endpoint is wasteful).
// Fails silently for non-organizer members (the API enforces RBAC) and
// for mock trips (their IDs aren't valid UUIDs in Supabase).
function maybePersistCoverImage(tripId: string, photo: DynamicPhoto | null) {
  if (!photo?.url) return;
  if (typeof window === 'undefined') return;
  // Mock trip IDs are short slugs ('iceland-trip', etc.) — skip them.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(tripId)) return;
  const key = `trip_cover_persisted_${tripId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* sessionStorage unavailable — fall through and PATCH anyway */
  }
  fetch(`/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripPatch: {
        cover_image: photo.url,
        cover_image_meta: {
          photographer: photo.photographer,
          photographerUrl: photo.photographerUrl,
          photoUrl: photo.photoUrl,
          downloadLocation: photo.downloadLocation,
        },
      },
    }),
  }).catch(() => { /* silent — gradient just keeps loading next time */ });
}

interface TripCardProps {
  trip: Trip;
  onCardClick?: (tripId: string) => void;
  onDelete?: (tripId: string) => void;
}

const statusConfig = {
  planning: { label: 'Planning', className: 'bg-sky-800/90 text-white' },
  active: { label: '● Active', className: 'bg-emerald-500/90 text-white' },
  completed: { label: 'Completed', className: 'bg-black/50 text-white' },
};

export const TripCard: React.FC<TripCardProps> = ({ trip, onCardClick, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Photo resolution order:
  //   1. Trip's saved coverImage. If coverImageMeta has a photographer it's
  //      a previously-persisted Unsplash photo — render with attribution.
  //      If meta is null, treat as user-uploaded (no chip needed).
  //   2. Dynamic Unsplash search via /api/unsplash/photo (first-time load).
  //   3. Gradient placeholder while the fetch is in flight, or permanently
  //      if the search has no results / the API is rate-limited / no key.
  const userPhoto = trip.coverImage ?? null;
  const persistedMeta = trip.coverImageMeta ?? null;
  const cachedDynamic = dynamicPhotoCache.get(trip.destination);
  const [dynamicPhoto, setDynamicPhoto] = useState<DynamicPhoto | null>(cachedDynamic ?? null);

  useEffect(() => {
    if (userPhoto) {
      // Persisted Unsplash photo: still need to track downloads each session
      // (Unsplash counts every "use" — the sessionStorage gate dedupes).
      if (persistedMeta?.downloadLocation) {
        maybeTrackDownload({
          url: userPhoto,
          photographer: persistedMeta.photographer ?? null,
          photographerUrl: persistedMeta.photographerUrl ?? null,
          photoUrl: persistedMeta.photoUrl ?? null,
          downloadLocation: persistedMeta.downloadLocation ?? null,
        });
      }
      return;
    }
    if (dynamicPhotoCache.has(trip.destination)) {
      // Already fetched this session — but we may still need to fire the
      // download-tracking call if this is a fresh component mount
      // (sessionStorage keeps the gate consistent).
      maybeTrackDownload(dynamicPhotoCache.get(trip.destination));
      return;
    }
    let aborted = false;
    fetch(`/api/unsplash/photo?q=${encodeURIComponent(trip.destination)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const photo: DynamicPhoto | null = data?.photo?.url ? data.photo : null;
        dynamicPhotoCache.set(trip.destination, photo);
        if (!aborted) {
          setDynamicPhoto(photo);
          maybeTrackDownload(photo);
          maybePersistCoverImage(trip.id, photo);
        }
      })
      .catch(() => { /* silent — placeholder stays */ });
    return () => { aborted = true; };
  }, [trip.destination, trip.id, userPhoto, persistedMeta]);

  const photoSrc = userPhoto ?? dynamicPhoto?.url ?? null;
  // Resolve the attribution source. Persisted Unsplash photos carry their
  // metadata in coverImageMeta; fresh API photos use the dynamic state.
  const attribution = persistedMeta?.photographer
    ? {
        photographer: persistedMeta.photographer,
        photographerUrl: persistedMeta.photographerUrl ?? null,
        photoUrl: persistedMeta.photoUrl ?? null,
      }
    : !userPhoto && dynamicPhoto?.photographer
      ? {
          photographer: dynamicPhoto.photographer,
          photographerUrl: dynamicPhoto.photographerUrl,
          photoUrl: dynamicPhoto.photoUrl,
        }
      : null;
  const showAttribution = !!attribution?.photographer && !!attribution.photographerUrl;

  // Noon-pad so YYYY-MM-DD strings parse as LOCAL noon, not UTC midnight.
  // Without this, "2026-05-06" parses as UTC midnight → renders as May 5 in
  // any timezone west of UTC (the Day 1=May 6 / card="May 5" mismatch from
  // QA 5/10 was this bug — the DB was correct, the display was off-by-one).
  // hasDates: trips can be created (or forked) without dates picked yet —
  // we render a friendlier "Pick your dates" prompt in that case instead
  // of the JS-default "Invalid Date – Invalid Date".
  const hasDates = !!trip.startDate && !!trip.endDate;
  const startDate = hasDates ? new Date(trip.startDate + 'T12:00:00') : null;
  const endDate = hasDates ? new Date(trip.endDate + 'T12:00:00') : null;
  // Prefer the builder-selected trip length over date-diff.
  // For flexible-date trips the stored dates span the availability window
  // (e.g. "anytime in June"), making date-diff much larger than the actual trip.
  const dateDiff = startDate && endDate
    ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const daysCount = (trip.tripLength && trip.tripLength > 0) ? trip.tripLength : dateDiff;
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const status = statusConfig[trip.status];

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      if (res.ok) onDelete?.(trip.id);
    } catch { /* silently fail */ } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <Link
      href={`/trip/${trip.id}/itinerary`}
      onClick={() => onCardClick?.(trip.id)}
      className="group block bg-white rounded-2xl overflow-hidden border border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
    >
      {/* Image — tall, editorial */}
      <div className="relative h-52 overflow-hidden bg-zinc-200">
        {photoSrc ? (
          <Image
            src={photoSrc}
            alt={trip.destination}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          // Loading state and no-result fallback: brand-color gradient
          // (ocean → earth) instead of an unattributed Unsplash photo.
          // Keeps the layout intact while the dynamic search resolves.
          <div className="absolute inset-0 bg-gradient-to-br from-ocean-700 via-ocean-800 to-earth-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Unsplash attribution — required by API guidelines.
            Renders for both freshly-fetched and persisted Unsplash photos;
            clicks open in a new tab and stop propagation so the parent
            Link doesn't navigate. */}
        {showAttribution && attribution && (
          <div className="absolute bottom-2 right-3 text-[10px] text-white/70 z-10">
            Photo by{' '}
            <a
              href={`${attribution.photographerUrl}${UTM}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline-offset-2 hover:underline hover:text-white transition-colors"
            >
              {attribution.photographer}
            </a>
            {' '}on{' '}
            <a
              href={`${attribution.photoUrl ?? 'https://unsplash.com'}${UTM}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline-offset-2 hover:underline hover:text-white transition-colors"
            >
              Unsplash
            </a>
          </div>
        )}

        {/* Status badge — Cormorant italic */}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full font-script italic text-sm backdrop-blur-sm ${status.className}`}>
            {status.label}
          </span>
        </div>

        {/* Duration badge + duplicate + delete button */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-black/40 backdrop-blur-sm text-white">
            {daysCount}d
          </span>
          {/* "Plan a similar trip" — opens Trip Builder with this trip's
               shape (destination, priorities, group, budget) pre-filled
               but dates/bookings empty. Hides while delete-confirm is
               active so the cluster doesn't get cluttered. */}
          {!confirmDelete && (
            <Link
              href={`/trip/new?from=${trip.id}`}
              onClick={e => e.stopPropagation()}
              title="Plan a similar trip"
              aria-label="Plan a similar trip"
              className="flex items-center px-1.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:bg-sky-700/80 hover:text-white transition-all md:opacity-0 md:group-hover:opacity-100"
            >
              <CopyPlus className="w-3 h-3" />
            </Link>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              title={confirmDelete ? 'Click again to confirm delete' : 'Delete trip'}
              aria-label={confirmDelete ? 'Confirm delete' : 'Delete trip'}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm transition-all ${
                confirmDelete
                  ? 'bg-rose-600 text-white'
                  // Always visible on touch (no hover); fades on desktop unless hovered.
                  : 'bg-black/40 text-white/70 hover:bg-rose-600/80 hover:text-white md:opacity-0 md:group-hover:opacity-100'
              }`}
            >
              {confirmDelete ? (
                deleting ? '…' : <><Trash2 className="w-3 h-3" /> Sure?</>
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </button>
          )}
          {confirmDelete && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(false); }}
              className="flex items-center px-1.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Destination name overlaid — Cormorant italic */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="font-script italic text-xl text-white/90 leading-tight drop-shadow-sm">{trip.destination}</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="font-script italic text-lg text-zinc-900 leading-snug mb-3 group-hover:text-sky-700 transition-colors">
          {trip.title}
        </h3>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Calendar className="w-3 h-3" />
            {startDate && endDate ? (
              <span>{formatDate(startDate)} – {formatDate(endDate)}</span>
            ) : (
              <span className="italic text-sky-700">Dates not set yet — tap to pick</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Users className="w-3 h-3" />
            <span>{trip.memberCount + trip.guestCount} {(trip.memberCount + trip.guestCount) === 1 ? 'traveler' : 'travelers'}</span>
          </div>
        </div>

        {/* Hover CTA */}
        <div className="mt-3 pt-3 border-t border-zinc-50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-xs font-medium text-sky-700">View itinerary</span>
          <ArrowRight className="w-3.5 h-3.5 text-sky-700" />
        </div>
      </div>
    </Link>
  );
};
