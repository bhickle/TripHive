/**
 * Pure Google Maps URL parser. Given a raw URL, returns whatever
 * place-identifying data we can extract WITHOUT a network call:
 *   - name (from /place/<name>/, /search/<query>/, or ?q=)
 *   - lat / lon (from /@lat,lon,zoom/)
 *   - shortUrl: true when the URL is a goo.gl / maps.app.goo.gl
 *     redirect that needs server-side resolution before parsing
 *
 * Consumers:
 *   - /api/google/resolve POST endpoint resolves short URLs by
 *     following the HTTP redirect, then re-parses the resolved URL.
 *   - On My Radar (wishlist) uses the name to populate the destination
 *     label — no Places API call needed.
 *   - Add Activity modal uses name + lat/lon to drive a Places Text
 *     Search biased to the coordinates, then routes through the
 *     existing handleSelectPlace flow.
 *
 * URL formats this handles:
 *   1. https://www.google.com/maps/place/Pizzeria+Da+Michele/@40.84,...
 *   2. https://www.google.com/maps/search/best+pizza+naples/@40.84,...
 *   3. https://www.google.com/maps?q=pizza+naples
 *   4. https://www.google.com/maps/@40.84,14.25,17z          (coords only)
 *   5. https://maps.app.goo.gl/<token>                       (short)
 *   6. https://goo.gl/maps/<token>                           (legacy short)
 *
 * Returns null when the URL isn't a recognisable Google Maps link so
 * the caller can fall through to the next handler (Pinterest, IG, etc).
 */

export interface ParsedGoogleMapsUrl {
  /** Place / search-query name lifted from the URL, if any. */
  name: string | null;
  /** Latitude from the /@lat,lon/ marker, if any. */
  lat: number | null;
  /** Longitude from the /@lat,lon/ marker, if any. */
  lon: number | null;
  /** True when the URL is a short / redirect-only form. The caller
   *  must hit /api/google/resolve to follow the redirect, then re-parse
   *  the result. */
  shortUrl: boolean;
}

const GOOGLE_MAPS_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'www.maps.google.com',
]);

const SHORT_URL_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
]);

export function parseGoogleMapsUrl(rawUrl: string): ParsedGoogleMapsUrl | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let url: URL;
  try {
    url = new URL(rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();

  // ── Short URLs — caller must resolve before re-parsing ────────────────
  if (SHORT_URL_HOSTS.has(host)) {
    return { name: null, lat: null, lon: null, shortUrl: true };
  }

  if (!GOOGLE_MAPS_HOSTS.has(host)) {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  // Most paths start with `maps/...`; some legacy share links omit it.
  const mapsIdx = parts.indexOf('maps');
  const after = mapsIdx >= 0 ? parts.slice(mapsIdx + 1) : parts;

  let name: string | null = null;
  let lat: number | null = null;
  let lon: number | null = null;

  // /maps/place/<name>/@lat,lon,zoom/...
  if (after[0] === 'place' && after[1]) {
    name = prettifyToken(after[1]);
  }

  // /maps/search/<query>/...
  if (after[0] === 'search' && after[1] && !after[1].startsWith('@')) {
    name = prettifyToken(after[1]);
  }

  // ?q=<query>  — common on /maps?q= links (right-click "share place" desktop)
  if (!name) {
    const q = url.searchParams.get('q') ?? url.searchParams.get('query');
    if (q) name = prettifyToken(q);
  }

  // Coords live in any segment shaped /@lat,lon,zoom/ — search every part
  // because the segment order varies by URL shape.
  for (const seg of after) {
    if (!seg.startsWith('@')) continue;
    const [latStr, lonStr] = seg.slice(1).split(',');
    const parsedLat = Number(latStr);
    const parsedLon = Number(lonStr);
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
      lat = parsedLat;
      lon = parsedLon;
    }
    break;
  }

  // Nothing useful found — let the caller fall through to other extractors.
  if (!name && lat === null) return null;

  return { name, lat, lon, shortUrl: false };
}

/** True when the input string looks like ANY Google Maps URL — used by
 *  client-side input handlers to decide whether to switch into "paste-link"
 *  mode vs. the default behaviour (autocomplete, free-text, etc). */
export function isGoogleMapsUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  let url: URL;
  try {
    url = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return GOOGLE_MAPS_HOSTS.has(host) || SHORT_URL_HOSTS.has(host);
}

/** Decode + clean a URL path segment ("Pizzeria+Da+Michele" → "Pizzeria
 *  Da Michele"). Replaces both `+` and `-` with spaces because some
 *  Google URLs use either separator depending on share-source. */
function prettifyToken(token: string): string {
  try {
    return decodeURIComponent(token).replace(/\+/g, ' ').replace(/-/g, ' ').trim();
  } catch {
    return token.replace(/\+/g, ' ').replace(/-/g, ' ').trim();
  }
}
