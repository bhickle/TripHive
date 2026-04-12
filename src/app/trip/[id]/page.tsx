'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TripIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/trip/1/itinerary');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-slate-400 font-medium">Loading trip...</div>
    </div>
  );
}
