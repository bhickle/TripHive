'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { Globe, Share2, Loader2, Lock, Crown } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import type { BadgeProgress } from '@/lib/world/badges';

// Public world TopoJSON — 110m resolution, ~100KB. Same dataset
// react-simple-maps documentation recommends; served via the npm
// world-atlas package CDN so we don't have to host or commit it.
const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface WorldData {
  stats: {
    totalCities: number;
    totalCountries: number;
    totalContinents: number;
    daysAbroad: number;
  };
  countries: Array<{ name: string; id: string | null; visitCount: number }>;
  cities: Array<{
    name: string;
    lon: number;
    lat: number;
    country: string | null;
    visitCount: number;
    /** Most-recent trip_photo public URL for any trip that visited
     *  this city. Used by the Nomad photo-pin treatment; null when
     *  there are no photos for those trips yet. */
    photoUrl: string | null;
    /** Trip ID to open when a pin is clicked (most recent trip that
     *  visited the city). */
    tripId: string;
  }>;
  continents: Record<string, { visited: number; total: number }>;
  badges: Array<BadgeProgress & { earnedAt: string | null }>;
  stamps: Array<{
    tripId: string;
    destination: string;
    country: string | null;
    date: string | null;
    emoji: string;
    vibe: string;
    color: string;
  }>;
}

// Gradient sky-shade per visit count. 1 visit = pale sky-300, 2 = sky-500,
// 3+ = sky-800. Matches the rest of the app's sky-leaning palette.
function fillForVisits(count: number): string {
  if (count >= 3) return '#075985'; // sky-800
  if (count === 2) return '#0284c7'; // sky-600
  if (count === 1) return '#7dd3fc'; // sky-300
  return '#f1f5f9'; // slate-100 — unvisited
}

const TIER_STYLES: Record<string, { card: string; label: string; emoji: string }> = {
  common:    { card: 'border-emerald-200', label: 'text-emerald-700', emoji: '' },
  rare:      { card: 'border-sky-200',     label: 'text-sky-700',     emoji: '' },
  epic:      { card: 'border-amber-200',   label: 'text-amber-700',   emoji: '' },
  legendary: { card: 'border-violet-300 bg-gradient-to-br from-violet-50 to-amber-50', label: 'text-violet-700', emoji: '✨' },
};

// Passport-ink palette — darker shades that read as "stamped ink"
// against the cream parchment page background. Drives both the dashed
// oval border (via currentColor) AND the text inside the stamp.
const STAMP_COLOR_STYLES: Record<string, string> = {
  rose:    'text-rose-800',
  violet:  'text-violet-800',
  amber:   'text-amber-800',
  emerald: 'text-emerald-800',
  orange:  'text-orange-800',
  sky:     'text-sky-800',
  pink:    'text-pink-800',
  slate:   'text-slate-700',
};

// Country-name → 3-letter passport code. Default is first 3 chars
// uppercased; this override map fixes the obvious cases where that
// produces a wrong/ambiguous code.
const COUNTRY_ISO3: Record<string, string> = {
  'United States': 'USA',
  'United Kingdom': 'GBR',
  'United Arab Emirates': 'UAE',
  'New Zealand': 'NZL',
  'South Africa': 'ZAF',
  'South Korea': 'KOR',
  'Czech Republic': 'CZE',
  'Costa Rica': 'CRI',
  'Dominican Republic': 'DOM',
  'Saudi Arabia': 'SAU',
};
function countryCode(country: string | null): string {
  if (!country) return '   ';
  return COUNTRY_ISO3[country] ?? country.replace(/\s+/g, '').slice(0, 3).toUpperCase();
}

// Stamp watermark — repeating "TRIPCOORD ✦" diagonal text, very faint
// against the cream parchment so it reads as security texture rather
// than as content. Inlined as a data URL so no separate asset is needed.
const STAMP_WATERMARK_BG =
  // eslint-disable-next-line @next/next/no-img-element
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='80' viewBox='0 0 200 80'><text x='10' y='50' font-family='Georgia, serif' font-size='14' fill='%237c6e3a' fill-opacity='0.07' transform='rotate(-18 100 40)'>TRIPCOORD ✦ TRIPCOORD ✦</text></svg>\"), " +
  'linear-gradient(135deg, #fdf6e3 0%, #f9efd2 100%)';

