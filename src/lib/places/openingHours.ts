/**
 * Post-generation opening-hours correction.
 *
 * The problem (reported by Brandon, Tivoli Gardens): a theme-park / attraction
 * day told the group to meet at 9:30, but the note said the park doesn't open
 * until 11:00. The "start the day at the park" rule fired, but the model used a
 * generic early start instead of the venue's REAL opening time — even though the
 * prompt tells it to. Relying on the model to honor that is the weak link.
 *
 * This is the deterministic backstop: after a day passes location verification,
 * look up its anchor activity's real Google Places opening hours for that day's
 * weekday. If the activity's start (and the day's meetupTime) is before opening,
 * shift them to opening. Same spirit as verify-before-show — don't surface a
 * broken schedule; fix it server-side.
 *
 * EVERYTHING here is fail-open: any lookup failure, parse failure, missing data,
 * or unexpected shape leaves the day exactly as-is. Worst case it does nothing —
 * it can never break or stall a build.
 */

import type { ItineraryDay, Activity } from '@/lib/types';

// ─── Time parsing helpers ─────────────────────────────────────────────────────

/** "07:30" / "7:30" (24h) → minutes since midnight, or null. */
function parse24hToMinutes(s: string | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** minutes since midnight → "HH:MM" (24h, zero-padded). */
function minutesTo24h(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "11:00 AM" / "9:00 PM" / "12:00 AM" (Google 12h) → minutes since midnight, or null. */
function parse12hToMinutes(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const isPm = m[3].toLowerCase() === 'p';
  if (h < 1 || h > 12 || min > 59) return null;
  if (h === 12) h = 0;          // 12 AM = 0, 12 PM handled by +12 below
  if (isPm) h += 12;
  return h * 60 + min;
}

/**
 * Pull the start time of an activity's timeSlot. Handles "07:30–09:00" (en-dash),
 * "07:30-09:00" (hyphen), or a bare "07:30". Returns minutes since midnight.
 */
function activityStartMinutes(timeSlot: string | undefined): number | null {
  if (!timeSlot) return null;
  const start = timeSlot.split(/[–-]/)[0]?.trim();
  return parse24hToMinutes(start);
}

/** Rewrite an activity's timeSlot to a new start, preserving the original
 *  duration when the slot was a range. */
function shiftTimeSlot(timeSlot: string, newStartMins: number): string {
  const parts = timeSlot.split(/[–-]/).map(p => p.trim());
  const oldStart = parse24hToMinutes(parts[0]);
  const oldEnd = parts[1] ? parse24hToMinutes(parts[1]) : null;
  if (oldStart != null && oldEnd != null && oldEnd > oldStart) {
    const duration = oldEnd - oldStart;
    return `${minutesTo24h(newStartMins)}–${minutesTo24h(newStartMins + duration)}`;
  }
  // No parseable range — just set the start.
  return minutesTo24h(newStartMins);
}

// ─── Weekday + opening-hours extraction ──────────────────────────────────────

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** English weekday name for a YYYY-MM-DD date string, noon-padded so the date
 *  parses in local time (avoids a UTC-midnight off-by-one). Null if unparseable. */
function weekdayName(dateStr: string | undefined): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return WEEKDAYS[d.getDay()] ?? null;
}

/**
 * From Google's weekdayDescriptions (["Monday: 11:00 AM – 9:00 PM", …]) and a
 * weekday name, return that day's OPENING minutes since midnight. Returns null
 * when closed, open-24h, unparseable, or the weekday isn't present — all of
 * which we treat as "don't touch the schedule".
 */
function openingMinutesForWeekday(weekdayDescriptions: string[] | undefined, weekday: string): number | null {
  if (!Array.isArray(weekdayDescriptions)) return null;
  const line = weekdayDescriptions.find(l => l.toLowerCase().startsWith(weekday.toLowerCase() + ':'));
  if (!line) return null;
  const after = line.slice(line.indexOf(':') + 1).trim();
  if (/closed/i.test(after)) return null;       // closed that day — leave the AI's plan alone
  if (/24\s*hours|open 24/i.test(after)) return null; // 24h — no opening constraint
  // First clock token with AM/PM is the opening time.
  const m = after.match(/(\d{1,2}:\d{2}\s*[AaPp][Mm]?)/);
  if (!m) return null;
  return parse12hToMinutes(m[1]);
}

// ─── Places lookup (regularOpeningHours field mask) ──────────────────────────

/** Look up a venue's per-weekday opening hours. Returns the weekdayDescriptions
 *  array, or null on any failure (→ caller leaves the day unchanged). */
async function lookupOpeningHours(venueName: string, city: string, apiKey: string): Promise<string[] | null> {
  if (!apiKey || !venueName) return null;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.regularOpeningHours.weekdayDescriptions',
      },
      body: JSON.stringify({ textQuery: `${venueName} ${city}`.trim(), maxResultCount: 1, languageCode: 'en' }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      places?: Array<{ regularOpeningHours?: { weekdayDescriptions?: string[] } }>;
    };
    return data.places?.[0]?.regularOpeningHours?.weekdayDescriptions ?? null;
  } catch {
    return null;
  }
}

