'use client';

import React, { useState, useEffect } from 'react';
import { Droplets } from 'lucide-react';

interface WeatherDay {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipProb: number;
}

export interface WeatherWidgetProps {
  /** Destination name — used for geocoding. */
  destination: string;
  /** Trip start date in YYYY-MM-DD format. Used to align the forecast window. */
  startDate?: string;
  /** Trip end date in YYYY-MM-DD format. */
  endDate?: string;
}

/** WMO weather interpretation codes → display info. */
const WMO: Record<number, { label: string; emoji: string }> = {
  0:  { label: 'Clear sky',            emoji: '☀️' },
  1:  { label: 'Mainly clear',         emoji: '🌤️' },
  2:  { label: 'Partly cloudy',        emoji: '⛅' },
  3:  { label: 'Overcast',             emoji: '☁️' },
  45: { label: 'Foggy',                emoji: '🌫️' },
  48: { label: 'Icy fog',              emoji: '🌫️' },
  51: { label: 'Light drizzle',        emoji: '🌦️' },
  53: { label: 'Drizzle',              emoji: '🌦️' },
  55: { label: 'Heavy drizzle',        emoji: '🌦️' },
  61: { label: 'Light rain',           emoji: '🌧️' },
  63: { label: 'Rain',                 emoji: '🌧️' },
  65: { label: 'Heavy rain',           emoji: '🌧️' },
  71: { label: 'Light snow',           emoji: '🌨️' },
  73: { label: 'Snow',                 emoji: '❄️' },
  75: { label: 'Heavy snow',           emoji: '❄️' },
  77: { label: 'Snow grains',          emoji: '🌨️' },
  80: { label: 'Rain showers',         emoji: '🌦️' },
  81: { label: 'Showers',              emoji: '🌦️' },
  82: { label: 'Heavy showers',        emoji: '🌧️' },
  85: { label: 'Snow showers',         emoji: '🌨️' },
  86: { label: 'Heavy snow showers',   emoji: '❄️' },
  95: { label: 'Thunderstorm',         emoji: '⛈️' },
  96: { label: 'Thunderstorm + hail',  emoji: '⛈️' },
  99: { label: 'Thunderstorm + hail',  emoji: '⛈️' },
};

