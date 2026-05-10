'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  tripId: string;
  /** AI-planned cities (from itineraries.days[].city) — pre-fill the chip input
   *  with these so the common case is one click to save. */
  aiCities: string[];
  /** Existing user-tagged cities (`trips.visited_cities`). Used when the user
   *  re-opens the modal to edit their saved list. */
  initialCities?: string[];
  onClose: () => void;
  /** Called after a successful save with the new cities array. */
  onSaved: (cities: string[]) => void;
}

/**
 * Tag-cities modal — chip input with AI cities pre-filled. PATCHes
 * /api/trips/[id] tripPatch.visited_cities and notifies the caller on success.
 */
export function TagCitiesModal({
  isOpen,
  tripId,
  aiCities,
  initialCities,
  onClose,
  onSaved,
}: Props) {
  const [chips, setChips] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state every time the modal opens. Pre-fill order:
  //   1. existing visited_cities (user is editing)
  //   2. fall through to aiCities (first time tagging)
  useEffect(() => {
    if (!isOpen) return;
    const seed = (initialCities && initialCities.length > 0) ? initialCities : aiCities;
    // Dedupe + drop empties; keep insertion order.
    const seen = new Set<string>();
    const next: string[] = [];
    for (const c of seed) {
      const trimmed = (c ?? '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(trimmed);
    }
    setChips(next);
    setInput('');
    setError(null);
    // Focus the input on open so the user can immediately add or dismiss chips.
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen, aiCities, initialCities]);

  // Esc closes the modal.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const addChip = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (chips.some(c => c.toLowerCase() === key)) return;
    setChips(prev => [...prev, trimmed]);
  };

  const removeChip = (index: number) => {
    setChips(prev => prev.filter((_, i) => i !== index));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChip(input);
      setInput('');
    } else if (e.key === 'Backspace' && input === '' && chips.length > 0) {
      // Backspace on empty input deletes the last chip — standard chip UX.
      removeChip(chips.length - 1);
    }
  };

  const removedSuggestions = aiCities.filter(c =>
    c && !chips.some(chip => chip.toLowerCase() === c.toLowerCase()),
  );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripPatch: { visited_cities: chips } }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      onSaved(chips);
      onClose();
    } catch {
      setError("Couldn't save your cities. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-cities-title"
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 id="tag-cities-title" className="text-lg font-semibold text-slate-900">Where did you actually go?</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tag the cities you visited. You can edit anytime.</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Cities visited</label>
            <div
              className="border border-slate-300 rounded-lg p-2 flex flex-wrap items-center gap-2 focus-within:ring-2 focus-within:ring-sky-700 focus-within:border-sky-700"
              onClick={() => inputRef.current?.focus()}
            >
              {chips.map((c, i) => (
                <span
                  key={`${c}-${i}`}
                  className="bg-sky-100 text-sky-900 text-sm px-3 py-1 rounded-full flex items-center gap-1.5"
                >
                  {c}
                  <button
                    onClick={() => removeChip(i)}
                    className="hover:text-sky-700"
                    aria-label={`Remove ${c}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={() => { if (input.trim()) { addChip(input); setInput(''); } }}
                placeholder={chips.length === 0 ? 'Type to add…' : ''}
                className="flex-1 min-w-[120px] outline-none text-sm py-1 bg-transparent"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Press Enter or comma to add</p>
          </div>

          {removedSuggestions.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Suggested from your itinerary</p>
              <div className="flex flex-wrap gap-2">
                {removedSuggestions.map(c => (
                  <button
                    key={c}
                    onClick={() => addChip(c)}
                    className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1 rounded-full"
                  >
                    + {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-600">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-slate-600 hover:text-slate-900 text-sm font-medium disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60"
          >
            {saving ? 'Saving…' : chips.length === 0 ? 'Save' : `Save ${chips.length} ${chips.length === 1 ? 'city' : 'cities'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
