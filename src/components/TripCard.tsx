'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calendar, Users, ArrowRight, Trash2, X } from 'lucide-react';
import { Trip } from '@/lib/types';

// Destination keyword → curated Unsplash photo
// Keywords are matched against the lowercase destination string — first match wins.
// Add more entries here whenever a new popular destination needs a specific photo.
const DEST_PHOTOS: Record<string, string> = {
  // Europe
  iceland:        'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&h=416&fit=crop',
  reykjavik:      'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800&h=416&fit=crop',
  paris:          'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=416&fit=crop',
  france:         'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=416&fit=crop',
  barcelona:      'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=416&fit=crop',
  madrid:         'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&h=416&fit=crop',
  spain:          'https://images.unsplash.com/photo-1504503926255-aeba45e5bf5e?w=800&h=416&fit=crop',
  italy:          'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=800&h=416&fit=crop',
  rome:           'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&h=416&fit=crop',
  florence:       'https://images.unsplash.com/photo-1541370976299-4d24ebbc9077?w=800&h=416&fit=crop',
  venice:         'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?w=800&h=416&fit=crop',
  amalfi:         'https://images.unsplash.com/photo-1533606688076-b6683a5f5f62?w=800&h=416&fit=crop',
  santorini:      'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&h=416&fit=crop',
  mykonos:        'https://images.unsplash.com/photo-1601581975053-7c4e56e5e6e1?w=800&h=416&fit=crop',
  greece:         'https://images.unsplash.com/photo-1527786356703-4b100091cd2c?w=800&h=416&fit=crop',
  athens:         'https://images.unsplash.com/photo-1603565816030-6b389eeb23cb?w=800&h=416&fit=crop',
  london:         'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&h=416&fit=crop',
  england:        'https://images.unsplash.com/photo-1486299267070-83823f5448dd?w=800&h=416&fit=crop',
  scotland:       'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800&h=416&fit=crop',
  edinburgh:      'https://images.unsplash.com/photo-1564951434112-64d74cc2a2d7?w=800&h=416&fit=crop',
  ireland:        'https://images.unsplash.com/photo-1590089415225-401ed6f9db8e?w=800&h=416&fit=crop',
  dublin:         'https://images.unsplash.com/photo-1549918864-48ac978761a4?w=800&h=416&fit=crop',
  amsterdam:      'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&h=416&fit=crop',
  netherlands:    'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=800&h=416&fit=crop',
  prague:         'https://images.unsplash.com/photo-1541849546-216549ae216d?w=800&h=416&fit=crop',
  budapest:       'https://images.unsplash.com/photo-1565426873118-a17ed65d74b9?w=800&h=416&fit=crop',
  vienna:         'https://images.unsplash.com/photo-1516550893885-985c836c4fc4?w=800&h=416&fit=crop',
  berlin:         'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=800&h=416&fit=crop',
  germany:        'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&h=416&fit=crop',
  munich:         'https://images.unsplash.com/photo-1595867818082-083862f3d630?w=800&h=416&fit=crop',
  zurich:         'https://images.unsplash.com/photo-1515488764276-beab7607c1e6?w=800&h=416&fit=crop',
  switzerland:    'https://images.unsplash.com/photo-1527004013197-933c4bb611b3?w=800&h=416&fit=crop',
  lisbon:         'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&h=416&fit=crop',
  portugal:       'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&h=416&fit=crop',
  stockholm:      'https://images.unsplash.com/photo-1509356843151-3e7d96241e11?w=800&h=416&fit=crop',
  norway:         'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&h=416&fit=crop',
  oslo:           'https://images.unsplash.com/photo-1572120360610-d971b9d7767c?w=800&h=416&fit=crop',
  copenhagen:     'https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?w=800&h=416&fit=crop',
  finland:        'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=416&fit=crop',
  croatia:        'https://images.unsplash.com/photo-1555990793-da11153b2473?w=800&h=416&fit=crop',
  dubrovnik:      'https://images.unsplash.com/photo-1555990793-da11153b2473?w=800&h=416&fit=crop',
  // Middle East & Africa
  marrakech:      'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800&h=416&fit=crop',
  morocco:        'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800&h=416&fit=crop',
  dubai:          'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800&h=416&fit=crop',
  'abu dhabi':    'https://images.unsplash.com/photo-1533395427226-788cee21cc9e?w=800&h=416&fit=crop',
  cairo:          'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?w=800&h=416&fit=crop',
  egypt:          'https://images.unsplash.com/photo-1539768942893-daf53e448371?w=800&h=416&fit=crop',
  kenya:          'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&h=416&fit=crop',
  safari:         'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800&h=416&fit=crop',
  'south africa': 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&h=416&fit=crop',
  'cape town':    'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800&h=416&fit=crop',
  tanzania:       'https://images.unsplash.com/photo-1585591360464-f1de9c2e54d8?w=800&h=416&fit=crop',
  // Asia
  tokyo:          'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=416&fit=crop',
  kyoto:          'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=416&fit=crop',
  japan:          'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=416&fit=crop',
  osaka:          'https://images.unsplash.com/photo-1590559899731-a382839e5549?w=800&h=416&fit=crop',
  bali:           'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=416&fit=crop',
  indonesia:      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=416&fit=crop',
  'bangkok':      'https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=800&h=416&fit=crop',
  thailand:       'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&h=416&fit=crop',
  'chiang mai':   'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800&h=416&fit=crop',
  vietnam:        'https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800&h=416&fit=crop',
  'ha long':      'https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800&h=416&fit=crop',
  'ho chi minh':  'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&h=416&fit=crop',
  hanoi:          'https://images.unsplash.com/photo-1555921015-5532091f6026?w=800&h=416&fit=crop',
  singapore:      'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&h=416&fit=crop',
  'hong kong':    'https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=800&h=416&fit=crop',
  china:          'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=416&fit=crop',
  beijing:        'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=416&fit=crop',
  shanghai:       'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=800&h=416&fit=crop',
  india:          'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&h=416&fit=crop',
  mumbai:         'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?w=800&h=416&fit=crop',
  delhi:          'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&h=416&fit=crop',
  rajasthan:      'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&h=416&fit=crop',
  maldives:       'https://images.unsplash.com/photo-1514282401047-d79a71a590e8?w=800&h=416&fit=crop',
  'sri lanka':    'https://images.unsplash.com/photo-1546708770-599a3abdf230?w=800&h=416&fit=crop',
  nepal:          'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&h=416&fit=crop',
  // Americas
  'new york':     'https://images.unsplash.com/photo-1518235506717-e1ed3306a89b?w=800&h=416&fit=crop',
  nyc:            'https://images.unsplash.com/photo-1518235506717-e1ed3306a89b?w=800&h=416&fit=crop',
  'los angeles':  'https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?w=800&h=416&fit=crop',
  miami:          'https://images.unsplash.com/photo-1514214246283-d427a95c5d2f?w=800&h=416&fit=crop',
  'new orleans':  'https://images.unsplash.com/photo-1571893544028-06b07af6dade?w=800&h=416&fit=crop',
  hawaii:         'https://images.unsplash.com/photo-1507876373175-9e5b2a0d5b7c?w=800&h=416&fit=crop',
  maui:           'https://images.unsplash.com/photo-1507876373175-9e5b2a0d5b7c?w=800&h=416&fit=crop',
  'las vegas':    'https://images.unsplash.com/photo-1581351721010-8cf859cb14a4?w=800&h=416&fit=crop',
  chicago:        'https://images.unsplash.com/photo-1494522358652-f30e61a60313?w=800&h=416&fit=crop',
  canada:         'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&h=416&fit=crop',
  vancouver:      'https://images.unsplash.com/photo-1560814304-4f05b62af116?w=800&h=416&fit=crop',
  toronto:        'https://images.unsplash.com/photo-1517935706615-2717063c2225?w=800&h=416&fit=crop',
  mexico:         'https://images.unsplash.com/photo-1585464231875-d9ef1f5ad396?w=800&h=416&fit=crop',
  cancun:         'https://images.unsplash.com/photo-1510097467424-192d713fd8b2?w=800&h=416&fit=crop',
  'mexico city':  'https://images.unsplash.com/photo-1585464231875-d9ef1f5ad396?w=800&h=416&fit=crop',
  colombia:       'https://images.unsplash.com/photo-1585208798174-6cedd86e019a?w=800&h=416&fit=crop',
  cartagena:      'https://images.unsplash.com/photo-1548963670-1f4e5d9f82cd?w=800&h=416&fit=crop',
  peru:           'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&h=416&fit=crop',
  'machu picchu': 'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800&h=416&fit=crop',
  brazil:         'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=800&h=416&fit=crop',
  'rio de janeiro':'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=800&h=416&fit=crop',
  argentina:      'https://images.unsplash.com/photo-1589909202802-8f4aadce5b35?w=800&h=416&fit=crop',
  'buenos aires': 'https://images.unsplash.com/photo-1589909202802-8f4aadce5b35?w=800&h=416&fit=crop',
  patagonia:      'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800&h=416&fit=crop',
  'costa rica':   'https://images.unsplash.com/photo-1581761137880-c3b34ef06001?w=800&h=416&fit=crop',
  // Oceania
  queenstown:     'https://images.unsplash.com/photo-1589871973318-9ca1258faa5d?w=800&h=416&fit=crop',
  'new zealand':  'https://images.unsplash.com/photo-1589871973318-9ca1258faa5d?w=800&h=416&fit=crop',
  sydney:         'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&h=416&fit=crop',
  australia:      'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=800&h=416&fit=crop',
  melbourne:      'https://images.unsplash.com/photo-1545044846-351ba102b6d5?w=800&h=416&fit=crop',
  fiji:           'https://images.unsplash.com/photo-1548402977-a6eed5d90f53?w=800&h=416&fit=crop',
  // Default fallback
  default:        'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=416&fit=crop',
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
  onDelete?: (tripId: string) => void;
}