// ─── Anchor selection ─────────────────────────────────────────────────────────

type TimedActivity = Activity & { name?: string; address?: string };

/**
 * The day's "anchor": the first non-restaurant SHARED activity with a real
 * venue name. That's where the late-opening problem lives (the park / museum /
 * attraction the group heads to first). Restaurants have their own meal-slot
 * timing and are skipped. Returns null when there's no suitable anchor.
 */
function findAnchor(day: ItineraryDay): { activity: TimedActivity; startMins: number } | null {
  const shared = (day.tracks?.shared ?? []) as TimedActivity[];
  if (!Array.isArray(shared)) return null;
  const candidates = shared
    .filter(a => a && !a.isRestaurant && (a.name || a.title))
    .map(a => ({ activity: a, startMins: activityStartMinutes(a.timeSlot) }))
    .filter((c): c is { activity: TimedActivity; startMins: number } => c.startMins != null)
    .sort((a, b) => a.startMins - b.startMins);
  return candidates[0] ?? null;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export interface OpeningHoursOptions {
  placesApiKey: string;
  /** Optional status-event sender (SSE) — gets a friendly message string. */
  sendStatus?: (message: string) => void;
}

/**
 * If the day's anchor activity starts before its venue actually opens, shift the
 * anchor's start time (and the day's meetupTime, when it was at/after the old
 * start) to the real opening time. Returns the (possibly) corrected day.
 *
 * Mutates a shallow copy — the input day is not modified. Fail-open throughout:
 * returns the original day on any lookup/parse/shape problem.
 */
export async function correctDayOpeningHours(
  day: ItineraryDay,
  opts: OpeningHoursOptions,
): Promise<ItineraryDay> {
  try {
    if (!opts.placesApiKey || !day?.city) return day;

    const weekday = weekdayName(day.date);
    if (!weekday) return day;

    const anchor = findAnchor(day);
    if (!anchor) return day;

    const venueName = anchor.activity.name ?? anchor.activity.title;
    if (!venueName) return day;

    const hours = await lookupOpeningHours(venueName, day.city, opts.placesApiKey);
    const openMins = openingMinutesForWeekday(hours ?? undefined, weekday);
    if (openMins == null) return day;            // closed / 24h / unknown → leave as-is

    // Only shift FORWARD, and only by a meaningful amount (≥ 15 min) so we don't
    // churn timeSlots over rounding noise.
    if (anchor.startMins >= openMins || openMins - anchor.startMins < 15) return day;

    opts.sendStatus?.(`Adjusting day ${day.day} start to ${venueName}'s ${minutesTo24h(openMins)} opening…`);

    // Build a corrected shallow copy: replace the anchor activity's timeSlot in
    // whichever shared slot it occupies, and bump meetupTime if it was at/before
    // the old anchor start (i.e. the group was meeting to head to this venue).
    const newTimeSlot = shiftTimeSlot(anchor.activity.timeSlot ?? '', openMins);
    const shared = ((day.tracks?.shared ?? []) as TimedActivity[]).map(a =>
      a === anchor.activity ? { ...a, timeSlot: newTimeSlot } : a,
    );

    let meetupTime = day.meetupTime;
    const meetupMins = parse24hToMinutes(meetupTime);
    if (meetupMins == null || meetupMins <= anchor.startMins) {
      meetupTime = minutesTo24h(openMins);
    }

    return {
      ...day,
      meetupTime,
      tracks: { ...day.tracks, shared },
    };
  } catch {
    // Absolute backstop — never let this throw into the build path.
    return day;
  }
}
