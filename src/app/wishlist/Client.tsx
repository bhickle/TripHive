'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { wishlistItems as mockWishlistItems } from '@/data/mock';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { WishlistItem, WishlistLink } from '@/lib/types';
import { parseGoogleMapsUrl, isGoogleMapsUrl } from '@/lib/google/parseMapsUrl';
import {
  Heart, Plus, Sparkles, Calendar, DollarSign, Search,
  MapPin, X, ArrowRight, Check, ChevronRight, Lock,
} from 'lucide-react';
import Image from 'next/image';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeModal } from '@/components/UpgradeModal';
import { WishlistLinksSection } from '@/components/WishlistLinksSection';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = string; // 'all' or a priority tag id
// SortType removed — single-option dropdown was dropped with the budget display.
type TravelVibe =
  | 'nature' | 'food' | 'nightlife' | 'history' | 'sports' | 'photography'
  | 'wellness' | 'shopping' | 'adventure' | 'culture' | 'beach' | 'themepark' | 'family';

interface TripLengthOption {
  label: string;
  days: number;
  sublabel: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Priority tags — keep in sync with trip/new/page.tsx priorityOptions
const PRIORITY_TAGS: { id: string; label: string; emoji: string }[] = [
  { id: 'nature',        label: 'Nature',        emoji: '🌿' },
  { id: 'food',          label: 'Food',          emoji: '🍽️' },
  { id: 'nightlife',     label: 'Nightlife',     emoji: '🎶' },
  { id: 'history',       label: 'History',       emoji: '📜' },
  { id: 'sports',        label: 'Sports',        emoji: '⛹️' },
  { id: 'photography',   label: 'Photography',   emoji: '📷' },
  { id: 'wellness',      label: 'Wellness',      emoji: '💆' },
  { id: 'shopping',      label: 'Shopping',      emoji: '🛍️' },
  { id: 'adventure',     label: 'Adventure',     emoji: '⚡' },
  { id: 'culture',       label: 'Culture',       emoji: '🏛️' },
  { id: 'beach',         label: 'Beach',         emoji: '🏖️' },
  { id: 'themepark',     label: 'Theme Parks',   emoji: '🎢' },
  { id: 'family',        label: 'Family/Kids',   emoji: '👨‍👩‍👧' },
  // 'budget' + 'accessibility' chips removed from priority filters — both
  // overlap with dedicated wizard fields. Existing wishlist items tagged with
  // either keep the tag in their data; the filter row no longer offers them.
];

// VIBE_OPTIONS mirrors Trip Builder's priorityOptions (13 entries) so the
// "Top Priorities" surface is consistent across the app: Trip Builder,
// Travel Persona (Settings), Wishlist filters, and this Add-Destination
// vibe picker. Order + ids + labels match exactly.
const VIBE_OPTIONS: { id: TravelVibe; label: string; emoji: string }[] = [
  { id: 'nature',      label: 'Nature',        emoji: '🌿' },
  { id: 'food',        label: 'Food',          emoji: '🍽️' },
  { id: 'nightlife',   label: 'Nightlife',     emoji: '🎶' },
  { id: 'history',     label: 'History',       emoji: '📜' },
  { id: 'sports',      label: 'Sports',        emoji: '⛹️' },
  { id: 'photography', label: 'Photography',   emoji: '📷' },
  { id: 'wellness',    label: 'Wellness',      emoji: '💆' },
  { id: 'shopping',    label: 'Shopping',      emoji: '🛍️' },
  { id: 'adventure',   label: 'Adventure',     emoji: '⚡' },
  { id: 'culture',     label: 'Culture',       emoji: '🏛️' },
  { id: 'beach',       label: 'Beach',         emoji: '🏖️' },
  { id: 'themepark',   label: 'Theme Parks',   emoji: '🎢' },
  { id: 'family',      label: 'Family/Kids',   emoji: '👨‍👩‍👧' },
];

const TRIP_LENGTH_OPTIONS: TripLengthOption[] = [
  { label: 'Weekend',   days: 3,  sublabel: '2–3 days' },
  { label: 'Week',      days: 7,  sublabel: '5–7 days' },
  { label: '10 Days',   days: 10, sublabel: '9–11 days' },
  { label: 'Two Weeks', days: 14, sublabel: '12–15 days' },
];

// Unsplash cover photos keyed by destination keyword
const DESTINATION_COVERS: Record<string, string> = {
  kyoto:       'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800',
  japan:       'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
  tokyo:       'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
  bali:        'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800',
  paris:       'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
  france:      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
  barcelona:   'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800',
  spain:       'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=800',
  italy:       'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=800',
  rome:        'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=800',
  iceland:     'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800',
  reykjavik:   'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800',
  morocco:     'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800',
  marrakech:   'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800',
  portugal:    'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
  lisbon:      'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
  porto:       'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
  thailand:    'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
  bangkok:     'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
  mexico:      'https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800',
  peru:        'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800',
  patagonia:   'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800',
  argentina:   'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800',
  greece:      'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800',
  santorini:   'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800',
  switzerland: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800',
  alps:        'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800',
  vietnam:     'https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800',
  colombia:    'https://images.unsplash.com/photo-1504700610630-ac6aba3536d3?w=800',
  default:     'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800',
};

function getCoverImage(destination: string): string {
  const key = destination.toLowerCase();
  for (const [word, url] of Object.entries(DESTINATION_COVERS)) {
    if (word !== 'default' && key.includes(word)) return url;
  }
  return DESTINATION_COVERS.default;
}

// Mock highlights for graceful fallback when no API key
const VIBE_HIGHLIGHTS: Record<TravelVibe, string[]> = {
  adventure:   ['Hiking top trails', 'Rock climbing & rappelling', 'White-water rafting', 'Paragliding over the valley'],
  culture:     ['UNESCO heritage site tour', 'Local cooking class', 'Museum & gallery day', 'Evening folklore performance'],
  food:        ['Street food market crawl', 'Chef\'s table dinner', 'Local winery tour', 'Morning fish market visit'],
  photography: ['Golden hour viewpoints', 'Architecture walking tour', 'Wildlife spotting & shooting', 'Sunrise summit hike'],
  nature:      ['National park day hike', 'Wildlife sanctuary visit', 'Scenic coastal walk', 'Stargazing at night'],
  wellness:    ['Rooftop infinity pools', 'Sunrise yoga sessions', 'Thermal spa day', 'Slow morning at a local café'],
  nightlife:   ['Rooftop bar sunset drinks', 'Underground club night', 'Live music venue crawl', 'Late-night food market'],
  sports:      ['Surf lesson at dawn', 'Cycling countryside routes', 'Guided kayaking tour', 'Bouldering at the crag'],
  history:     ['Guided old town walk', 'Ancient ruins day trip', 'Local history museum', 'Evening folklore performance'],
  shopping:    ['Local market browsing', 'Artisan craft district', 'Design district stroll', 'Night market haul'],
  beach:       ['Sunrise beach walk', 'Snorkel & swim cove day', 'Beach club lounging', 'Coastal cliff hike'],
  themepark:   ['Park-opening early entry', 'Headliner ride strategy', 'Evening parade & fireworks', 'Day-pass at the second park'],
  family:      ['Kid-friendly hands-on museum', 'Half-day excursion + rest', 'Beach or pool afternoon', 'Family-style dinner spot'],
};

// ─── Social URL destination extractor ────────────────────────────────────────

function extractDestinationFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`);
    const hostname = url.hostname.replace('www.', '');
    const parts = url.pathname.split('/').filter(Boolean);

    // Pinterest board: pinterest.com/user/board-name
    if (hostname === 'pinterest.com' || hostname.endsWith('.pinterest.com')) {
      if (parts.length >= 2 && parts[1] !== 'pin') {
        return parts[1].replace(/-/g, ' ').replace(/_/g, ' ');
      }
    }

    // Instagram explore tags: instagram.com/explore/tags/kyoto
    if (hostname === 'instagram.com' || hostname === 'instagr.am') {
      if (parts[0] === 'explore' && parts[1] === 'tags' && parts[2]) {
        return decodeURIComponent(parts[2]).replace(/-/g, ' ');
      }
      // Instagram location pages: instagram.com/explore/locations/id/place-name
      if (parts[0] === 'explore' && parts[1] === 'locations' && parts[3]) {
        return decodeURIComponent(parts[3]).replace(/-/g, ' ');
      }
    }

    // TikTok hashtag: tiktok.com/tag/travel-bali
    if (hostname === 'tiktok.com' || hostname === 'vm.tiktok.com') {
      if (parts[0] === 'tag' && parts[1]) {
        return parts[1].replace(/-/g, ' ');
      }
    }

    // Generic: look for meaningful path segments (not IDs, not short tokens)
    const meaningful = parts.filter(
      (s) => s.length > 3 && !/^\d+$/.test(s) && !s.startsWith('@') && !['video', 'p', 'reel', 'stories', 'pin'].includes(s)
    );
    if (meaningful.length) {
      return decodeURIComponent(meaningful[meaningful.length - 1]).replace(/[-_]/g, ' ');
    }
  } catch { /* invalid URL */ }
  return null;
}

/** Async wrapper that handles Google Maps URLs first (with server-side
 *  resolution for the maps.app.goo.gl short form), then falls through
 *  to the sync extractor for Pinterest / IG / TikTok / generic.
 *
 *  Returns the extracted place / destination name, or null when the
 *  URL didn't match any extractor. Network failures during short-URL
 *  resolution silently fall through to the sync extractor — the user
 *  still gets the URL saved on the wishlist card. */
async function extractDestinationFromUrlAsync(rawUrl: string): Promise<string | null> {
  if (isGoogleMapsUrl(rawUrl)) {
    let parsed = parseGoogleMapsUrl(rawUrl);
    if (parsed?.shortUrl) {
      try {
        const res = await fetch('/api/google/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: rawUrl }),
        });
        if (res.ok) {
          const { resolvedUrl } = (await res.json()) as { resolvedUrl: string };
          parsed = parseGoogleMapsUrl(resolvedUrl);
        }
      } catch {
        // Network failed — fall through to the sync extractor below.
      }
    }
    if (parsed?.name) return parsed.name;
  }
  return extractDestinationFromUrl(rawUrl);
}

// ─── Add Destination Modal ────────────────────────────────────────────────────

function AddDestinationModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (item: WishlistItem) => void;
}) {
  const [destination, setDestination] = useState('');
  const [vibes, setVibes] = useState<TravelVibe[]>(['adventure']);
  const [tripDays, setTripDays] = useState<number>(7);
  const [socialUrl, setSocialUrl] = useState('');
  const [socialExtractError, setSocialExtractError] = useState(false);
  const destInputRef = useRef<HTMLInputElement>(null);

  // Places autocomplete intentionally removed (2026-05-09): "On My Radar" is a
  // saved-link surface, not a planning surface. The Places API was billing us
  // every keystroke for what amounts to a name/context label. The destination
  // field is now plain text — users name the wishlist however they want
  // ("That cliffside Greek place"), and the URL field above is the primary
  // input that drives the card.

  // Save with static vibe highlights — no AI call. Users add destinations
  // as visual reminders / saved links; the wishlist isn't a planning surface.
  // If the user pasted a source URL, save it as the first WishlistLink on
  // the new item so its saved-links section is populated without a
  // follow-up edit.
  const handleSave = useCallback(() => {
    if (!destination.trim()) return;
    const estimatedCost = Math.round((600 + tripDays * 350) / 50) * 50;
    const city = destination.split(',')[0].trim();
    const country = destination.includes(',') ? destination.split(',').slice(-1)[0].trim() : '';
    const trimmedUrl = socialUrl.trim();
    const initialLinks: WishlistLink[] = [];
    if (trimmedUrl && /^https?:\/\//i.test(trimmedUrl)) {
      let siteName: string | null = null;
      try {
        siteName = new URL(trimmedUrl).hostname.replace(/^www\./, '');
      } catch { /* malformed — leave siteName null */ }
      initialLinks.push({
        url: trimmedUrl,
        title: null,
        description: null,
        image: null,
        siteName,
        fetchedAt: new Date().toISOString(),
      });
    }
    onSave({
      id: `wish_${Date.now()}`,
      destination: city,
      country,
      coverImage: getCoverImage(destination),
      bestSeason: 'Year-round',
      estimatedCost,
      tags: vibes.map(v => v.charAt(0).toUpperCase() + v.slice(1)),
      highlights: VIBE_HIGHLIGHTS[vibes[0]],
      tripDays,
      links: initialLinks,
    });
    onClose();
  }, [destination, vibes, tripDays, socialUrl, onSave, onClose]);

  // Modal only mounts while open, so the hook is always active here.
  useEscapeKey(onClose, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add a destination">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-sky-600" />
            <h2 className="font-script italic font-semibold text-slate-900">Add a Destination</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
            {/* PRIMARY INPUT — saved link.
                Most "On My Radar" entries start as a URL the user
                stumbled across (Pinterest pin, TikTok, IG reel, blog
                post). Putting the URL first matches that flow: paste,
                hit Import, and we'll pre-fill the destination label
                from the URL when we can. The Where-to field below is
                secondary and free-text only — see the comment on the
                Places hook removal above for why we dropped Places. */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Saw it somewhere? Paste the link
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="Pinterest, TikTok, Instagram, Reddit, blog URL…"
                  value={socialUrl}
                  onChange={(e) => { setSocialUrl(e.target.value); setSocialExtractError(false); }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const extracted = await extractDestinationFromUrlAsync(socialUrl);
                      if (extracted) {
                        setDestination(extracted);
                        setSocialExtractError(false);
                        destInputRef.current?.focus();
                      } else {
                        setSocialExtractError(true);
                        setTimeout(() => destInputRef.current?.focus(), 50);
                      }
                    }
                  }}
                  autoFocus
                  className={`flex-1 min-w-0 px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent ${
                    socialExtractError
                      ? 'border-rose-300 focus:ring-rose-400'
                      : 'border-slate-200 focus:ring-sky-600'
                  }`}
                />
                <button
                  type="button"
                  onClick={async () => {
                    const extracted = await extractDestinationFromUrlAsync(socialUrl);
                    if (extracted) {
                      setDestination(extracted);
                      setSocialExtractError(false);
                      destInputRef.current?.focus();
                    } else {
                      setSocialExtractError(true);
                      setTimeout(() => destInputRef.current?.focus(), 50);
                    }
                  }}
                  disabled={!socialUrl.trim()}
                  className="px-3 py-2.5 bg-sky-800 text-white text-xs font-semibold rounded-full hover:bg-sky-900 disabled:opacity-40 transition-colors flex-shrink-0"
                  title="Try to extract a destination name from the URL"
                >
                  Import
                </button>
              </div>
              {socialExtractError ? (
                <p className="text-xs text-rose-500">
                  Couldn&apos;t detect a place from that link — that&apos;s fine, just type a name below. The URL is still saved on the card.
                </p>
              ) : (
                <p className="text-xs text-slate-400">We&apos;ll save the link on this destination. Some URLs auto-fill the name below.</p>
              )}
            </div>

            {/* Secondary field — name/label only.
                Plain text, no API calls, no autocomplete. Users name
                this however helps them remember it ("That hidden
                Greek beach", "Cliffside ryokan"). The wishlist isn't
                a planning surface, so we don't need a validated place. */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Give it a name <span className="text-slate-400 font-normal">(or destination)</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  ref={destInputRef}
                  type="text"
                  placeholder="e.g. Santorini, that ryokan in Hakone, Tulum…"
                  value={destination}
                  onChange={(e) => {
                    setDestination(e.target.value);
                    setSocialExtractError(false);
                  }}
                  className="w-full pl-9 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent"
                />
                {destination && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-600" />}
              </div>
            </div>

            {/* Trip length */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">How long?</label>
              <div className="grid grid-cols-4 gap-2">
                {TRIP_LENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setTripDays(opt.days)}
                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl border-2 text-center transition-all duration-150 ${
                      tripDays === opt.days
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <span className="text-sm font-semibold leading-tight">{opt.label}</span>
                    <span className={`text-xs mt-0.5 ${tripDays === opt.days ? 'text-sky-500' : 'text-slate-400'}`}>
                      {opt.sublabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vibe selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">What&apos;s the vibe?</label>
                <span className="text-xs text-slate-400">{vibes.length}/8 selected</span>
              </div>
              {/* Pill text was overflowing the rounded boxes on phone widths
                  because grid-cols-3 squeezed each cell to ~90px while labels
                  like "Photography" need ~110px. Two-column layout on mobile
                  + min-w-0 + truncate so labels stay inside their pill.
                  Cap matches Travel Persona's 8 — mismatch with other "Top
                  Priorities" pickers reported on 2026-05-09. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VIBE_OPTIONS.map((v) => {
                  const selected = vibes.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVibes(prev =>
                          prev.includes(v.id)
                            ? prev.length > 1 ? prev.filter(x => x !== v.id) : prev // keep at least 1
                            : prev.length < 8 ? [...prev, v.id] : prev              // cap at 8
                        );
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-150 min-w-0 ${
                        selected
                          ? 'border-sky-600 bg-sky-50 text-sky-700'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <span className="flex-shrink-0 text-base leading-none">{v.emoji}</span>
                      <span className="truncate">{v.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={!destination.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-sky-700 to-sky-600 text-white font-semibold shadow hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Heart className="w-4 h-4" />
              Save to Wishlist
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-center text-xs text-slate-400">
              You can paste TripAdvisor / blog / Reddit links to each destination after saving.
            </p>
        </div>
      </div>
    </div>
  );
}

// ─── Tag colour helper ────────────────────────────────────────────────────────

// Category chips render as a uniform neutral zinc pill — the label alone
// distinguishes categories. The earlier per-category rainbow (blue/purple/
// pink/teal/orange/green/rose) pulled in off-palette accent families that the
// brand ruling reserves (amber = paid, rose = errors, violet = AI Pick).
// Kept as a function (rather than inlining the class) so a future tiered scheme
// can slot back in without touching call sites. See the 2026-05-31 UI QA pass
// and mockups/wishlist-category-chips.html.
function getTagColor(_tag: string) {
  return 'bg-zinc-100 text-zinc-700';
}

// Build the "Plan this trip" link for a wishlist item. Carries everything the
// Trip Builder can pre-fill from the saved item: destination (country joined
// only when present — avoids the "Costa Rica," trailing comma), trip length,
// the saved priorities (tags), the best season, and any saved reference link
// URLs (which the builder fetches and feeds to the AI as inspiration).
function buildPlanTripHref(item: WishlistItem): string {
  const destination = [item.destination, item.country].filter(Boolean).join(', ');
  const params = new URLSearchParams({ destination });
  if (item.tripDays) params.set('days', String(item.tripDays));
  const priorities = (item.tags ?? [])
    .map((t) => t.toLowerCase().replace(/\s+/g, ''))
    .filter(Boolean);
  if (priorities.length) params.set('priorities', priorities.join(','));
  if (item.bestSeason) params.set('season', item.bestSeason);
  (item.links ?? []).slice(0, 3).forEach((l) => {
    if (l.url) params.append('ref', l.url);
  });
  return `/trip/new?${params.toString()}`;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WishlistPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();

  useEffect(() => {
    if (!currentUser.isLoading && !currentUser.id && !currentUser.isDemo) {
      router.replace('/auth/login');
    }
  }, [currentUser.isLoading, currentUser.id, currentUser.isDemo, router]);

  const { hasWishlist, getUpgradePrompt } = useEntitlements();

  const [filterType, setFilterType] = useState<FilterType>('all');
  // sortType state removed alongside the cost-sort dropdown — items are
  // always sorted alphabetically now.
  const [allItems, setAllItems] = useState<WishlistItem[]>(currentUser.isDemo ? mockWishlistItems : []);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(currentUser.isDemo ? mockWishlistItems.map(i => i.id) : []));
  const [showModal, setShowModal] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  // ─── Remove-from-radar 5-second undo ─────────────────────────────────────────
  // Un-hearting drops the card immediately but holds the server DELETE for 5s,
  // showing an Undo toast (matches the itinerary's delete-activity pattern) so a
  // stray click isn't an instant, unrecoverable deletion.
  const [undoItem, setUndoItem] = useState<WishlistItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The id whose DELETE is still pending (held in the 5s window). Kept in a ref
  // so we can flush it on unmount — leaving the page mid-window commits the
  // delete rather than silently resurrecting the item on the next visit.
  const pendingDeleteRef = useRef<string | null>(null);

  const commitRadarDelete = useCallback((id: string) => {
    pendingDeleteRef.current = null;
    if (currentUser.isDemo) return;
    // Best-effort: the card is already gone and the toast dismissed. If this
    // fails server-side the item simply reappears on the next load.
    fetch(`/api/wishlist?id=${id}`, { method: 'DELETE' }).catch(() => {});
  }, [currentUser.isDemo]);

  const removeFromRadar = useCallback((id: string) => {
    const removedItem = allItems.find(i => i.id === id) ?? null;
    // Optimistic: un-fill the heart and drop the card. The displayed grid
    // is filtered by savedIds, so removing from savedIds alone hides the
    // card visually.
    //
    // In demo mode we deliberately keep the row in allItems: commitRadar-
    // Delete is a no-op for demo (no DB write), so once the 5s window ends
    // the item exists in memory only as long as we don't drop it. Keeping
    // it in allItems means re-hearting from /discover later in the same
    // session can repopulate the card here. Non-demo still filters the
    // allItems row so a successful server DELETE doesn't leave a ghost.
    setSavedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    if (!currentUser.isDemo) {
      setAllItems(prev => prev.filter(i => i.id !== id));
    }

    // If a previous removal is still pending (rapid successive un-hearts),
    // commit it now before starting the new window.
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (pendingDeleteRef.current && pendingDeleteRef.current !== id) {
      commitRadarDelete(pendingDeleteRef.current);
    }
    pendingDeleteRef.current = id;
    setUndoItem(removedItem);

    undoTimerRef.current = setTimeout(() => {
      commitRadarDelete(id);
      setUndoItem(null);
      undoTimerRef.current = null;
    }, 5000);
  }, [allItems, commitRadarDelete, currentUser.isDemo]);

  const undoRemoveFromRadar = useCallback(() => {
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
    pendingDeleteRef.current = null;
    const item = undoItem;
    setUndoItem(null);
    if (!item) return;
    setAllItems(prev => prev.some(i => i.id === item.id) ? prev : [item, ...prev]);
    setSavedIds(prev => new Set([...Array.from(prev), item.id]));
  }, [undoItem]);

  // Flush any pending delete on unmount so navigating away mid-window still
  // commits the removal (commitRadarDelete is stable, so this only fires on
  // real unmount).
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (pendingDeleteRef.current) commitRadarDelete(pendingDeleteRef.current);
    };
  }, [commitRadarDelete]);

  // Load real wishlist from API for authenticated (non-demo) users
  useEffect(() => {
    if (currentUser.isLoading || currentUser.isDemo) return;
    setWishlistLoading(true);
    fetch('/api/wishlist')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items }) => {
        // Inbound row shape from /api/wishlist (already camelCased by the route).
        type WishlistRow = {
          id: string;
          destination: string;
          country?: string;
          coverImage?: string;
          bestSeason?: string;
          estimatedCost?: number;
          tags?: string[];
          notes?: string;
          links?: WishlistLink[];
        };
        const rows: WishlistRow[] = items ?? [];
        const mapped: WishlistItem[] = rows.map(i => ({
          id: i.id,
          destination: i.destination,
          country: i.country ?? '',
          coverImage: i.coverImage ?? getCoverImage(i.destination),
          bestSeason: i.bestSeason ?? 'Year-round',
          estimatedCost: i.estimatedCost ?? 0,
          tags: i.tags ?? [],
          highlights: [],
          notes: i.notes,
          links: i.links ?? [],
        }));
        setAllItems(mapped);
        setSavedIds(new Set(mapped.map(i => i.id)));
      })
      .catch(() => {})
      .finally(() => setWishlistLoading(false));
  }, [currentUser.isLoading, currentUser.isDemo]);

  const handleSaveNew = async (item: WishlistItem) => {
    if (currentUser.isDemo) {
      setAllItems(prev => [...prev, item]);
      setSavedIds(prev => new Set([...Array.from(prev), item.id]));
      return;
    }
    // POST to API for real users
    try {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: item.destination,
          country: item.country,
          coverImage: item.coverImage,
          bestSeason: item.bestSeason,
          estimatedCost: item.estimatedCost,
          tags: item.tags,
          // Without these the pasted source link + notes from the Add
          // Destination modal were dropped on create (the route supports both).
          links: item.links ?? [],
          notes: item.notes,
        }),
      });
      if (res.ok) {
        const { item: saved } = await res.json();
        const mapped: WishlistItem = {
          id: saved.id,
          destination: saved.destination,
          country: saved.country ?? '',
          coverImage: saved.coverImage ?? item.coverImage,
          bestSeason: saved.bestSeason ?? item.bestSeason,
          estimatedCost: saved.estimatedCost ?? item.estimatedCost,
          tags: saved.tags ?? item.tags,
          highlights: item.highlights,
          tripDays: item.tripDays,
          links: saved.links ?? [],
          notes: saved.notes,
        };
        setAllItems(prev => [...prev, mapped]);
        setSavedIds(prev => new Set([...Array.from(prev), mapped.id]));
      }
    } catch { /* silently ignore */ }
  };

  const getFilteredAndSorted = () => {
    let filtered = Array.from(savedIds)
      .map(id => allItems.find(w => w.id === id))
      .filter(Boolean) as WishlistItem[];

    if (filterType !== 'all') {
      filtered = filtered.filter(item =>
        Array.isArray(item.tags) &&
        item.tags.some((t: string) => t.toLowerCase() === filterType.toLowerCase())
      );
    }

    // Only sort-by-name remains — price sort dropped along with the
    // budget display.
    filtered.sort((a, b) => a.destination.localeCompare(b.destination));

    return filtered;
  };

  const filteredItems = getFilteredAndSorted();

  const toggleWishlist = (id: string) => {
    const isRemoving = savedIds.has(id);
    if (isRemoving) {
      // Un-hearting on On My Radar means "take this off my radar". Route through
      // the deferred removal so it gets a 5-second undo window; the server
      // DELETE is held until the window closes (see removeFromRadar).
      removeFromRadar(id);
      return;
    }
    // Re-save path (heart toggled back on).
    setSavedIds(prev => new Set([...Array.from(prev), id]));
    if (currentUser.isDemo) return;
    {
      // Re-save path — previously local-only, so un-saving then
      // re-saving would persist the un-save but not the re-save, and
      // the heart vanished on refresh. Now we POST the same payload
      // /api/wishlist's Add Destination flow uses, scraped from the
      // existing item state.
      const item = allItems.find(i => i.id === id);
      if (!item) return;
      fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: item.destination,
          country: item.country,
          coverImage: item.coverImage,
          bestSeason: item.bestSeason,
          estimatedCost: item.estimatedCost,
          tags: item.tags,
          notes: item.notes,
          links: item.links ?? [],
        }),
      })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`wishlist POST ${r.status}`)))
        .then(data => {
          if (data?.item?.id) {
            // The new server row has a fresh id. Replace the local
            // entry so subsequent DELETEs target the right row.
            setAllItems(prev => prev.map(i => i.id === id
              ? { ...i, id: data.item.id }
              : i,
            ));
            setSavedIds(prev => {
              const next = new Set(prev);
              next.delete(id);
              next.add(data.item.id);
              return next;
            });
          }
        })
        .catch(() => {
          // Roll back so the heart reflects the un-saved state again.
          setSavedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    }
  };

  // ── Wishlist is a paid feature — show upgrade wall for free users ─────────
  if (!hasWishlist) {
    const prompt = getUpgradePrompt('feature_locked');
    return (
      <div className="flex h-dvh bg-parchment">
        <Sidebar activePage="wishlist" user={currentUser} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm w-full text-center">
            {/* Blurred preview cards */}
            <div className="relative mb-8">
              <div className="grid grid-cols-2 gap-3 opacity-30 blur-sm pointer-events-none select-none">
                {mockWishlistItems.slice(0, 4).map(item => (
                  <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="w-full h-20 bg-gradient-to-br from-sky-100 to-emerald-100 rounded-xl mb-3" />
                    <p className="text-xs font-semibold text-zinc-700 truncate">{item.destination}</p>
                    <p className="text-[10px] text-zinc-400">{item.country}</p>
                  </div>
                ))}
              </div>
              {/* Lock overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-800 to-emerald-700 flex items-center justify-center shadow-xl">
                  <Lock className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-2">{prompt.headline}</h2>
            <p className="text-zinc-500 text-sm leading-relaxed mb-6">{prompt.body}</p>

            <div className="flex flex-col gap-2">
              <Link
                href="/pricing"
                className="w-full flex items-center justify-center gap-2 py-3 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-full transition-all text-sm"
              >
                <Sparkles className="w-4 h-4" />
                {prompt.ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-parchment">
      <Sidebar activePage="wishlist" user={currentUser} />

      {showModal && (
        <AddDestinationModal
          onClose={() => setShowModal(false)}
          onSave={handleSaveNew}
        />
      )}

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">Your Collection</p>
            <div className="flex items-center justify-between">
              <h1 className="text-4xl font-script italic font-semibold text-zinc-900">On My Radar</h1>
              <div className="bg-sky-800 text-white font-semibold px-4 py-2 rounded-full text-sm">
                {savedIds.size} saved
              </div>
            </div>
          </div>

          {/* Filter / Sort Bar */}
          <div className="mb-8">
            <div className="flex gap-2 flex-wrap items-center mb-3">
              <button
                onClick={() => setFilterType('all')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  filterType === 'all'
                    ? 'bg-sky-800 text-white'
                    : 'bg-white border border-zinc-200 text-zinc-700 hover:border-sky-400'
                }`}
              >
                All
              </button>
              {PRIORITY_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => setFilterType(filterType === tag.id ? 'all' : tag.id)}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition-all flex items-center gap-1.5 ${
                    filterType === tag.id
                      ? 'bg-sky-800 text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:border-sky-400'
                  }`}
                >
                  <span>{tag.emoji}</span>
                  {tag.label}
                </button>
              ))}
            </div>
            {/* Sort dropdown removed — was a single-option select once
                the Price sorts were dropped with the budget display.
                Items always sort alphabetically by destination. */}
          </div>

          {/* Wishlist Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {/* Add Destination Card */}
            <button
              onClick={() => setShowModal(true)}
              className="group rounded-2xl border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50 hover:bg-sky-100 transition-all p-8 flex flex-col items-center justify-center min-h-80 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full bg-sky-100 group-hover:bg-sky-200 flex items-center justify-center mb-3 transition-colors">
                <Plus className="w-7 h-7 text-sky-700 group-hover:text-sky-800 transition-colors" />
              </div>
              <p className="font-semibold text-sky-900">Add Destination</p>
              <p className="text-sm text-sky-700 mt-1 text-center">Search anywhere and save for later</p>
            </button>

            {/* Loading skeletons — show while initial wishlist fetch is in
                flight so the grid doesn't read as "you have no destinations"
                during the brief loading window after auth resolves. */}
            {wishlistLoading && filteredItems.length === 0 && Array.from({ length: 3 }).map((_, i) => (
              <div key={`skel-${i}`} className="rounded-2xl overflow-hidden bg-white border border-zinc-100 shadow-sm animate-pulse">
                <div className="h-52 bg-zinc-200" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-zinc-200 rounded w-3/4" />
                  <div className="h-3 bg-zinc-200 rounded w-1/2" />
                  <div className="h-3 bg-zinc-200 rounded w-2/3" />
                </div>
              </div>
            ))}

            {/* Wishlist Cards */}
            {filteredItems.map((item) => (
              <div key={item.id} className="group rounded-2xl overflow-hidden bg-white border border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                {/* Cover */}
                <div className="relative h-52 overflow-hidden bg-zinc-100">
                  <Image
                    src={item.coverImage}
                    alt={item.destination}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* z-10 keeps the heart above the gradient overlay below —
                      without it the inset-0 overlay (later in the DOM) paints
                      on top and swallows the click, so the heart couldn't be
                      un-clicked to remove the item. */}
                  <button
                    onClick={() => toggleWishlist(item.id)}
                    aria-label={savedIds.has(item.id) ? 'Remove from On My Radar' : 'Save to On My Radar'}
                    className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/95 hover:bg-white shadow-md transition-all"
                  >
                    <Heart className={`w-5 h-5 transition-all ${savedIds.has(item.id) ? 'fill-sky-700 text-sky-700' : 'text-zinc-400 hover:text-sky-700'}`} />
                  </button>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-script italic text-xl text-white/90 leading-tight drop-shadow-sm">{[item.destination, item.country].filter(Boolean).join(', ')}</p>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">

                  {/* Highlights (AI-generated items) */}
                  {item.highlights && item.highlights.length > 0 ? (
                    <ul className="space-y-1 mb-3">
                      {item.highlights.slice(0, 3).map((h, i) => (
                        <li key={`${h}-${i}`} className="flex items-start gap-1.5 text-xs text-zinc-600">
                          <ChevronRight className="w-3 h-3 text-sky-400 flex-shrink-0 mt-0.5" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {item.tags.map((tag) => (
                        <span key={tag} className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTagColor(tag)}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Budget intentionally hidden — kept in the row's data for
                      AI prompts when the wishlist item gets converted to a trip. */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Calendar className="w-3 h-3" />
                      <span>{item.bestSeason}</span>
                    </div>
                    {item.tripDays && (
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <MapPin className="w-3 h-3" />
                        <span>{item.tripDays} days</span>
                      </div>
                    )}
                  </div>

                  {/* Saved links — TripAdvisor reviews, blog posts, etc.
                      Always visible (not hover-revealed) since this is the
                      core of the wishlist now. */}
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <WishlistLinksSection
                      itemId={item.id}
                      links={item.links ?? []}
                      canEdit={!currentUser.isDemo}
                      onLinksChange={(nextLinks) => {
                        setAllItems(prev => prev.map(it =>
                          it.id === item.id ? { ...it, links: nextLinks } : it
                        ));
                      }}
                    />
                  </div>

                  {/* Plan-this-trip CTA */}
                  <div
                    className="mt-3 pt-3 border-t border-zinc-50 flex items-center justify-between opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`Plan a trip to ${item.destination}`}
                    onClick={() => { window.location.href = buildPlanTripHref(item); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        window.location.href = buildPlanTripHref(item);
                      }
                    }}
                  >
                    <span className="text-xs font-medium text-sky-700">Plan this trip</span>
                    <ArrowRight className="w-3.5 h-3.5 text-sky-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>

      {/* Remove-from-radar undo toast — shown for 5s after un-hearting */}
      {undoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3 rounded-full shadow-xl">
          <Heart className="w-4 h-4 text-zinc-400 flex-shrink-0" />
          <span className="text-sm font-medium">
            <span className="text-zinc-300">{undoItem.destination}</span> removed from On My Radar
          </span>
          <button
            onClick={undoRemoveFromRadar}
            className="ml-1 text-sm font-bold text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-2"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
