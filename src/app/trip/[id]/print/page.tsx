'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function PrintItineraryPage() {
  const params = useParams();
  const tripId = params.id as string;
  const [days, setDays] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Try Supabase first
      if (/^[0-9a-f-]{36}$/i.test(tripId)) {
        try {
          const res = await fetch(`/api/trips/${tripId}`);
          if (res.ok) {
            const { itinerary } = await res.json();
            if (itinerary?.days?.length) {
              setDays(itinerary.days);
              setMeta(itinerary.meta ?? null);
              setLoading(false);
              return;
            }
          }
        } catch {}
      }
      // Fallback to localStorage
      try {
        const stored = localStorage.getItem('generatedItinerary');
        if (stored) setDays(JSON.parse(stored));
        const storedMeta = localStorage.getItem('generatedTripMeta');
        if (storedMeta) setMeta(JSON.parse(storedMeta));
      } catch {}
      setLoading(false);
    };
    load();
  }, [tripId]);

  useEffect(() => {
    if (!loading && days.length > 0) {
      // Small delay to ensure render is complete
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, days]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-zinc-400 text-sm">Loading itinerary…</p>
    </div>
  );

  const title = meta?.title ?? days[0]?.title ?? 'Trip Itinerary';
  const destination = meta?.destination ?? '';
  const startDate = meta?.startDate ?? days[0]?.date ?? '';
  const endDate = meta?.endDate ?? '';

  return (
    <div className="print-container max-w-3xl mx-auto px-8 py-10 font-sans text-zinc-900">
      <style>{`
        @media print {
          @page { margin: 1.5cm; }
          /* Hide everything, then show only the print container */
          body * { visibility: hidden; }
          .print-container, .print-container * { visibility: visible; }
          .print-container { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .page-break { break-before: page; }
        }
        body { font-family: Georgia, serif; }
        .print-container { font-family: Georgia, serif; }
      `}</style>

      {/* Header */}
      <div className="mb-8 pb-6 border-b-2 border-zinc-900">
        <h1 className="text-3xl font-bold mb-1">{title}</h1>
        {destination && <p className="text-lg text-zinc-500">{destination}</p>}
        {(startDate || endDate) && (
          <p className="text-sm text-zinc-400 mt-1">
            {startDate}{endDate && startDate ? ` – ${endDate}` : endDate}
          </p>
        )}
      </div>

      {/* Practical Notes */}
      {meta?.practicalNotes && (
        <div className="mb-8 p-4 bg-zinc-50 rounded-lg border border-zinc-200">
          <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">Before You Go</h2>
          {meta.practicalNotes.currency && <p className="text-sm mb-1"><strong>Currency:</strong> {meta.practicalNotes.currency}</p>}
          {meta.practicalNotes.tipping && <p className="text-sm mb-1"><strong>Tipping:</strong> {meta.practicalNotes.tipping}</p>}
          {meta.practicalNotes.customs && <p className="text-sm mb-1"><strong>Customs:</strong> {meta.practicalNotes.customs}</p>}
          {meta.practicalNotes.entryRequirements && <p className="text-sm mb-1"><strong>Entry:</strong> {meta.practicalNotes.entryRequirements}</p>}
        </div>
      )}

      {/* Days */}
      {days.map((day: any, di: number) => {
        const allActivities = [
          ...(day.tracks?.shared ?? []),
          ...(day.tracks?.track_a ?? []),
          ...(day.tracks?.track_b ?? []),
        ]
          // Skip private activities — they are personal and not meant for printed itineraries
          .filter((a: any) => !a.isPrivate)
          .sort((a: any, b: any) => (a.timeSlot ?? '').localeCompare(b.timeSlot ?? ''));

        // Show a city banner when the city changes between days
        const prevCity = di > 0 ? days[di - 1]?.city : null;
        const showCityBanner = day.city && day.city !== prevCity;

        // Collect foodie tips for this day
        const foodieTips: any[] = day.foodieTips ?? [];

        // Collect photo spots for this day
        const photoSpots: any[] = day.photoSpots ?? [];

        // Find tonight's hotel(s) — same date-range logic as the itinerary page
        const bookedHotels: any[] = meta?.bookedHotels ?? [];
        const todaysHotels = bookedHotels.filter((h: any) => {
          if (!h.checkIn && !h.checkOut) return true;
          const dayDate = day.date ?? null;
          if (!dayDate) return true;
          if (h.checkIn && dayDate < h.checkIn) return false;
          if (h.checkOut && dayDate >= h.checkOut) return false;
          return true;
        });

        return (
          <div key={di} className={di > 0 ? 'mt-10 pt-8 border-t border-zinc-200' : ''}>
            {showCityBanner && (
              <div className="mb-6 pb-2 border-b-2 border-zinc-900">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Destination</p>
                <h2 className="text-2xl font-bold text-zinc-900">{day.city}</h2>
              </div>
            )}
            <div className="mb-4">
              <h2 className="text-xl font-bold">Day {day.day} — {day.theme ?? ''}</h2>
              {day.date && <p className="text-sm text-zinc-400">{day.date}</p>}
              {day.destinationTip && (
                <p className="text-sm text-amber-700 mt-1 italic">💡 {day.destinationTip}</p>
              )}
            </div>

            <div className="space-y-4">
              {allActivities.map((act: any, ai: number) => (
                <div key={ai} className="flex gap-4">
                  <div className="w-20 flex-shrink-0 text-right">
                    <p className="text-xs text-zinc-400 font-mono">{act.timeSlot?.split('–')[0] ?? ''}</p>
                  </div>
                  <div className="flex-1 border-l-2 border-zinc-100 pl-4 pb-3">
                    <p className="font-semibold text-sm">
                      {act.name ?? act.title}
                      {act.isRestaurant && act.mealType && (
                        <span className="ml-2 text-[10px] font-normal text-zinc-400 uppercase tracking-wide">{act.mealType}</span>
                      )}
                    </p>
                    {act.address && <p className="text-xs text-zinc-400 mt-0.5">{act.address}</p>}
                    {act.description && <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{act.description}</p>}
                    {act.packingTips?.length > 0 && (
                      <p className="text-xs text-amber-600 mt-1">Bring: {act.packingTips.join(' · ')}</p>
                    )}
                    {act.transportToNext && (
                      <p className="text-xs text-zinc-300 mt-1">↓ {act.transportToNext.mode} · {act.transportToNext.durationMins} min{act.transportToNext.notes ? ` · ${act.transportToNext.notes}` : ''}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Photo Spots */}
            {photoSpots.length > 0 && (
              <div className="mt-6 pl-24">
                <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-2">📷 Photo Spots</p>
                <div className="space-y-2">
                  {photoSpots.map((spot: any, si: number) => (
                    <div key={si} className="pl-4 border-l-2 border-violet-100">
                      <p className="text-xs font-semibold text-violet-800">
                        {spot.name}
                        {spot.timeOfDay && <span className="ml-2 text-[10px] font-normal text-violet-400 uppercase">{spot.timeOfDay}</span>}
                      </p>
                      {spot.tip && <p className="text-xs text-violet-600 mt-0.5 leading-relaxed">{spot.tip}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Foodie Tips */}
            {foodieTips.length > 0 && (
              <div className="mt-6 pl-24">
                <p className="text-[10px] font-bold uppercase tracking-widest text-orange-400 mb-2">🍜 Foodie Tips</p>
                <div className="space-y-2">
                  {foodieTips.map((tip: any, ti: number) => (
                    <div key={ti} className="pl-4 border-l-2 border-orange-100">
                      <p className="text-xs font-semibold text-orange-800">
                        {tip.name}
                        {tip.type && <span className="ml-2 text-[10px] font-normal text-orange-400 uppercase">{tip.type}</span>}
                        {tip.priceRange && <span className="ml-1 text-[10px] font-normal text-orange-400">{tip.priceRange}</span>}
                      </p>
                      {tip.neighborhood && <p className="text-[10px] text-orange-500">{tip.neighborhood}</p>}
                      {tip.why && <p className="text-xs text-orange-700 mt-0.5 leading-relaxed">{tip.why}</p>}
                      {(tip.orderThis || tip.bestFor) && (
                        <p className="text-[10px] text-orange-600 mt-0.5">
                          {tip.orderThis ? `Order: ${tip.orderThis}` : `Best for: ${tip.bestFor}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tonight's Stay */}
            {todaysHotels.length > 0 && (
              <div className="mt-6 pl-24">
                <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">🛏️ Tonight's Stay</p>
                <div className="space-y-2">
                  {todaysHotels.map((h: any, hi: number) => (
                    <div key={hi} className="pl-4 border-l-2 border-amber-100">
                      <p className="text-xs font-semibold text-amber-800">{h.name}</p>
                      {h.address && <p className="text-[10px] text-amber-600">{h.address}</p>}
                      {(h.checkIn || h.checkOut) && (
                        <p className="text-[10px] text-amber-500 mt-0.5">
                          {h.checkIn && `Check-in: ${h.checkIn}`}{h.checkIn && h.checkOut ? ' · ' : ''}{h.checkOut && `Check-out: ${h.checkOut}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-12 pt-6 border-t border-zinc-200 text-center">
        <p className="text-xs text-zinc-300">Generated by tripcoord · tripcoord.ai</p>
      </div>
    </div>
  );
}
