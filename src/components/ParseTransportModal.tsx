'use client';

import React, { useState } from 'react';
import {
  X, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Car, Bus, TrainFront, Compass, ChevronDown, ChevronUp,
  MapPin, Clock, Users, Hash, DollarSign, RotateCcw,
} from 'lucide-react';
import { TransportLeg } from '@/lib/types';

// ─── Transport display config (mirrors itinerary page) ───────────────────────

const transportConfig: Record<
  TransportLeg['type'],
  { icon: React.ReactNode; label: string; badgeBg: string; badgeText: string; borderColor: string; dotColor: string }
> = {
  car_rental: {
    icon: <Car className="w-4 h-4" />,
    label: 'Car Rental',
    dotColor: 'bg-amber-400',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    borderColor: 'border-amber-200',
  },
  bus: {
    icon: <Bus className="w-4 h-4" />,
    label: 'Bus / Coach',
    dotColor: 'bg-indigo-400',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-700',
    borderColor: 'border-indigo-200',
  },
  train: {
    icon: <TrainFront className="w-4 h-4" />,
    label: 'Train',
    dotColor: 'bg-emerald-400',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    borderColor: 'border-emerald-200',
  },
  excursion: {
    icon: <Compass className="w-4 h-4" />,
    label: 'Excursion Pickup',
    dotColor: 'bg-rose-400',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    borderColor: 'border-rose-200',
  },
};

// ─── Inline preview of the parsed transport card ─────────────────────────────

function TransportPreview({ leg }: { leg: TransportLeg }) {
  const [expanded, setExpanded] = useState(true);
  const cfg = transportConfig[leg.type];
  const hasDetails = !!(leg.operator || leg.confirmationRef || leg.notes || leg.carClass ||
    leg.fromStation || leg.toStation || leg.platform || leg.seatInfo || leg.costPerPerson);

  return (
    <div className={`rounded-2xl border ${cfg.borderColor} overflow-hidden`}>
      <div className="p-4 bg-white">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`flex-shrink-0 ${cfg.badgeBg} ${cfg.badgeText} p-1.5 rounded-lg`}>
              {cfg.icon}
            </span>
            <div className="min-w-0">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.badgeText}`}>{cfg.label}</span>
              <p className="text-zinc-900 font-bold text-sm leading-snug">{leg.destination}</p>
            </div>
          </div>
          {hasDetails && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex-shrink-0 p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 transition-colors"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {leg.meetTime && (
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
              <p className="text-xs font-semibold text-zinc-700">
                Meet at <span className="text-zinc-900">{leg.meetTime}</span>
              </p>
            </div>
          )}
          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-500">{leg.meetingPoint}</p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
            <p className="text-xs text-zinc-500">
              Departs <span className="font-semibold text-zinc-700">{leg.departureTime}</span>
              {leg.duration && <span className="text-zinc-400"> · {leg.duration}</span>}
            </p>
          </div>
        </div>
      </div>
      {expanded && hasDetails && (
        <div className={`border-t ${cfg.borderColor} px-4 py-3 bg-zinc-50 flex flex-col gap-2`}>
          {leg.operator && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Operator</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.operator}</span>
            </div>
          )}
          {leg.carClass && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Vehicle</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.carClass}</span>
            </div>
          )}
          {(leg.fromStation || leg.toStation) && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Route</span>
              <span className="text-zinc-700 text-xs font-medium">
                {leg.fromStation}{leg.fromStation && leg.toStation ? ' → ' : ''}{leg.toStation}
              </span>
            </div>
          )}
          {leg.platform && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Platform</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.platform}</span>
            </div>
          )}
          {leg.seatInfo && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Seat</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.seatInfo}</span>
            </div>
          )}
          {leg.confirmationRef && (
            <div className="flex items-center gap-2">
              <Hash className="w-3 h-3 text-zinc-300 flex-shrink-0" />
              <span className="text-zinc-500 text-xs">Ref:</span>
              <span className="text-zinc-800 text-xs font-mono font-semibold tracking-wide">{leg.confirmationRef}</span>
            </div>
          )}
          {leg.costPerPerson !== undefined && (
            <div className="flex items-center gap-2">
              <DollarSign className="w-3 h-3 text-zinc-300 flex-shrink-0" />
              <span className="text-zinc-700 text-xs font-medium">${leg.costPerPerson} per person</span>
            </div>
          )}
          {leg.notes && (
            <div className="flex items-start gap-2 pt-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-zinc-500 text-xs leading-relaxed">{leg.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Example confirmations for the placeholder ───────────────────────────────

const EXAMPLES = [
  `Hertz Rental Confirmation #HRZ-29104B\nPickup: Keflavik International Airport, Arrivals Hall\nDate: Sept 15 at 3:45 PM\nVehicle: Dacia Duster 4x4 SUV\nPickup code: 4412\nRate: $42/day per person`,
  `Your Trainline booking is confirmed!\nLondon St Pancras → Paris Gare du Nord\nDeparture: 09:31 · Platform 5\nSeat: Coach 3, Seat 22A\nRef: TL-88210X · £89pp`,
  `Reykjavik Excursions — Golden Circle Tour\nBooking: RE-GC-88210\nPickup: Hotel Borg front entrance at 9:15 AM\nDeparture: 9:30 AM sharp\nExpected return: 6:00 PM\nCost: $89 per person`,
  `Strætó Bus Confirmation\nRoute 55 — Reykjavik → Blue Lagoon\nDepart: Mjódd Terminal, Bay 7 at 11:00\nRef: SRT-7741 · €8 per person\nBe at the terminal by 10:45`,
];

