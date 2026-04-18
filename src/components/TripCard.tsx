'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, Users, ArrowRight } from 'lucide-react';
import { Trip } from '@/lib/types';

// Destination keyword → Unsplash photo (same set used across dashboard/trip-new)
const DEST_PHOTOS: Record<string, string> = {
  iceland:     'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&h=416&fit=crop',
  tokyo:       'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=416&fit=crop',
  japan:       'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=416&fit=crop',
  bali:        'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=416&fit=crop',
  barcelona:   'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=416&fit=crop',
  paris:       'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=416&fit=crop',
  italy:       'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=800&h=416&fit=crop',
  santorini:   'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&h=416&fit=crop',
  greece:      'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&h=416&fit=crop',
  marrakech:   'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800&h=416&fit=crop',
  morocco:     'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800&h=416&fit=crop',
  patagonia:   'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800&h=416&fit=crop',
  queenstown:  'https://images.unsplash.com/photo-1589871973318-9ca1258faa5d?w=800&h=416&fit=crop',
  new_zealand: 'https://images.unsplash.com/photo-1589871973318-9ca1258faa5d?w=800&h=416&fit=crop',
  default:     'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=416&fit=crop',
};

function getDestinationPhoto(destination: string): string {
  const lower = destination.toLowerCase();
  for (const key of Object.keys(DEST_PHOTOS)) {
    if (key !== 'default' && lower.includes(key)) return DEST_PHOTOS[key];
  }
  return DEST_PHOTOS.default;
}

interface TripCardProps {
  trip: Trip;
  onCardClick?: (tripId: string) => void;
}

const statusConfig = {
  planning: { label: 'Planning', className: 'bg-sky-800/90 text-white' },
  active: { label: '● Active', className: 'bg-emerald-500/90 text-white' },
  completed: { label: 'Completed', className: 'bg-black/50 text-white' },
};

export const TripCard: React.FC<TripCardProps> = ({ trip, onCardClick }) => {
  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  const daysCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const status = statusConfig[trip.status];

  return (
    <Link
      href={`/trip/${trip.id}/itinerary`}
      onClick={() => onCardClick?.(trip.id)}
      className="group block bg-white rounded-2xl overflow-hidden border border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
    >
      {/* Image — tall, editorial */}
      <div className="relative h-52 overflow-hidden bg-zinc-200">
        <Image
          src={trip.coverImage || getDestinationPhoto(trip.destination)}
          alt={trip.destination}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

        {/* Status badge — Cormorant italic */}
        <div className="absolute top-3 left-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full font-script italic text-sm backdrop-blur-sm ${status.className}`}>
            {status.label}
          </span>
        </div>

        {/* Duration badge */}
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-black/40 backdrop-blur-sm text-white">
            {daysCount}d
          </span>
        </div>

        {/* Destination name overlaid — Cormorant italic */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="font-script italic text-xl text-white/90 leading-tight drop-shadow-sm">{trip.destination}</p>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-script italic text-lg text-zinc-900 leading-snug mb-3 group-hover:text-sky-700 transition-colors">
          {trip.title}
        </h3>

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(startDate)} – {formatDate(endDate)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Users className="w-3 h-3" />
              <span>{trip.memberCount + trip.guestCount} travelers</span>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <span className="font-script italic text-xl text-zinc-900">${(trip.budgetTotal ?? 0).toLocaleString()}</span>
            <span className="text-xs text-zinc-400">total budget</span>
          </div>
        </div>

        {/* Hover CTA */}
        <div className="mt-3 pt-3 border-t border-zinc-50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-xs font-medium text-sky-700">View itinerary</span>
          <ArrowRight className="w-3.5 h-3.5 text-sky-700" />
        </div>
      </div>
    </Link>
  );
};
