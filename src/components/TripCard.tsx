'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, Users, ArrowRight } from 'lucide-react';
import { Trip } from '@/lib/types';

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
        {trip.coverImage && (
          <Image
            src={trip.coverImage}
            alt={trip.destination}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}
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
            <span className="font-script italic text-xl text-zinc-900">${trip.budgetTotal.toLocaleString()}</span>
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
