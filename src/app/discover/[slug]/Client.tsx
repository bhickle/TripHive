'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Clock,
  DollarSign,
  ExternalLink,
  Sparkles,
  Sun,
  Sunset,
  Moon,
  Calendar,
  Globe,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Activity {
  time: 'morning' | 'afternoon' | 'evening';
  title: string;
  description: string;
  affiliate_url?: string;
  affiliate_label?: string;
  cost_usd?: number;
}

interface ItineraryDay {
  day: number;
  title: string;
  activities: Activity[];
}

interface FeaturedItinerary {
  id: string;
  slug: string;
  destination: string;
  country: string;
  title: string;
  tagline: string | null;
  heroImage: string | null;
  durationDays: number;
  vibes: string[];
  personaTags: string[];
  seasonTags: string[];
  avgCostPerDay: number | null;
  editorPick: boolean | null;
  days: ItineraryDay[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const timeConfig = {
  morning: {
    label: 'Morning',
    icon: Sun,
    dot: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    border: 'border-l-amber-400',
  },
  afternoon: {
    label: 'Afternoon',
    icon: Sunset,
    dot: 'bg-sky-400',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    border: 'border-l-sky-400',
  },
  evening: {
    label: 'Evening',
    icon: Moon,
    dot: 'bg-violet-400',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    border: 'border-l-violet-400',
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function DiscoverItineraryPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [itinerary, setItinerary] = useState<FeaturedItinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/featured-itineraries/${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.itinerary) setItinerary(data.itinerary);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  const toggleDay = (day: number) => {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleStartPlanning = () => {
    if (!itinerary) return;
    router.push(`/trip/new?destination=${encodeURIComponent(itinerary.destination)}&days=${itinerary.durationDays}&featured=${itinerary.slug}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Loading itinerary…</p>
        </div>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500 mb-4">Itinerary not found.</p>
          <Link href="/discover" className="text-sky-600 hover:underline text-sm">← Back to Discover</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative h-80 md:h-[28rem] overflow-hidden">
        {itinerary.heroImage ? (
          <img
            src={itinerary.heroImage}
            alt={itinerary.destination}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-sky-600 to-indigo-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Back nav */}
        <div className="absolute top-4 left-4">
          <Link
            href="/discover"
            className="flex items-center gap-2 text-white/90 hover:text-white text-sm bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Discover
          </Link>
        </div>

        {/* Editor pick badge */}
        {itinerary.editorPick && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-amber-400 text-amber-900 text-xs font-semibold px-3 py-1.5 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
            Editor's Pick
          </div>
        )}

        {/* Hero text */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <div className="flex items-center gap-2 text-white/70 text-sm mb-2">
            <MapPin className="w-4 h-4" />
            {itinerary.destination}, {itinerary.country}
          </div>
          <h1 className="font-script italic text-3xl md:text-4xl font-bold text-white leading-tight mb-2">
            {itinerary.title}
          </h1>
          {itinerary.tagline && (
            <p className="text-white/80 text-sm md:text-base max-w-2xl leading-relaxed">
              {itinerary.tagline}
            </p>
          )}
        </div>
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6 text-sm text-zinc-600 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <Calendar className="w-4 h-4 text-sky-500" />
            <span>{itinerary.durationDays} days</span>
          </div>
          {itinerary.avgCostPerDay && (
            <div className="flex items-center gap-1.5 shrink-0">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span>~${itinerary.avgCostPerDay}/day</span>
            </div>
          )}
          {itinerary.vibes.slice(0, 3).map(v => (
            <span key={v} className="shrink-0 capitalize bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full text-xs">
              {v}
            </span>
          ))}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <Globe className="w-4 h-4 text-violet-500" />
            <span className="text-violet-600 font-medium">Read-only preview</span>
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-8">

        <div className="flex items-center justify-between mb-6">
          <h2 className="font-script italic text-2xl font-semibold text-zinc-900">
            Day-by-Day Itinerary
          </h2>
          <button
            onClick={() => setExpandedDays(
              expandedDays.size === itinerary.days.length
                ? new Set()
                : new Set(itinerary.days.map(d => d.day))
            )}
            className="text-xs text-sky-600 hover:text-sky-700 underline-offset-2 hover:underline"
          >
            {expandedDays.size === itinerary.days.length ? 'Collapse all' : 'Expand all'}
          </button>
        </div>

        {/* Days */}
        <div className="space-y-4">
          {itinerary.days.map((day) => {
            const isExpanded = expandedDays.has(day.day);
            return (
              <div key={day.day} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">

                {/* Day header */}
                <button
                  onClick={() => toggleDay(day.day)}
                  className="w-full flex items-center justify-between p-4 md:p-5 text-left hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-sky-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {day.day}
                    </div>
                    <div>
                      <div className="text-xs text-zinc-400 font-medium">Day {day.day}</div>
                      <div className="font-semibold text-zinc-800">{day.title}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Time dots preview */}
                    <div className="hidden sm:flex items-center gap-1">
                      {day.activities.map((a, i) => {
                        const cfg = timeConfig[a.time] ?? timeConfig.morning;
                        return <div key={i} className={`w-2 h-2 rounded-full ${cfg.dot}`} />;
                      })}
                    </div>
                    <Clock className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Activities */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 divide-y divide-zinc-100">
                    {day.activities.map((activity, idx) => {
                      const cfg = timeConfig[activity.time] ?? timeConfig.morning;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={idx}
                          className={`p-4 md:p-5 border-l-4 ${cfg.border} ml-0`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                                <Icon className="w-3 h-3" />
                                {cfg.label}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-semibold text-zinc-800 text-sm">{activity.title}</h4>
                                {activity.cost_usd !== undefined && activity.cost_usd > 0 && (
                                  <span className="text-xs text-zinc-400 shrink-0">~${activity.cost_usd}</span>
                                )}
                              </div>
                              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">{activity.description}</p>
                              {activity.affiliate_url && activity.affiliate_label && (
                                <a
                                  href={activity.affiliate_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 mt-2.5 text-xs font-medium text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 px-3 py-1.5 rounded-full transition-colors"
                                >
                                  {activity.affiliate_label}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <div className="mt-10 bg-gradient-to-br from-sky-600 to-indigo-700 rounded-2xl p-8 text-center">
          <div className="text-white/80 text-sm mb-2 flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            AI-personalized for your group
          </div>
          <h3 className="text-white text-2xl font-bold mb-2">
            Ready to make this trip yours?
          </h3>
          <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
            We'll customize this itinerary for your group size, budget, and travel style — then handle the planning details.
          </p>
          <button
            onClick={handleStartPlanning}
            className="inline-flex items-center gap-2 bg-white text-sky-700 font-semibold px-8 py-3.5 rounded-full hover:bg-sky-50 transition-colors shadow-lg text-sm"
          >
            <Sparkles className="w-4 h-4" />
            Start planning this trip
          </button>
        </div>

        {/* Bottom link */}
        <div className="mt-6 text-center">
          <Link href="/discover" className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
            ← Back to all destinations
          </Link>
        </div>
      </div>
    </div>
  );
}
