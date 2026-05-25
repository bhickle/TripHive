/**
 * Shared domestic-trip detection used by the Prep Hub — both the client page
 * (visa/entry card + which tabs to show) and the prep API route (which
 * "Don't Forget" defaults to seed). Kept in one place so the two surfaces
 * can't drift on what counts as a domestic trip.
 */

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
 * homes match the destination string naming their country. Unknown home falls
 * back to the US assumption (see homeCountryIsUS).
 */
export function isHomeCountryTrip(
  destination: string,
  homeCountry: string | null | undefined,
): boolean {
  if (homeCountryIsUS(homeCountry)) return isUSDestination(destination);
  const home = (homeCountry ?? '').trim().toLowerCase();
  return !!home && destination.toLowerCase().includes(home);
}
