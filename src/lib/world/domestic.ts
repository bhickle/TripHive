/**
 * Shared domestic-trip detection used by the Prep Hub — both the client page
 * (visa/entry card + which tabs to show) and the prep API route (which
 * "Don't Forget" defaults to seed). Kept in one place so the two surfaces
 * can't drift on what counts as a domestic trip.
 */

import { aliasesForCountry, canonicalizeCountry, destinationToCountry } from './countryLookup';

// US state + DC abbreviations, for matching a "City, ST" destination string
// (e.g. "Tampa, FL" or "New York, NY").
export const US_STATE_ABBREVIATIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

/**
 * True when the destination string denotes a US location — "United States",
 * "…USA", "u.s.a", or a "City, ST" pattern. Destination-only: it drives the
 * English/USD/no-phrasebook assumptions regardless of who's traveling, so it
 * deliberately does NOT consider the traveler's home country.
 */
export function isUSDestination(destination: string): boolean {
  const destLower = destination.toLowerCase();
  return (
    destLower.includes('united states') ||
    destLower.includes(' usa') || destLower.endsWith('usa') ||
    destLower.includes('u.s.a') ||
    US_STATE_ABBREVIATIONS.some(abbr =>
      new RegExp(`,\\s*${abbr}\\b`, 'i').test(destination),
    )
  );
}

/**
 * True when home_country names the US — or is blank. The app's entry guidance
 * historically assumed a US passport, so an unknown home (users who predate
 * the onboarding country picker) keeps that assumption: no regression for
 * existing US users, correct guidance for non-US users who set their home.
 */
export function homeCountryIsUS(homeCountry: string | null | undefined): boolean {
  const h = (homeCountry ?? '').trim().toLowerCase();
  return !h || h.includes('united states');
}

/**
 * True when the destination is within the traveler's OWN country — distinct
 * from isUSDestination. US home reuses the robust isUSDestination match; other
 * homes resolve the destination's country via destinationToCountry (which
 * handles "London, UK" / "Prague, Czechia" / "Tokyo, Japan" naturally), then
 * fall back to alias substring match for bare-city destinations like just
 * "London" — "uk", "england", "scotland" etc. all map to United Kingdom.
 *
 * Previously this did `destination.includes(homeCountry)`, which silently
 * never matched because home_country is stored as the canonical name
 * ("United Kingdom") while destinations are short forms ("London") — every
 * non-US user got an international "Don't Forget" seed and a visa card for
 * their own country.
 */
export function isHomeCountryTrip(
  destination: string,
  homeCountry: string | null | undefined,
): boolean {
  if (homeCountryIsUS(homeCountry)) return isUSDestination(destination);

  const canonicalHome = canonicalizeCountry(homeCountry);
  if (!canonicalHome) return false;

  // First try: pull the country out of the destination string ("Prague,
  // Czechia" → "Czech Republic"). Comma-separated destinations land here.
  const destCountry = destinationToCountry(destination);
  if (destCountry) return destCountry === canonicalHome;

  // Bare-city fallback: check the destination string against every alias of
  // the home country. Catches "London" for a UK user via the 'england' /
  // 'scotland' / 'uk' / 'great britain' aliases. Case-insensitive.
  const destLower = destination.toLowerCase();
  return aliasesForCountry(canonicalHome).some(alias => destLower.includes(alias));
}
