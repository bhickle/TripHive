'use client';

import React from 'react';
import { X } from 'lucide-react';

interface Props {
  tripId: string;
  /** Show the banner unless this returns false (already tagged or dismissed). */
  visible: boolean;
  onTagClick: () => void;
  onDismiss: () => void;
}

const DISMISS_KEY_PREFIX = 'tc_banner_dismissed_visited_cities_';

/**
 * Returns true when the banner should show for a given trip:
 *   - trip is completed (caller's responsibility — pass `visible` accordingly)
 *   - visited_cities is empty (caller's responsibility)
 *   - user hasn't dismissed this trip's banner before
 */
export function shouldShowTagCitiesBanner(tripId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return !window.localStorage.getItem(DISMISS_KEY_PREFIX + tripId);
  } catch {
    return true;
  }
}

export function rememberTagCitiesBannerDismissed(tripId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY_PREFIX + tripId, '1');
  } catch {
    /* localStorage unavailable — banner just reappears on next load */
  }
}

/**
 * Casual prompt rendered above completed trip cards: "Trip done — log the
 * cities you hit." Click → opens the chip-input modal. Dismiss is per-trip
 * and persists in localStorage (acceptable v1 trade-off; a server-side flag
 * could be added later if banner returns become a problem).
 */
export function TagCitiesBanner({ visible, onTagClick, onDismiss }: Props) {
  if (!visible) return null;
  return (
    <div className="bg-gradient-to-r from-sky-50 to-sky-100 border border-sky-200 rounded-2xl px-4 py-3 mb-3 flex items-center gap-3">
      <span className="text-base" aria-hidden="true">✦</span>
      <p className="flex-1 text-sm text-sky-900 leading-snug">
        <span className="font-semibold">Trip done — log the cities you hit.</span>
        <span className="hidden sm:inline text-sky-700"> Unlock the map slide in your Trip Story.</span>
      </p>
      <button
        onClick={onTagClick}
        className="text-sky-800 hover:text-sky-900 text-sm font-semibold whitespace-nowrap"
      >
        Tag cities →
      </button>
      <button
        onClick={onDismiss}
        className="text-sky-700 hover:text-sky-900 p-1 leading-none"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
