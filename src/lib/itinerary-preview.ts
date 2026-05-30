/**
 * Lightweight day-preview extractor used by the Discover community + founder
 * itinerary endpoints. The raw `itineraries.days` jsonb is rich (tracks +
 * meta + photo spots + transport legs + …) and tens of KB per trip — too
 * heavy to ship in a rail-list response just to render a 4-day strip.
 *
 * Returns the first 4 days, each with up to 3 shared-track activity titles.
 * Shared track is the most representative slice for a card preview;
 * track_a/track_b are personal-pace splits that don't always exist.
 */

type RawActivity = { title?: unknown; name?: unknown; time?: unknown; timeSlot?: unknown };
type RawTracks = { shared?: RawActivity[] | unknown };
type RawDay = { day?: unknown; theme?: unknown; tracks?: RawTracks | unknown };

export interface PreviewDay {
  day: number;
  title: string;
  activities: Array<{ title: string; time: string }>;
}

export function extractPreviewDays(days: unknown): PreviewDay[] {
  if (!Array.isArray(days)) return [];
  return (days as RawDay[]).slice(0, 4).map((d, i) => {
    const tracksObj = d?.tracks && typeof d.tracks === 'object' ? (d.tracks as RawTracks) : null;
    const shared = tracksObj && Array.isArray(tracksObj.shared) ? (tracksObj.shared as RawActivity[]) : [];
    const activities = shared.slice(0, 3).map(a => ({
      title: typeof a?.title === 'string' ? a.title : (typeof a?.name === 'string' ? a.name : ''),
      time: typeof a?.time === 'string' ? a.time : (typeof a?.timeSlot === 'string' ? a.timeSlot : 'morning'),
    })).filter(a => a.title);
    return {
      day: typeof d?.day === 'number' ? d.day : i + 1,
      title: typeof d?.theme === 'string' ? d.theme : '',
      activities,
    };
  });
}
