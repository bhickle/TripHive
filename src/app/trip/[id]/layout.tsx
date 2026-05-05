'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { trips } from '@/data/mock';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Copy, Check, X, Users } from 'lucide-react';

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
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tripcoord.ai';
  const inviteLink = `${appUrl.replace(/\/$/, '')}/join/${params.id}`;

  const handleInvite = () => {
    setShowInviteModal(true);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
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

      {/* Invite modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowInviteModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center">
                  <Users className="w-4 h-4 text-sky-700" />
                </div>
                <h3 className="font-script italic text-2xl font-semibold text-zinc-900">Invite to Trip</h3>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            <p className="text-sm text-zinc-600 mb-4">
              Share this link with your travel companions. They&apos;ll be able to view the trip and join the group to start planning together.
            </p>

            {/* Link box + copy button */}
            <div className="flex items-center gap-2 mb-5">
              <div className="flex-1 px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-500 font-mono truncate">
                {inviteLink}
              </div>
              <button
                onClick={handleCopyLink}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  linkCopied
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-sky-800 hover:bg-sky-900 text-white'
                }`}
              >
                {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {linkCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <p className="text-xs text-zinc-400 text-center">
              For email or text invites, visit the{' '}
              <button
                onClick={() => {
                  setShowInviteModal(false);
                  router.push(`/trip/${params.id}/group`);
                }}
                className="text-sky-700 font-semibold underline"
              >
                Group tab
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