// ─── Main Modal ───────────────────────────────────────────────────────────────

type ParseState = 'idle' | 'parsing' | 'success' | 'error';

interface ParseTransportModalProps {
  dayNumber: number;
  dayDate: string;
  onAdd: (leg: TransportLeg) => void;
  onClose: () => void;
}

export function ParseTransportModal({ dayNumber, dayDate, onAdd, onClose }: ParseTransportModalProps) {
  const [emailText, setEmailText] = useState('');
  const [parseState, setParseState] = useState<ParseState>('idle');
  const [parsedLeg, setParsedLeg] = useState<TransportLeg | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [exampleIdx] = useState(() => Math.floor(Math.random() * EXAMPLES.length));

  const formattedDate = new Date(dayDate).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  const handleParse = async () => {
    if (!emailText.trim()) return;
    setParseState('parsing');
    setErrorMessage('');
    setParsedLeg(null);

    try {
      const res = await fetch('/api/parse-transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailText }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.message ?? 'Something went wrong — please try again.');
      }

      setParsedLeg(data.transportLeg);
      setParseState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong — please try again.');
      setParseState('error');
    }
  };

  const handleReset = () => {
    setParseState('idle');
    setParsedLeg(null);
    setErrorMessage('');
  };

  const handleConfirm = () => {
    if (parsedLeg) {
      onAdd(parsedLeg);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-zinc-100 flex items-start justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 bg-sky-800 rounded-lg flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <h2 className="text-zinc-900 text-lg font-bold">Import from Confirmation</h2>
            </div>
            <p className="text-zinc-400 text-sm">
              Paste any booking confirmation — car rental, bus, train, or excursion — and AI will extract the details.
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Adding to <span className="font-semibold text-zinc-600">Day {dayNumber} · {formattedDate}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors flex-shrink-0 ml-4"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Paste area — always visible so user can edit */}
          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block mb-2">
              Booking confirmation text
            </label>
            <textarea
              value={emailText}
              onChange={e => { setEmailText(e.target.value); if (parseState !== 'idle') handleReset(); }}
              placeholder={`Paste your confirmation here — e.g:\n\n${EXAMPLES[exampleIdx]}`}
              rows={7}
              className="w-full text-sm text-zinc-700 placeholder:text-zinc-300 bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400 transition-all font-mono leading-relaxed"
            />
            <p className="text-[11px] text-zinc-400 mt-1.5">
              Works with email body text, SMS confirmations, or copied booking pages. The more text the better.
            </p>
          </div>

          {/* Parsed result */}
          {parseState === 'success' && parsedLeg && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-700">Looks good! Review before adding.</p>
                <button
                  onClick={handleReset}
                  className="ml-auto flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Re-parse
                </button>
              </div>
              <TransportPreview leg={parsedLeg} />
            </div>
          )}

          {/* Error state */}
          {parseState === 'error' && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-700 mb-0.5">Couldn&apos;t parse that</p>
                <p className="text-xs text-rose-600">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Supported types legend */}
          {parseState === 'idle' && (
            <div className="flex flex-wrap gap-2">
              {(['car_rental', 'bus', 'train', 'excursion'] as const).map(type => {
                const cfg = transportConfig[type];
                return (
                  <span key={type} className={`flex items-center gap-1.5 ${cfg.badgeBg} ${cfg.badgeText} text-xs font-semibold px-3 py-1.5 rounded-full border ${cfg.borderColor}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-4 border-t border-zinc-100 flex gap-3 flex-shrink-0">
          {parseState === 'success' && parsedLeg ? (
            <>
              <button
                onClick={handleReset}
                className="flex-1 py-3 border border-zinc-200 rounded-full text-zinc-600 font-semibold text-sm hover:bg-zinc-50 transition-all"
              >
                Try Again
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 bg-gradient-to-r from-sky-800 to-green-700 hover:from-sky-700 hover:to-green-600 text-white font-bold rounded-full text-sm transition-all shadow-md"
              >
                Add to Day {dayNumber} ✓
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-zinc-200 rounded-full text-zinc-600 font-semibold text-sm hover:bg-zinc-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleParse}
                disabled={parseState === 'parsing' || emailText.trim().length < 20}
                className="flex-1 py-3 bg-gradient-to-r from-sky-800 to-green-700 hover:from-sky-700 hover:to-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-full text-sm transition-all shadow-md flex items-center justify-center gap-2"
              >
                {parseState === 'parsing' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Parsing…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Parse Confirmation
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