const statusConfig = {
  planning: { label: 'Planning', className: 'bg-sky-800/90 text-white' },
  active: { label: '● Active', className: 'bg-emerald-500/90 text-white' },
  completed: { label: 'Completed', className: 'bg-black/50 text-white' },
};

export const TripCard: React.FC<TripCardProps> = ({ trip, onCardClick, onDelete }) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const startDate = new Date(trip.startDate);
  const endDate = new Date(trip.endDate);
  // Prefer the builder-selected trip length over date-diff.
  // For flexible-date trips the stored dates span the availability window
  // (e.g. "anytime in June"), making date-diff much larger than the actual trip.
  const dateDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysCount = (trip.tripLength && trip.tripLength > 0) ? trip.tripLength : dateDiff;
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const status = statusConfig[trip.status];

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      if (res.ok) onDelete?.(trip.id);
    } catch { /* silently fail */ } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

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

        {/* Duration badge + delete button */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-black/40 backdrop-blur-sm text-white">
            {daysCount}d
          </span>
          {onDelete && (
            <button
              onClick={handleDelete}
              title={confirmDelete ? 'Click again to confirm delete' : 'Delete trip'}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-sm transition-all ${
                confirmDelete
                  ? 'bg-rose-600 text-white'
                  : 'bg-black/40 text-white/70 hover:bg-rose-600/80 hover:text-white opacity-0 group-hover:opacity-100'
              }`}
            >
              {confirmDelete ? (
                deleting ? '…' : <><Trash2 className="w-3 h-3" /> Sure?</>
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
            </button>
          )}
          {confirmDelete && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(false); }}
              className="flex items-center px-1.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white/70 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
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

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(startDate)} – {formatDate(endDate)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Users className="w-3 h-3" />
            <span>{trip.memberCount + trip.guestCount} {(trip.memberCount + trip.guestCount) === 1 ? 'traveler' : 'travelers'}</span>
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