// Alternating tilt for the hand-stamped feel. Cycle through 4 angles
// so adjacent stamps in the grid don't share the same rotation.
const STAMP_ROTATIONS = ['-rotate-[3deg]', 'rotate-[3deg]', '-rotate-[1.5deg]', 'rotate-[2deg]'];

export default function WorldClient() {
  const currentUser = useCurrentUser();
  const router = useRouter();
  const { tier } = useEntitlements();
  const [data, setData] = useState<WorldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hoveredCountry, setHoveredCountry] = useState<{ id: string; name: string; count: number } | null>(null);
  const [hoveredCity, setHoveredCity] = useState<{ name: string; lon: number; lat: number; country: string | null; visitCount: number } | null>(null);
  // Lightbox state — opens when a Nomad user taps a photo-pin. Contains
  // the city name + the photoUrl shown + a deep link to the trip.
  const [lightboxCity, setLightboxCity] = useState<{ name: string; photoUrl: string; tripId: string } | null>(null);
  useEscapeKey(() => setLightboxCity(null), !!lightboxCity);

  // Redirect unauthenticated visitors to login.
  useEffect(() => {
    if (!currentUser.isLoading && !currentUser.id && !currentUser.isDemo) {
      router.replace('/auth/login');
    }
  }, [currentUser.isLoading, currentUser.id, currentUser.isDemo, router]);

  useEffect(() => {
    if (currentUser.isLoading) return;
    if (!currentUser.id || currentUser.isDemo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetch('/api/world')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`)))
      .then((d: WorldData) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [currentUser.id, currentUser.isLoading, currentUser.isDemo]);

  const countryById = useMemo(() => {
    const m = new Map<string, { name: string; visitCount: number }>();
    if (!data) return m;
    for (const c of data.countries) {
      if (c.id) m.set(c.id, { name: c.name, visitCount: c.visitCount });
    }
    return m;
  }, [data]);

  // Order continents the same way they read on a globe — Americas → Europe →
  // Africa → Asia → Oceania.
  const continentOrder = ['North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania'];
  const sortedContinents = useMemo(() => {
    if (!data) return [];
    return continentOrder.map(name => ({
      name,
      visited: data.continents[name]?.visited ?? 0,
      total: data.continents[name]?.total ?? 0,
    }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextGapNudge = useMemo(() => {
    if (!data) return null;
    // Suggest the continent with the smallest visit count that has 0-1 trips.
    const candidate = sortedContinents
      .filter(c => c.visited <= 1)
      .sort((a, b) => a.visited - b.visited)[0];
    if (!candidate) return null;
    if (candidate.visited === 0) {
      return `${candidate.name} is uncharted — pick a starter country and call it a vibe shift.`;
    }
    return `${candidate.name} is calling — you've touched 1 country, here's the rest of the continent.`;
  }, [sortedContinents, data]);

  const earnedBadges = data?.badges.filter(b => b.earned) ?? [];
  const lockedBadges = data?.badges.filter(b => !b.earned) ?? [];

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar activePage="world" user={currentUser} />

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">

          {/* Page header */}
          <header className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">Your Travel Story</p>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <h1 className="text-4xl font-script italic font-semibold tracking-tight text-zinc-900">My World</h1>
              <button
                className="bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-700 font-semibold px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 transition-colors disabled:opacity-50"
                disabled
                title="Coming soon — share a snapshot of your map"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share my map
              </button>
            </div>
          </header>

          {loading && (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
              <Loader2 className="w-8 h-8 text-sky-700 animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Plotting your travels…</p>
            </div>
          )}

          {error && !loading && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center">
              <p className="text-sm text-rose-800">Couldn&apos;t load your map data. Try refreshing.</p>
            </div>
          )}

          {!loading && data && (
            <>
              {/* Stats strip */}
              <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <p className="text-3xl md:text-4xl font-script italic font-semibold text-zinc-900">{data.stats.totalCities}</p>
                  <p className="text-xs text-zinc-500 mt-1">Cities Visited</p>
                </div>
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <p className="text-3xl md:text-4xl font-script italic font-semibold text-zinc-900">{data.stats.totalCountries}</p>
                  <p className="text-xs text-zinc-500 mt-1">Countries</p>
                  <div className="mt-1.5 h-1 bg-zinc-100 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-700 rounded-full" style={{ width: `${Math.min((data.stats.totalCountries / 195) * 100, 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">of 195</p>
                </div>
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <p className="text-3xl md:text-4xl font-script italic font-semibold text-zinc-900">{data.stats.totalContinents}<span className="text-base text-zinc-400">/7</span></p>
                  <p className="text-xs text-zinc-500 mt-1">Continents</p>
                </div>
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                  <p className="text-3xl md:text-4xl font-script italic font-semibold text-zinc-900">{data.stats.daysAbroad}</p>
                  <p className="text-xs text-zinc-500 mt-1">Days Abroad</p>
                  {data.stats.daysAbroad > 0 && (
                    <p className="text-[10px] text-zinc-400 mt-0.5">≈ {(data.stats.daysAbroad * 24).toLocaleString()} hours</p>
                  )}
                </div>
              </section>

              {/* Map */}
              <section className="mb-8">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-lg font-semibold text-zinc-900">Where you&apos;ve been</h2>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#7dd3fc' }} /> 1 visit
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#0284c7' }} /> 2 visits
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#075985' }} /> 3+ visits
                    </span>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden relative">
                  <ComposableMap
                    projection="geoEqualEarth"
                    projectionConfig={{ scale: 165 }}
                    style={{ width: '100%', height: 'auto' }}
                  >
                    <ZoomableGroup zoom={1} center={[0, 20]}>
                      <Geographies geography={GEO_URL}>
                        {({ geographies }: { geographies: Array<{ rsmKey: string; id: string; properties: { name: string } }> }) =>
                          geographies.map(geo => {
                            const country = countryById.get(geo.id);
                            const fill = fillForVisits(country?.visitCount ?? 0);
                            return (
                              <Geography
                                key={geo.rsmKey}
                                geography={geo}
                                fill={fill}
                                stroke="#cbd5e1"
                                strokeWidth={0.3}
                                style={{
                                  default: { outline: 'none' },
                                  hover: { outline: 'none', fill: country ? '#0c4a6e' : '#e2e8f0', cursor: country ? 'pointer' : 'default' },
                                  pressed: { outline: 'none' },
                                }}
                                onMouseEnter={() => {
                                  if (country) setHoveredCountry({ id: geo.id, name: country.name, count: country.visitCount });
                                }}
                                onMouseLeave={() => setHoveredCountry(null)}
                              />
                            );
                          })
                        }
                      </Geographies>
                      {data.cities.map(city => {
                        // Nomad photo-pin: render the city's representative
                        // trip photo as a small circular thumbnail. Lower
                        // tiers (and Nomad cities with no photos yet) get
                        // the simple white-dot pin. SVG <image> + clipPath
                        // for the circular crop — only one clipPath per
                        // pin so the count scales linearly with cities.
                        const showPhoto = tier === 'nomad' && city.photoUrl;
                        const clipId = `city-clip-${city.name.replace(/[^a-z0-9]/gi, '_')}`;
                        return (
                          <Marker
                            key={`${city.name}-${city.lat}-${city.lon}`}
                            coordinates={[city.lon, city.lat]}
                            onMouseEnter={() => setHoveredCity(city)}
                            onMouseLeave={() => setHoveredCity(null)}
                            onClick={() => {
                              if (showPhoto) setLightboxCity({ name: city.name, photoUrl: city.photoUrl ?? '', tripId: city.tripId });
                              else router.push(`/trip/${city.tripId}/itinerary`);
                            }}
                            style={{ default: { cursor: 'pointer' }, hover: { cursor: 'pointer' }, pressed: { cursor: 'pointer' } }}
                          >
                            {showPhoto ? (
                              <>
                                <defs>
                                  <clipPath id={clipId}>
                                    <circle r={9} />
                                  </clipPath>
                                </defs>
                                <circle r={10} fill="#fff" stroke="#fff" strokeWidth={2} />
                                <image
                                  href={city.photoUrl ?? ''}
                                  x={-9}
                                  y={-9}
                                  width={18}
                                  height={18}
                                  preserveAspectRatio="xMidYMid slice"
                                  clipPath={`url(#${clipId})`}
                                />
                                <circle r={9} fill="none" stroke="#0369a1" strokeWidth={1.5} />
                              </>
                            ) : (
                              <circle r={4} fill="#fff" stroke="#0369a1" strokeWidth={2} />
                            )}
                          </Marker>
                        );
                      })}
                    </ZoomableGroup>
                  </ComposableMap>

                  {/* Hover tooltip — bottom-left of map */}
                  {(hoveredCountry || hoveredCity) && (
                    <div className="absolute bottom-3 left-3 bg-zinc-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none">
                      {hoveredCity ? (
                        <>
                          <p className="font-semibold">{hoveredCity.name}</p>
                          <p className="text-[10px] text-zinc-300">{hoveredCity.country ?? ''}{hoveredCity.country && hoveredCity.visitCount > 1 ? ' · ' : ''}{hoveredCity.visitCount > 1 ? `${hoveredCity.visitCount} visits` : ''}</p>
                        </>
                      ) : hoveredCountry && (
                        <>
                          <p className="font-semibold">{hoveredCountry.name}</p>
                          <p className="text-[10px] text-zinc-300">{hoveredCountry.count} {hoveredCountry.count === 1 ? 'visit' : 'visits'}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Continent progress strip */}
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                  {sortedContinents.map(c => {
                    const pct = c.total > 0 ? (c.visited / c.total) * 100 : 0;
                    const isUntouched = c.visited === 0;
                    return (
                      <div key={c.name} className={`bg-white border border-zinc-200 rounded-xl p-3 ${isUntouched ? 'opacity-60' : ''}`}>
                        <p className="font-semibold text-zinc-700 mb-1">
                          {c.name} <span className="text-zinc-400 font-normal">{c.visited}/{c.total}</span>
                        </p>
                        <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                          {pct > 0 && <div className="h-full bg-sky-700 rounded-full" style={{ width: `${pct}%` }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Next-gap nudge */}
                {nextGapNudge && (
                  <div className="mt-4 flex items-center gap-3 bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200 rounded-2xl px-5 py-3">
                    <span className="text-2xl flex-shrink-0">🌎</span>
                    <p className="text-sm text-zinc-700 leading-snug flex-1">{nextGapNudge}</p>
                    <Link href="/discover" className="text-xs font-semibold text-sky-800 hover:text-sky-900 whitespace-nowrap">Explore →</Link>
                  </div>
                )}
              </section>

              {/* Passport stamps (Trip Pass+) */}
              <section className="mb-10">
                <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">Your Passport</h2>
                    <p className="text-xs text-zinc-500">One stamp per completed trip · vibe derived from your trip priorities</p>
                  </div>
                  {tier === 'free' && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Trip Pass+
                    </span>
                  )}
                </div>
                {tier === 'free' && data.stamps.length > 0 ? (
                  <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center">
                    <Lock className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                    <h3 className="font-semibold text-zinc-800 mb-1">Passport is a paid feature</h3>
                    <p className="text-sm text-zinc-500 mb-4 max-w-xs mx-auto">Collect stamps for every completed trip and watch your passport fill. Available on Trip Pass and above.</p>
                    <Link href="/pricing" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-sm rounded-full transition-colors">
                      See plans
                    </Link>
                  </div>
                ) : data.stamps.length === 0 ? (
                  <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center">
                    <Globe className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">Your first completed trip earns your first stamp. Go somewhere!</p>
                  </div>
                ) : (
                  // Passport-page grid: each card is a cream parchment
                  // page with header strip (brand + country code chip),
                  // a big inked oval stamp pressed onto the middle, and
                  // a footer strip (vibe + page #). Alternating tilt
                  // on the oval gives a hand-stamped feel.
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {data.stamps.map((stamp, i) => {
                      const colorClass = STAMP_COLOR_STYLES[stamp.color] ?? 'text-slate-700';
                      const rotateClass = STAMP_ROTATIONS[i % STAMP_ROTATIONS.length];
                      // Pages newest-first; № descending so the most
                      // recent trip is the highest-numbered page.
                      const pageNo = data.stamps.length - i;
                      const code = countryCode(stamp.country);
                      const dateLabel = stamp.date
                        ? new Date(stamp.date + 'T12:00:00').toLocaleDateString('en-US', {
                            day: 'numeric', month: 'short', year: '2-digit',
                          }).toUpperCase().replace(/[, ]+/g, ' · ')
                        : '—';
                      return (
                        <Link
                          key={stamp.tripId}
                          href={`/trip/${stamp.tripId}/itinerary`}
                          className="group relative aspect-[1/1.35] rounded-md overflow-hidden flex flex-col justify-between p-3 transition-all hover:-translate-y-[3px]"
                          style={{
                            background: STAMP_WATERMARK_BG,
                            backgroundSize: '200px 80px, cover',
                            border: '1px solid #d4c89a',
                            boxShadow:
                              'inset 8px 0 18px -8px rgba(120, 95, 50, 0.18), 0 1px 0 rgba(0,0,0,0.04), 0 4px 14px -8px rgba(0,0,0,0.08)',
                          }}
                        >
                          {/* Page header — brand + country code chip */}
                          <div className="flex items-center justify-between font-mono text-[8px] font-bold tracking-[0.2em] uppercase border-b border-dashed pb-1.5" style={{ color: '#7c6e3a', borderColor: 'rgba(124, 110, 58, 0.4)' }}>
                            <span className="truncate">TRIPCOORD ✦</span>
                            <span className="ml-1 px-1.5 py-px rounded-sm border" style={{ background: '#fff8e6', borderColor: 'rgba(124,110,58,0.35)', color: '#5b5028' }}>
                              {code}
                            </span>
                          </div>

                          {/* Inked oval stamp pressed onto the page */}
                          <div
                            className={`self-center w-[96%] aspect-[1/0.95] border-[2.5px] border-dashed rounded-[50%/55%] flex flex-col items-center justify-between py-3 px-2 my-1 font-mono text-center ${colorClass} ${rotateClass}`}
                            style={{
                              background: 'rgba(255, 248, 230, 0.45)',
                              boxShadow:
                                'inset 0 0 0 4px rgba(255, 248, 230, 0.4), inset 0 0 14px rgba(0,0,0,0.05)',
                              filter: 'contrast(0.96) saturate(0.92)',
                            }}
                          >
                            {/* Top label with decorative side bars */}
                            <div className="flex items-center gap-1.5 w-full px-1 text-[10px] font-bold tracking-[0.18em] leading-tight">
                              <span className="flex-1 h-px opacity-55" style={{ borderTop: '1px solid currentColor' }} />
                              <span className="truncate">{stamp.destination.toUpperCase()}</span>
                              <span className="flex-1 h-px opacity-55" style={{ borderTop: '1px solid currentColor' }} />
                            </div>
                            <span className="text-[2.25rem] leading-none my-1">{stamp.emoji}</span>
                            <p className="text-[9px] font-bold tracking-[0.16em]">{dateLabel}</p>
                          </div>

                          {/* Page footer — vibe + page number */}
                          <div className="flex items-center justify-between font-mono text-[8px] font-bold tracking-[0.2em] uppercase border-t border-dashed pt-1.5" style={{ color: '#7c6e3a', borderColor: 'rgba(124, 110, 58, 0.4)' }}>
                            <span className="truncate" style={{ color: '#5b5028' }}>{stamp.vibe}</span>
                            <span className="ml-1 px-1.5 py-px rounded-sm tabular-nums" style={{ background: 'rgba(124,110,58,0.1)' }}>
                              № {String(pageNo).padStart(2, '0')}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                    {/* "Next stamp" placeholder — empty passport page */}
                    <Link
                      href="/trip/new"
                      className="aspect-[1/1.35] rounded-md border border-dashed flex flex-col items-center justify-center text-center font-mono transition-colors"
                      style={{ borderColor: '#d4c89a', color: '#b6a878' }}
                    >
                      <span className="text-3xl leading-none mb-2">+</span>
                      <p className="text-[9px] font-bold tracking-[0.2em]">NEXT STAMP</p>
                      <p className="text-[9px] mt-1.5 tracking-wider">Plan a trip</p>
                    </Link>
                  </div>
                )}
              </section>

              {/* Badges (Trip Pass+) */}
              <section className="mb-10">
                <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">Travel Badges</h2>
                    <p className="text-xs text-zinc-500">
                      {earnedBadges.length} earned · {lockedBadges.length} to unlock
                    </p>
                  </div>
                  {tier === 'free' && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Trip Pass+
                    </span>
                  )}
                </div>
                {tier === 'free' ? (
                  <div className="bg-white border border-zinc-200 rounded-2xl p-8 text-center">
                    <Lock className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                    <h3 className="font-semibold text-zinc-800 mb-1">Badges are a paid feature</h3>
                    <p className="text-sm text-zinc-500 mb-4 max-w-md mx-auto">Earn collectible badges for milestones — Foodie Pilgrim, Continent Hopper, World Wanderer. Available on Trip Pass and above.</p>
                    <Link href="/pricing" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-sm rounded-full transition-colors">
                      See plans
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {[...earnedBadges, ...lockedBadges].map(badge => {
                      const styles = TIER_STYLES[badge.tier] ?? TIER_STYLES.common;
                      const muted = !badge.earned;
                      return (
                        <div
                          key={badge.id}
                          title={badge.description}
                          className={`bg-white border-2 ${styles.card} rounded-2xl p-4 flex flex-col items-center text-center hover:shadow-lg transition-shadow ${muted ? 'opacity-60 hover:opacity-100' : ''}`}
                        >
                          <span className={`text-3xl mb-2 ${muted ? 'grayscale' : ''}`}>{badge.emoji}</span>
                          <p className={`text-xs font-bold ${muted ? 'text-zinc-500' : 'text-zinc-800'} leading-tight`}>{badge.title}</p>
                          <p className={`text-[9px] uppercase tracking-wide font-semibold ${muted ? 'text-zinc-400' : styles.label} mt-1`}>
                            {styles.emoji} {badge.tier}
                          </p>
                          {badge.progressLabel && (
                            <>
                              <p className="text-[10px] text-zinc-400 mt-1">{badge.progressLabel}</p>
                              {typeof badge.progress === 'number' && (
                                <div className="w-full h-1 bg-zinc-100 rounded-full mt-1.5">
                                  <div className="h-full bg-zinc-400 rounded-full" style={{ width: `${Math.round((badge.progress ?? 0) * 100)}%` }} />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Nomad upsell — photo pins + time-lapse + shareable card.
                  Stub for v1; the real photo-pin gallery + animated time-lapse
                  ship in a follow-up. */}
              {tier !== 'nomad' && (
                <section className="mb-10 bg-gradient-to-br from-amber-50 via-rose-50 to-purple-50 border border-amber-200 rounded-2xl p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-200 px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1">
                        <Crown className="w-2.5 h-2.5" /> Nomad
                      </span>
                      <h2 className="text-lg font-semibold text-zinc-900 mt-2">Bring your map to life</h2>
                      <p className="text-sm text-zinc-600 mt-1">Photo pins · animated time-lapse of every trip in order · shareable map card</p>
                    </div>
                    <Link href="/pricing" className="bg-zinc-900 hover:bg-zinc-800 text-white font-semibold px-5 py-2.5 rounded-full text-sm whitespace-nowrap">
                      See Nomad
                    </Link>
                  </div>
                </section>
              )}
            </>
          )}

        </div>
      </main>

      {/* Photo lightbox — Nomad photo-pin gallery. Click anywhere
          outside the photo to dismiss. */}
      {lightboxCity && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Memory from ${lightboxCity.name}`}
          onClick={() => setLightboxCity(null)}
        >
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Memory from</p>
                <h3 className="text-2xl font-script italic font-semibold text-white">{lightboxCity.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/trip/${lightboxCity.tripId}/itinerary`}
                  className="text-xs font-semibold text-white/80 hover:text-white px-3 py-1.5 rounded-full border border-white/20 hover:border-white/40 transition-colors"
                >
                  View trip →
                </Link>
                <button
                  onClick={() => setLightboxCity(null)}
                  className="text-white/60 hover:text-white w-8 h-8 rounded-full flex items-center justify-center"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxCity.photoUrl}
              alt={lightboxCity.name}
              className="w-full h-auto rounded-2xl shadow-2xl max-h-[75vh] object-contain bg-zinc-900"
            />
            <p className="text-xs text-white/40 mt-3 text-center">Click outside to close</p>
          </div>
        </div>
      )}
    </div>
  );
}
