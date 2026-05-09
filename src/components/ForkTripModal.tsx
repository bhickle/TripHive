'use client';

import React, { useEffect, useState } from 'react';
import { X, Calendar, Sparkles } from 'lucide-react';

interface ForkTripModalProps {
  open: boolean;
  destination: string;
  tripLength: number;
  forking: boolean;
  onClose: () => void;
  onSubmit: (dates: { startDate: string | null; endDate: string | null }) => void;
}

/**
 * Modal that pops up before /api/trips/[id]/fork runs. Lets the user pick
 * their own dates for the copy of the itinerary; end date auto-fills based
 * on the source trip's length but stays editable. Skipping is allowed —
 * the user can always set dates from inside the trip later.
 *
 * Used from /discover (community grid card) and /community/[id] (public
 * read-only view CTA). Both pages own the actual fork API call; this
 * modal just collects the dates and calls onSubmit.
 */
export function ForkTripModal({
  open,
  destination,
  tripLength,
  forking,
  onClose,
  onSubmit,
}: ForkTripModalProps) {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Reset dates whenever the modal opens so a previous selection doesn't
  // leak between fork attempts.
  useEffect(() => {
    if (open) {
      setStartDate('');
      setEndDate('');
    }
  }, [open]);

  // Auto-fill end date based on source trip length whenever start changes —
  // but only if the user hasn't already touched the end field.
  const [endTouched, setEndTouched] = useState(false);
  useEffect(() => {
    if (!startDate || endTouched) return;
    if (!tripLength || tripLength <= 0) return;
    const start = new Date(startDate + 'T00:00:00');
    if (isNaN(start.getTime())) return;
    const end = new Date(start);
    // tripLength is "days" — a 4-day trip ends 3 days after the start.
    end.setDate(end.getDate() + Math.max(0, tripLength - 1));
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, '0');
    const dd = String(end.getDate()).padStart(2, '0');
    setEndDate(`${yyyy}-${mm}-${dd}`);
  }, [startDate, tripLength, endTouched]);

  if (!open) return null;

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0">
            <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-1">
              Make it yours
            </h3>
            <p className="text-sm text-zinc-500">
              We&apos;ll copy this {tripLength > 0 ? `${tripLength}-day ` : ''}{destination} itinerary into a new trip you can edit.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={forking}
            className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors -mt-1 -mr-1 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Start
              </label>
              <input
                type="date"
                value={startDate}
                min={todayIso}
                onChange={e => setStartDate(e.target.value)}
                disabled={forking}
                className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent disabled:bg-zinc-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                End
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate || todayIso}
                onChange={e => { setEndDate(e.target.value); setEndTouched(true); }}
                disabled={forking}
                className="w-full px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent disabled:bg-zinc-50"
              />
            </div>
          </div>
          {tripLength > 0 && startDate && (
            <p className="text-xs text-zinc-400 inline-flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> End auto-filled for the original {tripLength}-day length — adjust if you&apos;d like.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={() => onSubmit({ startDate: null, endDate: null })}
            disabled={forking}
            className="text-sm text-zinc-500 hover:text-zinc-800 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Skip — I&apos;ll pick dates later
          </button>
          <button
            onClick={() => onSubmit({
              startDate: startDate || null,
              endDate: endDate || null,
            })}
            disabled={forking}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white text-sm font-semibold rounded-lg transition-all"
          >
            <Sparkles className="w-4 h-4" />
            {forking ? 'Copying itinerary…' : 'Use this itinerary'}
          </button>
        </div>
      </div>
    </div>
  );
}
