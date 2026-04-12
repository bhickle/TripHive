'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { trips, currentUser } from '@/data/mock';

interface TripLayoutProps {
  children: React.ReactNode;
  params: { id: string };
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

  const trip = trips.find(t => t.id === params.id) || trips[0];
  const [inviteCopied, setInviteCopied] = useState(false);

  const pathSegments = pathname.split('/');
  const lastSegment = pathSegments[pathSegments.length - 1];
  const activeTab = (pathToTab[lastSegment] || 'itinerary') as 'itinerary' | 'discover' | 'group' | 'prep' | 'memories';

  const handleTabChange = (tab: 'itinerary' | 'discover' | 'group' | 'prep' | 'memories') => {
    const path = tabToPath[tab] || tab;
    router.push(`/trip/${params.id}/${path}`);
  };

  const handleInvite = () => {
    navigator.clipboard.writeText(`https://triphive.app/join/${params.id}`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="flex h-screen bg-stone-50">
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

        <main className="flex-1 overflow-auto bg-stone-50">
          {children}
        </main>
      </div>
    </div>
  );
}
