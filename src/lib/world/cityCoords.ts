/**
 * City → lat/lng for pin placement on the /world map.
 *
 * V1 strategy: hardcoded coverage for ~120 popular cities. Anything not in
 * the dictionary falls back to the country's geographic centroid, which
 * keeps the visual coherent without external geocoding calls.
 *
 * Production option for v2: cache lat/lng in a `city_geocache` table
 * populated via Google Geocoding API on first reference. For now, the
 * dictionary covers Brandon's testing destinations + the obvious tourist
 * cities a real user would generate.
 */

export const CITY_COORDS: Record<string, [number, number]> = {
  // Format: 'City Name': [longitude, latitude]
  // Order matters for react-simple-maps Marker (lon-first per d3-geo)

  // Brandon's test data
  Pittsburgh: [-79.9959, 40.4406],
  Tampa: [-82.4572, 27.9506],
  Ankara: [32.8541, 39.9334],
  Glasgow: [-4.2518, 55.8642],
  Athens: [23.7275, 37.9838],

  // Europe
  Paris: [2.3522, 48.8566], London: [-0.1276, 51.5074], Rome: [12.4964, 41.9028],
  Madrid: [-3.7038, 40.4168], Barcelona: [2.1734, 41.3851], Lisbon: [-9.1393, 38.7223],
  Amsterdam: [4.9041, 52.3676], Berlin: [13.4050, 52.5200], Munich: [11.5820, 48.1351],
  Vienna: [16.3738, 48.2082], Prague: [14.4378, 50.0755], Budapest: [19.0402, 47.4979],
  Warsaw: [21.0122, 52.2297], Copenhagen: [12.5683, 55.6761],
  Stockholm: [18.0686, 59.3293], Oslo: [10.7522, 59.9139], Helsinki: [24.9384, 60.1699],
  Reykjavik: [-21.9426, 64.1466], Dublin: [-6.2603, 53.3498],
  Edinburgh: [-3.1883, 55.9533], Zurich: [8.5417, 47.3769], Geneva: [6.1432, 46.2044],
  Brussels: [4.3517, 50.8503], Florence: [11.2558, 43.7696], Venice: [12.3155, 45.4408],
  Naples: [14.2681, 40.8518], Milan: [9.1900, 45.4642], Porto: [-8.6291, 41.1579],
  Seville: [-5.9845, 37.3891], Granada: [-3.5986, 37.1773], Valencia: [-0.3763, 39.4699],
  Santorini: [25.4615, 36.3932], Mykonos: [25.3289, 37.4467],

  // North America
  'New York': [-74.0060, 40.7128], 'Los Angeles': [-118.2437, 34.0522],
  Chicago: [-87.6298, 41.8781], 'San Francisco': [-122.4194, 37.7749],
  Seattle: [-122.3321, 47.6062], Boston: [-71.0589, 42.3601],
  Miami: [-80.1918, 25.7617], 'New Orleans': [-90.0715, 29.9511],
  'Las Vegas': [-115.1398, 36.1699], Denver: [-104.9903, 39.7392],
  Austin: [-97.7431, 30.2672], Nashville: [-86.7816, 36.1627],
  Anaheim: [-117.9145, 33.8366], Honolulu: [-157.8583, 21.3069],
  Vancouver: [-123.1207, 49.2827], Toronto: [-79.3832, 43.6532],
  Montreal: [-73.5673, 45.5017],
  'Mexico City': [-99.1332, 19.4326], Cancun: [-86.8515, 21.1619],
  'Playa del Carmen': [-87.0739, 20.6296], Tulum: [-87.4654, 20.2114],

  // Asia
  Tokyo: [139.6503, 35.6762], Kyoto: [135.7681, 35.0116], Osaka: [135.5023, 34.6937],
  Seoul: [126.9780, 37.5665], Beijing: [116.4074, 39.9042], Shanghai: [121.4737, 31.2304],
  'Hong Kong': [114.1694, 22.3193], Singapore: [103.8198, 1.3521],
  Bangkok: [100.5018, 13.7563], 'Ho Chi Minh City': [106.6297, 10.8231],
  Hanoi: [105.8342, 21.0285], Bali: [115.1889, -8.4095], Jakarta: [106.8456, -6.2088],
  'Kuala Lumpur': [101.6869, 3.1390], Manila: [120.9842, 14.5995],
  Taipei: [121.5654, 25.0330], Mumbai: [72.8777, 19.0760], Delhi: [77.1025, 28.7041],
  Jaipur: [75.7873, 26.9124], Agra: [78.0081, 27.1767],
  Dubai: [55.2708, 25.2048], 'Abu Dhabi': [54.3773, 24.4539],
  Istanbul: [28.9784, 41.0082], Cappadocia: [34.8493, 38.6431],

  // Africa
  Cairo: [31.2357, 30.0444], Marrakech: [-7.9811, 31.6295], Casablanca: [-7.5898, 33.5731],
  'Cape Town': [18.4241, -33.9249], Johannesburg: [28.0473, -26.2041],
  Nairobi: [36.8219, -1.2921], Zanzibar: [39.1986, -6.1659],

  // South America
  'Buenos Aires': [-58.3816, -34.6037], Rio: [-43.1729, -22.9068],
  'Rio de Janeiro': [-43.1729, -22.9068], 'São Paulo': [-46.6333, -23.5505],
  Lima: [-77.0428, -12.0464], Cusco: [-71.9675, -13.5320],
  'Machu Picchu': [-72.5450, -13.1631], Bogota: [-74.0721, 4.7110],
  Cartagena: [-75.5144, 10.3910], Santiago: [-70.6483, -33.4569],

  // Oceania
  Sydney: [151.2093, -33.8688], Melbourne: [144.9631, -37.8136],
  Auckland: [174.7633, -36.8485], 'Queenstown, NZ': [168.6626, -45.0312],
  Wellington: [174.7762, -41.2865], Fiji: [178.0650, -17.7134],
};

