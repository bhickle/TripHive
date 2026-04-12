'use client';

import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Star, Utensils, Car, Bus, Train, Ticket, X, ExternalLink } from 'lucide-react';
import type { Activity, TransportLeg } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapViewProps {
  activities: Activity[];
  transportLegs?: TransportLeg[];
  destination: string;
}

interface PinData {
  id: string;
  kind: 'activity' | 'transport';
  label: string;
  sublabel?: string;
  timeSlot?: string;
  isRestaurant?: boolean;
  costEstimate?: number;
  address?: string;
  // Pseudo-coordinates for the mock layout (0-100 grid)
  x: number;
  y: number;
  transportType?: TransportLeg['type'];
}

// ─── Mock coordinate generator ────────────────────────────────────────────────
// In mock mode, places get deterministic pseudo-positions based on their index
// so the layout looks intentional and clusters make sense.

const MOCK_LAYOUTS: [number, number][] = [
  [28, 32], [55, 22], [72, 38], [62, 58], [38, 65],
  [18, 55], [45, 42], [80, 20], [30, 78], [65, 70],
  [50, 15], [15, 38], [85, 52], [42, 85], [70, 82],
];

const TRANSPORT_POSITIONS: [number, number][] = [
  [20, 25], [75, 45], [48, 68], [30, 50],
];

// ─── Pin icon factory ─────────────────────────────────────────────────────────

