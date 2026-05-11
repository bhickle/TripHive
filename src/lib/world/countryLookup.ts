/**
 * Country resolution for the /world map.
 *
 * Source of truth — a trip's country = the last comma-segment of its
 * `destination` string, normalized through an alias map. Brandon's data
 * shows trips stored as "Paris, France" / "Pittsburgh, PA, USA" / "Glasgow,
 * UK" / "Ankara, Türkiye" — last-segment + alias normalization handles
 * all of these without external geocoding.
 *
 * For visited cities (the manual chip input), we treat them as belonging
 * to their parent trip's country since they were tagged on that trip.
 *
 * The map renders react-simple-maps's TopoJSON which uses ISO 3166-1
 * alpha-3 codes. The country dictionary below maps display names →
 * alpha-3 so we can join trip counts to map shapes.
 */

/** Aliases for common variants — case-insensitive lookup against the keys. */
const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'United States',
  'u.s.a.': 'United States',
  'u.s.': 'United States',
  'us': 'United States',
  'america': 'United States',
  'united states of america': 'United States',
  'uk': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom',
  'england': 'United Kingdom',
  'scotland': 'United Kingdom',
  'wales': 'United Kingdom',
  'northern ireland': 'United Kingdom',
  'türkiye': 'Turkey',
  'turkiye': 'Turkey',
  'czechia': 'Czech Republic',
  'south korea': 'Korea, Republic of',
  'korea': 'Korea, Republic of',
  'north korea': "Korea, Democratic People's Republic of",
  'uae': 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
  'vatican': 'Vatican City',
  'holy see': 'Vatican City',
  'russia': 'Russian Federation',
  'iran': 'Iran, Islamic Republic of',
  'syria': 'Syrian Arab Republic',
  'vietnam': 'Viet Nam',
  'laos': "Lao People's Democratic Republic",
  'tanzania': 'Tanzania, United Republic of',
  'venezuela': 'Venezuela, Bolivarian Republic of',
  'bolivia': 'Bolivia, Plurinational State of',
  'palestine': 'Palestine, State of',
  'taiwan': 'Taiwan, Province of China',
  'cape verde': 'Cabo Verde',
  'east timor': 'Timor-Leste',
  'macedonia': 'North Macedonia',
  'swaziland': 'Eswatini',
  'ivory coast': "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  'congo': 'Congo, Democratic Republic of the',
};

/** ISO 3166-1 alpha-3 codes for countries that appear in
 *  world-atlas/countries-110m.json. Keys are display names; values are
 *  the numeric ID react-simple-maps surfaces via geo.id. */
const COUNTRY_TO_ID: Record<string, string> = {
  Afghanistan: '004', Albania: '008', Algeria: '012', Angola: '024', Argentina: '032',
  Armenia: '051', Australia: '036', Austria: '040', Azerbaijan: '031',
  Bahamas: '044', Bangladesh: '050', Belarus: '112', Belgium: '056', Belize: '084',
  Benin: '204', Bhutan: '064', 'Bolivia, Plurinational State of': '068',
  'Bosnia and Herzegovina': '070', Botswana: '072', Brazil: '076', Brunei: '096',
  Bulgaria: '100', 'Burkina Faso': '854', Burundi: '108',
  'Cabo Verde': '132', Cambodia: '116', Cameroon: '120', Canada: '124',
  'Central African Republic': '140', Chad: '148', Chile: '152', China: '156',
  Colombia: '170', 'Congo, Democratic Republic of the': '180', Congo: '178',
  'Costa Rica': '188', "Côte d'Ivoire": '384', Croatia: '191', Cuba: '192',
  Cyprus: '196', 'Czech Republic': '203',
  Denmark: '208', Djibouti: '262', 'Dominican Republic': '214',
  Ecuador: '218', Egypt: '818', 'El Salvador': '222', 'Equatorial Guinea': '226',
  Eritrea: '232', Estonia: '233', Eswatini: '748', Ethiopia: '231',
  Fiji: '242', Finland: '246', France: '250',
  Gabon: '266', Gambia: '270', Georgia: '268', Germany: '276', Ghana: '288',
  Greece: '300', Greenland: '304', Guatemala: '320', Guinea: '324',
  'Guinea-Bissau': '624', Guyana: '328',
  Haiti: '332', Honduras: '340', Hungary: '348',
  Iceland: '352', India: '356', Indonesia: '360',
  'Iran, Islamic Republic of': '364', Iraq: '368', Ireland: '372',
  Israel: '376', Italy: '380',
  Jamaica: '388', Japan: '392', Jordan: '400',
  Kazakhstan: '398', Kenya: '404', "Korea, Democratic People's Republic of": '408',
  'Korea, Republic of': '410', Kosovo: '983', Kuwait: '414', Kyrgyzstan: '417',
  "Lao People's Democratic Republic": '418', Latvia: '428', Lebanon: '422',
  Lesotho: '426', Liberia: '430', Libya: '434', Lithuania: '440', Luxembourg: '442',
  Madagascar: '450', Malawi: '454', Malaysia: '458', Mali: '466', Mauritania: '478',
  Mexico: '484', Moldova: '498', Mongolia: '496', Montenegro: '499', Morocco: '504',
  Mozambique: '508', Myanmar: '104',
  Namibia: '516', Nepal: '524', Netherlands: '528', 'New Caledonia': '540',
  'New Zealand': '554', Nicaragua: '558', Niger: '562', Nigeria: '566',
  'North Macedonia': '807', Norway: '578',
  Oman: '512',
  Pakistan: '586', Panama: '591', 'Papua New Guinea': '598', Paraguay: '600',
  Peru: '604', Philippines: '608', Poland: '616', Portugal: '620',
  'Puerto Rico': '630',
  Qatar: '634',
  Romania: '642', 'Russian Federation': '643', Rwanda: '646',
  'Saudi Arabia': '682', Senegal: '686', Serbia: '688', 'Sierra Leone': '694',
  Singapore: '702', Slovakia: '703', Slovenia: '705', 'Solomon Islands': '090',
  Somalia: '706', 'South Africa': '710', 'South Sudan': '728', Spain: '724',
  'Sri Lanka': '144', Sudan: '729', Suriname: '740', Sweden: '752', Switzerland: '756',
  'Syrian Arab Republic': '760',
  'Taiwan, Province of China': '158', Tajikistan: '762',
  'Tanzania, United Republic of': '834', Thailand: '764', 'Timor-Leste': '626',
  Togo: '768', 'Trinidad and Tobago': '780', Tunisia: '788', Turkey: '792',
  Turkmenistan: '795',
  Uganda: '800', Ukraine: '804', 'United Arab Emirates': '784',
  'United Kingdom': '826', 'United States': '840', Uruguay: '858', Uzbekistan: '860',
  Vanuatu: '548', 'Vatican City': '336', 'Venezuela, Bolivarian Republic of': '862',
  'Viet Nam': '704',
  Yemen: '887',
  Zambia: '894', Zimbabwe: '716',
};

