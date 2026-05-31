'use client';

import { useEffect, useState } from 'react';

// Shape returned by /api/unsplash/photo. Mirrors TripCard's DynamicPhoto.
export interface UnsplashCover {
  url: string;
  photographer: string | null;
  photographerUrl: string | null;
  photoUrl: string | null;
  downloadLocation: string | null;
}

// Module-level cache so multiple cards rendering the same destination hit the
// API at most once per page load. The API route itself caches at the Next.js
// fetch layer for ~7 days. Survives only this React tree.
const cache = new Map<string, UnsplashCover | null>();

// UTM tag required on the attribution links back to Unsplash / the
// photographer profile (Unsplash production-approval reviewers check this).
export const UNSPLASH_UTM = '?utm_source=tripcoord&utm_medium=referral';

// Fires the Unsplash download-tracking call, gated by sessionStorage so each
// photo is tracked at most once per browser session (over-tracking is harmless;
// under-tracking would fail Unsplash review).
function maybeTrackDownload(photo: UnsplashCover | null | undefined) {
  if (!photo?.downloadLocation || typeof window === 'undefined') return;
  const key = `unsplash_tracked_${photo.downloadLocation}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* private mode — fall through and fire the track call anyway */
  }
  fetch('/api/unsplash/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloadLocation: photo.downloadLocation }),
  }).catch(() => { /* silent */ });
}

/**
 * Returns a dynamic Unsplash cover photo for `destination`, fetched once per
 * destination per page load. Pass `enabled: false` to skip the fetch entirely
 * (e.g. when the row already has a saved cover image).
 *
 * Unlike TripCard's inline logic, this hook does NOT persist the resolved URL
 * to any trip row — it's meant for surfaces showing trips the viewer doesn't
 * own (Founder Picks, Community rail), where a PATCH would be rejected by RLS.
 */
export function useUnsplashCover(
  destination: string | null | undefined,
  enabled: boolean,
): UnsplashCover | null {
  const [photo, setPhoto] = useState<UnsplashCover | null>(
    destination ? cache.get(destination) ?? null : null,
  );

  useEffect(() => {
    if (!enabled || !destination) return;
    if (cache.has(destination)) {
      const cached = cache.get(destination) ?? null;
      setPhoto(cached);
      maybeTrackDownload(cached);
      return;
    }
    let aborted = false;
    fetch(`/api/unsplash/photo?q=${encodeURIComponent(destination)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        const resolved: UnsplashCover | null = data?.photo?.url ? data.photo : null;
        cache.set(destination, resolved);
        if (!aborted) {
          setPhoto(resolved);
          maybeTrackDownload(resolved);
        }
      })
      .catch(() => { /* silent — gradient placeholder stays */ });
    return () => { aborted = true; };
  }, [destination, enabled]);

  return photo;
}
