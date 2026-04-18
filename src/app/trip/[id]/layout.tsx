'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { trips } from '@/data/mock';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface TripLayoutProps {
  children: React.ReactNode;
  params: { id: string };
}

interface AiTripMeta {
  destination?: string;
  startDate?: string;
  endDate?: string;
  title?: string;
  practicalNotes?: Record<string, unknown>;
}

const tabToPath: Record<string, string> = {
  itinerary: 'itinerary',
  discover: 'discover',
  group: 'group',
  prep: 'prep',
  dayof: 'dayof',
  memories: 'memories',
};

const pathToTab: Record<string, string> = {
  itinerary: 'itinerary',
  discover: 'discover',
  group: 'group',
  prep: 'prep',
  dayof: 'dayof',
  memories: 'memories',
  layover: 'discover',
  upload: 'itinerary',
};

export default function TripLayout({ children, params }: TripLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentUser = useCurrentUser();

  const mockTrip = trips.find(t => t.id === params.id);

  // Always start null — avoids SSR/client hydration mismatch.
  // The useEffect below loads from Supabase (or localStorage fallback) after mount.
  const [aiMeta, setAiMeta] = useState<AiTripMeta | null>(null);

  const [inviteCopied, setInviteCopied] = useState(false);

  // Load trip meta: try Supabase first (for UUID trip IDs), then localStorage
  useEffect(() => {
    if (mockTrip) return; // mock trip found — no need to fetch

    const load = async () => {
      const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(params.id);
      if (looksLikeUuid) {
        try {
          const res = await fetch(`/api/trips/${params.id}`);
          if (res.ok) {
            const { trip, itinerary } = await res.json();
            setAiMeta({
              destination: trip.destination,
              title: trip.title,
              startDate: trip.start_date,
              endDate: trip.end_date,
              practicalNotes: itinerary?.meta?.practicalNotes ?? null,
            });
            return;
          }
        } catch { /* fall through */ }
      }

      // localStorage fallback
      try {
        const stored = localStorage.getItem('generatedTripMeta');
        if (stored) setAiMeta(JSON.parse(stored));
      } catch { /* ignore */ }
    };

    load();
  }, [mockTrip, params.id]);

  // Build the trip object: prefer real data, fall back gracefully without leaking mock content
  const trip = mockTrip ?? (() => {
    const base = trips[0]; // shape reference only — destination + title are always overridden
    const destination = aiMeta?.destination ?? '';
    const city = destination.split(',')[0].trim();
    const title = aiMeta?.title ?? (city ? `${city} Adventure` : 'Your Trip');
    return { ...base, id: params.id, destination, title };
  })();

  const pathSegments = pathname.split('/');
  const lastSegment = pathSegments[pathSegments.length - 1];
  const activeTab = (pathToTab[lastSegment] || 'itinerary') as 'itinerary' | 'discover' | 'group' | 'prep' | 'memories';

  const handleTabChange = (tab: 'itinerary' | 'discover' | 'group' | 'prep' | 'memories') => {
    const path = tabToPath[tab] || tab;
    router.push(`/trip/${params.id}/${path}`);
  };

  const handleInvite = () => {
    navigator.clipboard.writeText(`https://tripcoord.app/join/${params.id}`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar
        activeTrip={{
          id: trip.id,
          title: trip.title,
          destination: trip.destination,
        }}
        activePage={`trip-${trip.id}`}
        user={currentUser}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          tripTitle={trip.title}
          destination={trip.destination}
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onInvite={handleInvite}
          tripId={trip.id}
          showBackButton={true}
        />

        <main className="flex-1 overflow-auto bg-parchment">
          {children}
        </main>
      </div>
    </div>
  );
}