/** Continent grouping for the regional progress strip. Country counts:
 *  Asia 48, Africa 54, Europe 44, N. America 23, S. America 12, Oceania 14. */
export const CONTINENT_TOTALS: Record<string, number> = {
  Asia: 48,
  Africa: 54,
  Europe: 44,
  'North America': 23,
  'South America': 12,
  Oceania: 14,
};

const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // Asia
  Afghanistan: 'Asia', Bangladesh: 'Asia', Bhutan: 'Asia', Brunei: 'Asia',
  Cambodia: 'Asia', China: 'Asia', India: 'Asia', Indonesia: 'Asia',
  'Iran, Islamic Republic of': 'Asia', Iraq: 'Asia', Israel: 'Asia',
  Japan: 'Asia', Jordan: 'Asia', Kazakhstan: 'Asia',
  "Korea, Democratic People's Republic of": 'Asia',
  'Korea, Republic of': 'Asia', Kuwait: 'Asia', Kyrgyzstan: 'Asia',
  "Lao People's Democratic Republic": 'Asia', Lebanon: 'Asia',
  Malaysia: 'Asia', Maldives: 'Asia', Mongolia: 'Asia', Myanmar: 'Asia',
  Nepal: 'Asia', Oman: 'Asia', Pakistan: 'Asia', Palestine: 'Asia',
  Philippines: 'Asia', Qatar: 'Asia', 'Saudi Arabia': 'Asia',
  Singapore: 'Asia', 'Sri Lanka': 'Asia', 'Syrian Arab Republic': 'Asia',
  'Taiwan, Province of China': 'Asia', Tajikistan: 'Asia',
  Thailand: 'Asia', 'Timor-Leste': 'Asia', Turkey: 'Asia',
  Turkmenistan: 'Asia', 'United Arab Emirates': 'Asia', Uzbekistan: 'Asia',
  'Viet Nam': 'Asia', Yemen: 'Asia',
  // Europe
  Albania: 'Europe', Andorra: 'Europe', Armenia: 'Europe', Austria: 'Europe',
  Azerbaijan: 'Europe', Belarus: 'Europe', Belgium: 'Europe',
  'Bosnia and Herzegovina': 'Europe', Bulgaria: 'Europe', Croatia: 'Europe',
  Cyprus: 'Europe', 'Czech Republic': 'Europe', Denmark: 'Europe',
  Estonia: 'Europe', Finland: 'Europe', France: 'Europe', Georgia: 'Europe',
  Germany: 'Europe', Greece: 'Europe', Hungary: 'Europe', Iceland: 'Europe',
  Ireland: 'Europe', Italy: 'Europe', Kosovo: 'Europe', Latvia: 'Europe',
  Liechtenstein: 'Europe', Lithuania: 'Europe', Luxembourg: 'Europe',
  Malta: 'Europe', Moldova: 'Europe', Monaco: 'Europe', Montenegro: 'Europe',
  Netherlands: 'Europe', 'North Macedonia': 'Europe', Norway: 'Europe',
  Poland: 'Europe', Portugal: 'Europe', Romania: 'Europe',
  'Russian Federation': 'Europe', 'San Marino': 'Europe', Serbia: 'Europe',
  Slovakia: 'Europe', Slovenia: 'Europe', Spain: 'Europe', Sweden: 'Europe',
  Switzerland: 'Europe', Ukraine: 'Europe', 'United Kingdom': 'Europe',
  'Vatican City': 'Europe',
  // Africa
  Algeria: 'Africa', Angola: 'Africa', Benin: 'Africa', Botswana: 'Africa',
  'Burkina Faso': 'Africa', Burundi: 'Africa', 'Cabo Verde': 'Africa',
  Cameroon: 'Africa', 'Central African Republic': 'Africa', Chad: 'Africa',
  Comoros: 'Africa', Congo: 'Africa', 'Congo, Democratic Republic of the': 'Africa',
  "Côte d'Ivoire": 'Africa', Djibouti: 'Africa', Egypt: 'Africa',
  'Equatorial Guinea': 'Africa', Eritrea: 'Africa', Eswatini: 'Africa',
  Ethiopia: 'Africa', Gabon: 'Africa', Gambia: 'Africa', Ghana: 'Africa',
  Guinea: 'Africa', 'Guinea-Bissau': 'Africa', Kenya: 'Africa',
  Lesotho: 'Africa', Liberia: 'Africa', Libya: 'Africa', Madagascar: 'Africa',
  Malawi: 'Africa', Mali: 'Africa', Mauritania: 'Africa', Mauritius: 'Africa',
  Morocco: 'Africa', Mozambique: 'Africa', Namibia: 'Africa', Niger: 'Africa',
  Nigeria: 'Africa', Rwanda: 'Africa', 'São Tomé and Príncipe': 'Africa',
  Senegal: 'Africa', Seychelles: 'Africa', 'Sierra Leone': 'Africa',
  Somalia: 'Africa', 'South Africa': 'Africa', 'South Sudan': 'Africa',
  Sudan: 'Africa', Tanzania: 'Africa', 'Tanzania, United Republic of': 'Africa',
  Togo: 'Africa', Tunisia: 'Africa', Uganda: 'Africa', Zambia: 'Africa',
  Zimbabwe: 'Africa',
  // North America
  Bahamas: 'North America', Barbados: 'North America', Belize: 'North America',
  Canada: 'North America', 'Costa Rica': 'North America', Cuba: 'North America',
  Dominica: 'North America', 'Dominican Republic': 'North America',
  'El Salvador': 'North America', Grenada: 'North America', Guatemala: 'North America',
  Haiti: 'North America', Honduras: 'North America', Jamaica: 'North America',
  Mexico: 'North America', Nicaragua: 'North America', Panama: 'North America',
  'Saint Kitts and Nevis': 'North America', 'Saint Lucia': 'North America',
  'Trinidad and Tobago': 'North America', 'United States': 'North America',
  // South America
  Argentina: 'South America', 'Bolivia, Plurinational State of': 'South America',
  Brazil: 'South America', Chile: 'South America', Colombia: 'South America',
  Ecuador: 'South America', Guyana: 'South America', Paraguay: 'South America',
  Peru: 'South America', Suriname: 'South America', Uruguay: 'South America',
  'Venezuela, Bolivarian Republic of': 'South America',
  // Oceania
  Australia: 'Oceania', Fiji: 'Oceania', Kiribati: 'Oceania',
  'Marshall Islands': 'Oceania', Micronesia: 'Oceania', Nauru: 'Oceania',
  'New Zealand': 'Oceania', Palau: 'Oceania', 'Papua New Guinea': 'Oceania',
  Samoa: 'Oceania', 'Solomon Islands': 'Oceania', Tonga: 'Oceania',
  Tuvalu: 'Oceania', Vanuatu: 'Oceania',
};

/**
 * Resolve a destination string ("Paris, France", "Pittsburgh, PA, USA",
 * "Glasgow, UK", "Türkiye", "California") to a canonical country name.
 * Returns null for unparseable / single-segment region inputs like
 * "Pacific Northwest" or "California" (the latter is a US state alone,
 * not a country — we can't infer USA without trip context).
 */
export function destinationToCountry(destination: string): string | null {
  if (!destination) return null;
  const parts = destination.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const raw = parts[parts.length - 1];
  const lower = raw.toLowerCase();
  const aliased = COUNTRY_ALIASES[lower] ?? raw;
  // Only return if we have the country in our ID map — otherwise we can't
  // render a fill on the world map, and the count is meaningless without
  // the geographic confirmation.
  if (COUNTRY_TO_ID[aliased]) return aliased;
  // Try title-case match
  const titled = aliased.replace(/\b\w/g, c => c.toUpperCase());
  if (COUNTRY_TO_ID[titled]) return titled;
  return null;
}

export function countryToId(country: string): string | null {
  return COUNTRY_TO_ID[country] ?? null;
}

export function countryToContinent(country: string): string | null {
  return COUNTRY_TO_CONTINENT[country] ?? null;
}
