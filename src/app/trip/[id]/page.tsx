'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function TripIndexPage() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    const id = params?.id ?? '1';
    router.replace(`/trip/${id}/itinerary`);
  }, [router, params]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-slate-400 font-medium">Loading trip...</div>
    </div>
  );
}
