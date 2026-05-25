/**
 * Country list for the home-country picker (onboarding) and anywhere else we
 * need to ask "where are you based?". Names resolve via Intl.DisplayNames
 * (deterministic on both server + client, so no hydration mismatch) and flags
 * are derived from the ISO 3166-1 alpha-2 code, so the data here is just the
 * compact code list.
 */

// All ISO 3166-1 alpha-2 codes (sovereign + common territories).
const ISO_CODES =
  'AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(
    ' ',
  );

/** Regional-indicator flag emoji from an ISO alpha-2 code (e.g. "US" → 🇺🇸). */
export function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, c => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export type Country = { code: string; name: string; flag: string };

let _countries: Country[] | null = null;

/** Sorted country list. Cached after first build. */
export function getCountries(): Country[] {
  if (_countries) return _countries;
  let regionNames: Intl.DisplayNames | null = null;
  try {
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    regionNames = null;
  }
  _countries = ISO_CODES.map(code => ({
    code,
    name: regionNames?.of(code) ?? code,
    flag: flagEmoji(code),
  }))
    .filter(c => c.name && c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name));
  return _countries;
}

/**
 * Best-guess home country from the browser locale (e.g. "en-GB" → "United
 * Kingdom"). Client-only (uses navigator); returns '' when it can't resolve,
 * so callers should treat it as a pre-fill default the user can change.
 */
export function detectLocaleCountry(): string {
  try {
    const loc = typeof navigator !== 'undefined' ? navigator.language : '';
    if (!loc) return '';
    const region = new Intl.Locale(loc).maximize().region;
    if (!region) return '';
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
    return name && name !== region ? name : '';
  } catch {
    return '';
  }
}