function getWeatherInfo(code: number) {
  return WMO[code] ?? { label: 'Mixed conditions', emoji: '🌡️' };
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function displayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Open-Meteo forecast window: 16 days from today. */
const MAX_FORECAST_DAYS = 16;

export function WeatherWidget({ destination, startDate, endDate }: WeatherWidgetProps) {
  const [days, setDays] = useState<WeatherDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooFarOut, setTooFarOut] = useState(false);
  const [locationName, setLocationName] = useState('');

  useEffect(() => {
    const dest = destination?.trim();
    if (!dest || dest === 'your destination') return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTooFarOut(false);
    setDays([]);

    (async () => {
      try {
        // ── 1. Geocode destination ────────────────────────────────────────────
        // Extract first city/country name (handles "Paris, France & Rome, Italy" → "Paris")
        const primaryDest = dest.split(/[,&/]|\band\b/i)[0].trim();
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(primaryDest)}&count=1&language=en&format=json`
        );
        const geoData = await geoRes.json();
        if (cancelled) return;

        if (!geoData.results?.length) {
          setError('Location not found — check the destination name.');
          return;
        }

        const { latitude, longitude, name, country } = geoData.results[0];
        setLocationName(`${name}, ${country}`);

        // ── 2. Determine forecast window ─────────────────────────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const maxForecastDate = new Date(today);
        maxForecastDate.setDate(today.getDate() + MAX_FORECAST_DAYS - 1);

        let windowStart = startDate ? new Date(startDate + 'T00:00:00') : new Date(today);
        let windowEnd   = endDate   ? new Date(endDate   + 'T00:00:00') : new Date(windowStart);
        if (!endDate) windowEnd.setDate(windowStart.getDate() + 6); // default 7-day view

        // If the entire trip is beyond the forecast window, say so
        if (windowStart > maxForecastDate) {
          setTooFarOut(true);
          return;
        }

        // Clamp start to today (can't forecast the past)
        if (windowStart < today) windowStart = new Date(today);
        // Clamp end to max forecast window
        if (windowEnd > maxForecastDate) windowEnd = new Date(maxForecastDate);

        // ── 3. Fetch forecast ─────────────────────────────────────────────────
        const forecastUrl =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${latitude}&longitude=${longitude}` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&timezone=auto` +
          `&start_date=${fmt(windowStart)}&end_date=${fmt(windowEnd)}`;

        const fcRes = await fetch(forecastUrl);
        const fcData = await fcRes.json();
        if (cancelled) return;

        if (!fcData.daily?.time?.length) {
          setError('No forecast data returned.');
          return;
        }

        setDays(
          (fcData.daily.time as string[]).map((date, i) => ({
            date,
            weatherCode:  fcData.daily.weather_code[i] as number,
            tempMax:      Math.round(fcData.daily.temperature_2m_max[i] as number),
            tempMin:      Math.round(fcData.daily.temperature_2m_min[i] as number),
            precipProb:   (fcData.daily.precipitation_probability_max[i] as number) ?? 0,
          }))
        );
      } catch {
        if (!cancelled) setError('Unable to load forecast — check your connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [destination, startDate, endDate]);

  const dest = destination?.trim();
  if (!dest || dest === 'your destination') return null;

  return (
    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
        <span className="text-2xl">🌤️</span>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-zinc-900 text-sm">Weather Forecast</h4>
          <p className="text-xs text-zinc-400 truncate">{locationName || dest}</p>
        </div>
        <a
          href={`https://weather.com/weather/tenday/l/${encodeURIComponent(primaryDest(dest))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-700 hover:text-sky-800 font-medium whitespace-nowrap flex-shrink-0"
        >
          Full forecast ↗
        </a>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center gap-3 px-5 py-5 text-sm text-zinc-500">
          <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Loading forecast for {locationName || dest}…
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="px-5 py-4 text-sm text-zinc-500">
          {error}{' '}
          <a
            href={`https://weather.com/weather/tenday/l/${encodeURIComponent(dest)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-700 underline"
          >
            Check manually ↗
          </a>
        </div>
      )}

      {/* ── Too far out ── */}
      {!loading && tooFarOut && (
        <div className="px-5 py-4">
          <p className="text-sm text-zinc-600 font-medium">Forecast not yet available</p>
          <p className="text-xs text-zinc-400 mt-1">
            Open-Meteo provides up to 16 days ahead. Check back closer to your trip.
          </p>
        </div>
      )}

      {/* ── Forecast rows ── */}
      {!loading && !error && !tooFarOut && days.length > 0 && (
        <div>
          {days.map((day, i) => {
            const info = getWeatherInfo(day.weatherCode);
            const isToday = i === 0 && !startDate;
            return (
              <div
                key={day.date}
                className="flex items-center gap-3 px-5 py-3 border-b border-zinc-50 last:border-b-0 hover:bg-zinc-50/50 transition-colors"
              >
                <p className="text-xs text-zinc-500 w-28 flex-shrink-0">
                  {isToday ? 'Today' : displayDate(day.date)}
                </p>
                <span className="text-xl flex-shrink-0" title={info.label}>{info.emoji}</span>
                <p className="text-xs text-zinc-600 flex-1 min-w-0 truncate">{info.label}</p>
                {day.precipProb > 0 && (
                  <div className="flex items-center gap-1 text-xs text-zinc-400 flex-shrink-0">
                    <Droplets className="w-3 h-3 text-sky-400" />
                    <span>{day.precipProb}%</span>
                  </div>
                )}
                <div className="text-xs font-semibold flex-shrink-0 w-20 text-right">
                  <span className="text-rose-500">{day.tempMax}°</span>
                  <span className="text-zinc-300 mx-1">/</span>
                  <span className="text-sky-600">{day.tempMin}°C</span>
                </div>
              </div>
            );
          })}

          {/* ── Packing tip based on conditions ── */}
          <PackingTip days={days} />
        </div>
      )}
    </div>
  );
}

/** Returns the primary destination name (before any comma/& delimiter). */
function primaryDest(dest: string): string {
  return dest.split(/[,&/]|\band\b/i)[0].trim();
}

/** Simple packing nudge derived from the forecast data. */
function PackingTip({ days }: { days: WeatherDay[] }) {
  const avgMax = days.reduce((s, d) => s + d.tempMax, 0) / days.length;
  const maxPrecip = Math.max(...days.map(d => d.precipProb));
  const hasSnow = days.some(d => [71, 73, 75, 77, 85, 86].includes(d.weatherCode));
  const hasStorm = days.some(d => [95, 96, 99].includes(d.weatherCode));

  let tip = '';
  if (hasStorm)         tip = '⛈️ Thunderstorms likely — pack a compact umbrella and avoid outdoor plans in the evenings.';
  else if (hasSnow)     tip = '❄️ Snow expected — waterproof boots, a warm coat, and layers are essential.';
  else if (maxPrecip > 60) tip = '🌧️ High chance of rain — a good waterproof jacket and packable umbrella will save the day.';
  else if (avgMax < 10) tip = '🧥 Cold ahead — pack thermal layers, a windproof outer layer, and warm accessories.';
  else if (avgMax < 20) tip = '🧣 Mild but cool — light layers and a versatile jacket should cover it.';
  else if (avgMax > 30) tip = '☀️ Hot trip — lightweight breathable clothing, sunscreen, and a reusable water bottle.';
  else                  tip = '👌 Comfortable weather — mix of light layers should work well.';

  return (
    <div className="mx-5 my-3 px-4 py-3 bg-sky-50 rounded-xl border border-sky-100">
      <p className="text-xs text-sky-800 leading-relaxed">{tip}</p>
    </div>
  );
}