/** Country centroids — fallback when a city isn't in the lookup. */
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  'United States': [-95.7, 37.1], Canada: [-106.4, 56.1], Mexico: [-102.6, 23.6],
  Brazil: [-51.9, -14.2], Argentina: [-63.6, -38.4], Chile: [-71.5, -35.7],
  Peru: [-75.0, -9.2], Colombia: [-74.3, 4.6],
  France: [2.2, 46.6], Germany: [10.5, 51.2], Italy: [12.6, 41.9],
  Spain: [-3.7, 40.5], 'United Kingdom': [-3.4, 55.4], Ireland: [-8.2, 53.4],
  Portugal: [-8.2, 39.4], Greece: [21.8, 39.1], Turkey: [35.2, 39.0],
  Netherlands: [5.3, 52.1], Belgium: [4.5, 50.5], Switzerland: [8.2, 46.8],
  Austria: [14.6, 47.5], Poland: [19.1, 51.9], 'Czech Republic': [15.5, 49.8],
  Hungary: [19.5, 47.2], Romania: [25.0, 45.9], Bulgaria: [25.5, 42.7],
  Sweden: [18.6, 60.1], Norway: [8.5, 60.5], Denmark: [9.5, 56.3],
  Finland: [25.7, 61.9], Iceland: [-19.0, 64.9],
  Russia: [105.3, 61.5], 'Russian Federation': [105.3, 61.5],
  China: [104.2, 35.9], Japan: [138.3, 36.2], 'Korea, Republic of': [127.8, 35.9],
  India: [78.9, 20.6], Indonesia: [113.9, -0.8], Thailand: [100.9, 15.9],
  'Viet Nam': [108.3, 14.1], Philippines: [121.8, 12.9], Malaysia: [101.9, 4.2],
  Singapore: [103.8, 1.4], Bangladesh: [90.4, 23.7], Nepal: [84.1, 28.4],
  'Saudi Arabia': [45.1, 23.9], 'United Arab Emirates': [53.8, 23.4],
  Israel: [34.9, 31.0], Egypt: [30.8, 26.8], Morocco: [-7.1, 31.8],
  'South Africa': [22.9, -30.6], Kenya: [37.9, -0.0],
  Australia: [133.8, -25.3], 'New Zealand': [174.0, -40.9],
  Iran: [53.7, 32.4], 'Iran, Islamic Republic of': [53.7, 32.4],
};

/**
 * Resolve a city name to a lon/lat tuple. Falls back to the country
 * centroid if the city isn't in the dictionary. Returns null if neither
 * is known.
 *
 * @param city - City name (e.g. "Paris", "Tokyo")
 * @param country - Resolved country (e.g. "France") used for the fallback
 */
export function cityToCoords(city: string, country: string | null): [number, number] | null {
  if (!city) return null;
  const trimmed = city.trim();
  if (CITY_COORDS[trimmed]) return CITY_COORDS[trimmed];
  // Match by first segment (handles "Paris, France" or "Glasgow, UK")
  const firstSeg = trimmed.split(',')[0].trim();
  if (CITY_COORDS[firstSeg]) return CITY_COORDS[firstSeg];
  if (country && COUNTRY_CENTROIDS[country]) return COUNTRY_CENTROIDS[country];
  return null;
}