function getActivityColor(a: Activity) {
  if (a.isRestaurant) return { bg: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-200', tooltip: 'bg-amber-50 border-amber-200' };
  switch (a.priceLevel) {
    case 0: return { bg: 'bg-emerald-500', text: 'text-emerald-600', ring: 'ring-emerald-200', tooltip: 'bg-emerald-50 border-emerald-200' };
    case 3:
    case 4: return { bg: 'bg-violet-500', text: 'text-violet-600', ring: 'ring-violet-200', tooltip: 'bg-violet-50 border-violet-200' };
    default: return { bg: 'bg-sky-500', text: 'text-sky-600', ring: 'ring-sky-200', tooltip: 'bg-sky-50 border-sky-200' };
  }
}

function getTransportColor(type: TransportLeg['type']) {
  switch (type) {
    case 'car_rental': return { bg: 'bg-sky-600', text: 'text-sky-700', ring: 'ring-sky-200', tooltip: 'bg-sky-50 border-sky-200', icon: <Car className="w-3.5 h-3.5" /> };
    case 'bus': return { bg: 'bg-emerald-600', text: 'text-emerald-700', ring: 'ring-emerald-200', tooltip: 'bg-emerald-50 border-emerald-200', icon: <Bus className="w-3.5 h-3.5" /> };
    case 'train': return { bg: 'bg-violet-600', text: 'text-violet-700', ring: 'ring-violet-200', tooltip: 'bg-violet-50 border-violet-200', icon: <Train className="w-3.5 h-3.5" /> };
    case 'excursion': return { bg: 'bg-amber-600', text: 'text-amber-700', ring: 'ring-amber-200', tooltip: 'bg-amber-50 border-amber-200', icon: <Ticket className="w-3.5 h-3.5" /> };
  }
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function PinTooltip({
  pin,
  onClose,
}: {
  pin: PinData;
  onClose: () => void;
}) {
  const mapsUrl = pin.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pin.address)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pin.label)}`;

  const colorCfg = pin.kind === 'transport' && pin.transportType
    ? getTransportColor(pin.transportType)
    : { tooltip: 'bg-white border-slate-200' };

  return (
    <div className={`absolute z-30 w-52 rounded-xl shadow-xl border ${colorCfg.tooltip} p-3`}
      style={{ bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' }}>
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-current opacity-20" />

      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-semibold text-slate-900 text-sm leading-snug">{pin.label}</p>
        <button onClick={onClose} className="flex-shrink-0 w-5 h-5 rounded-full hover:bg-slate-100 flex items-center justify-center">
          <X className="w-3 h-3 text-slate-500" />
        </button>
      </div>
      {pin.sublabel && <p className="text-xs text-slate-500 mb-2">{pin.sublabel}</p>}
      {pin.timeSlot && (
        <p className="text-xs text-slate-400 mb-2">{pin.timeSlot}</p>
      )}
      {pin.costEstimate !== undefined && pin.costEstimate > 0 && (
        <p className="text-xs font-medium text-slate-600 mb-2">${pin.costEstimate} per person</p>
      )}
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-700">
        <Navigation className="w-3 h-3" />
        Navigate
        <ExternalLink className="w-3 h-3 ml-auto" />
      </a>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MapView({ activities, transportLegs = [], destination }: MapViewProps) {
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);

  // Check if Google Maps key is available (client-side env)
  useEffect(() => {
    setHasKey(!!process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY);
  }, []);

  // Build pin data
  const activityPins: PinData[] = activities.slice(0, 12).map((a, i) => {
    const [x, y] = MOCK_LAYOUTS[i % MOCK_LAYOUTS.length];
    return {
      id: a.id,
      kind: 'activity',
      label: a.title,
      sublabel: a.address,
      timeSlot: a.timeSlot,
      isRestaurant: a.isRestaurant,
      costEstimate: a.costEstimate,
      address: a.address,
      x, y,
    };
  });

  const transportPins: PinData[] = transportLegs.slice(0, 4).map((leg, i) => {
    const [x, y] = TRANSPORT_POSITIONS[i % TRANSPORT_POSITIONS.length];
    return {
      id: leg.id,
      kind: 'transport',
      label: leg.meetingPoint,
      sublabel: `${leg.meetTime ?? leg.departureTime} \u2192 ${leg.destination}`,
      address: leg.meetingPoint,
      transportType: leg.type,
      x, y,
    };
  });

  const allPins = [...activityPins, ...transportPins];

  // Legend
  const hasRestaurants = activityPins.some((p) => p.isRestaurant);
  const hasTransport = transportPins.length > 0;

  return (
    <div className="rounded-2xl border border-zinc-200 overflow-hidden bg-white shadow-sm">
      {/* Map area */}
      <div className="relative w-full" style={{ height: '420px' }}>

        {/* Mock map background */}
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-slate-50 to-emerald-50">
          {/* Mock street grid lines */}
          <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
            {/* Horizontal roads */}
            {[15, 28, 42, 57, 70, 84].map((y) => (
              <line key={`h${y}`} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`}
                stroke="#64748b" strokeWidth="1.5" />
            ))}
            {/* Vertical roads */}
            {[12, 25, 38, 52, 65, 78, 90].map((x) => (
              <line key={`v${x}`} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%"
                stroke="#64748b" strokeWidth="1.5" />
            ))}
            {/* A few diagonal accent roads */}
            <line x1="0" y1="60%" x2="40%" y2="0" stroke="#64748b" strokeWidth="1" />
            <line x1="60%" y1="100%" x2="100%" y2="30%" stroke="#64748b" strokeWidth="1" />
          </svg>

          {/* Mock water/park areas */}
          <div className="absolute" style={{ left: '58%', top: '8%', width: '25%', height: '14%' }}>
            <div className="w-full h-full rounded-2xl bg-sky-200/50 border border-sky-200" />
          </div>
          <div className="absolute" style={{ left: '5%', top: '60%', width: '18%', height: '20%' }}>
            <div className="w-full h-full rounded-xl bg-emerald-200/40 border border-emerald-200" />
          </div>

          {/* Destination label */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full border border-slate-200 shadow-sm">
            <MapPin className="w-3.5 h-3.5 text-sky-600" />
            <span className="text-xs font-semibold text-slate-700">{destination}</span>
            <span className="text-xs text-slate-400">&mdash; Mock Map</span>
          </div>
        </div>

        {/* Pins */}
        {allPins.map((pin) => {
          const isSelected = selectedPin === pin.id;

          const colorCfg = pin.kind === 'transport' && pin.transportType
            ? getTransportColor(pin.transportType)
            : getActivityColor({ isRestaurant: pin.isRestaurant, priceLevel: 1 } as Activity);

          return (
            <div
              key={pin.id}
              className="absolute"
              style={{
                left: `${pin.x}%`,
                top: `${pin.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: isSelected ? 25 : 10,
              }}
            >
              {/* Tooltip */}
              {isSelected && (
                <PinTooltip pin={pin} onClose={() => setSelectedPin(null)} />
              )}

              {/* Pin button */}
              <button
                onClick={() => setSelectedPin(isSelected ? null : pin.id)}
                className={`relative group flex items-center justify-center rounded-full shadow-lg transition-all duration-150 ring-2 ${
                  isSelected ? `scale-125 ring-4 ${colorCfg.ring}` : `ring-white hover:scale-110`
                } ${
                  pin.kind === 'transport' ? 'w-8 h-8' : 'w-7 h-7'
                } ${colorCfg.bg}`}
              >
                {pin.kind === 'transport' && pin.transportType ? (
                  <span className="text-white">
                    {getTransportColor(pin.transportType).icon}
                  </span>
                ) : pin.isRestaurant ? (
                  <Utensils className="w-3.5 h-3.5 text-white" />
                ) : (
                  <Star className="w-3 h-3 text-white" />
                )}
              </button>
            </div>
          );
        })}

        {/* No-key notice (shows in mock mode) */}
        {!hasKey && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm max-w-xs">
            <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">Demo map.</span> Add{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code>{' '}
              for a live map.
            </p>
          </div>
        )}
      </div>

      {/* Legend + activity list */}
      <div className="border-t border-slate-100 p-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center">
              <Star className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-xs text-slate-500">Activity</span>
          </div>
          {hasRestaurants && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                <Utensils className="w-2.5 h-2.5 text-white" />
              </div>
              <span className="text-xs text-slate-500">Restaurant</span>
            </div>
          )}
          {hasTransport && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-sky-600 flex items-center justify-center">
                <Car className="w-2.5 h-2.5 text-white" />
              </div>
              <span className="text-xs text-slate-500">Transport</span>
            </div>
          )}
          <div className="ml-auto">
            <span className="text-xs text-slate-400">{allPins.length} pins</span>
          </div>
        </div>

        {/* Scrollable activity list */}
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {activityPins.map((pin, i) => {
            const colorCfg = getActivityColor({ isRestaurant: pin.isRestaurant, priceLevel: 1 } as Activity);
            return (
              <button
                key={pin.id}
                onClick={() => setSelectedPin(pin.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  selectedPin === pin.id ? 'bg-sky-50 border border-sky-200' : 'hover:bg-slate-50'
                }`}
              >
                <div className={`w-5 h-5 rounded-full ${colorCfg.bg} flex items-center justify-center flex-shrink-0`}>
                  {pin.isRestaurant
                    ? <Utensils className="w-2.5 h-2.5 text-white" />
                    : <Star className="w-2.5 h-2.5 text-white" />
                  }
                </div>
                <span className="text-xs font-medium text-slate-700 truncate">{pin.label}</span>
                {pin.timeSlot && (
                  <span className="text-xs text-slate-400 flex-shrink-0 ml-auto">
                    {pin.timeSlot.split('\u2013')[0].trim()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
