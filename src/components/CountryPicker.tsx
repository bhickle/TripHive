'use client';

import { useState } from 'react';
import { getCountries } from '@/lib/world/countries';

/**
 * Searchable country picker (flags + type-to-filter). Used by onboarding and
 * Settings to set the user's home country (profiles.home_country), which
 * personalizes the Trip Essentials visa/entry note on every itinerary build.
 *
 * `value` is the selected country NAME (what we persist + feed the prompt).
 * `inputClassName` lets each surface match its own field styling.
 */
export default function CountryPicker({
  value,
  onChange,
  inputClassName = 'w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700',
  placeholder = 'Start typing your country…',
}: {
  value: string;
  onChange: (country: string) => void;
  inputClassName?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const countries = getCountries();
  const q = query.trim().toLowerCase();
  const matches = (q ? countries.filter(c => c.name.toLowerCase().includes(q)) : countries).slice(0, 8);

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        // Delay close so a dropdown click registers before blur fires.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        className={inputClassName}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {matches.map((c) => (
            <button
              key={c.code}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(c.name); setQuery(''); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-sky-50 transition-colors"
            >
              <span className="text-lg">{c.flag}</span>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
