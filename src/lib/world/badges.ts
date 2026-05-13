/**
 * Travel badges — v1 catalog + computation. 14 badges across 4 rarity tiers.
 * Computed on-the-fly from trip / photo / country data; no persistence yet.
 * If badge count grows or earn-events need timestamps, add a `user_badges`
 * table and persist.
 *
 * Tiers (rarity → border + label color):
 *   common    — green   — easy, expected to earn in first 2-3 trips
 *   rare      — sky     — meaningful milestone
 *   epic      — amber   — long-tail behavior pattern
 *   legendary — purple  — once-or-twice in app lifetime
 */

export type BadgeTier = 'common' | 'rare' | 'epic' | 'legendary';

export interface BadgeDef {
  id: string;
  emoji: string;
  title: string;
  description: string;
  tier: BadgeTier;
  /** Optional progress hint shown on locked tiles. e.g. "3/5 food trips" */
  progressHint?: string;
}

export interface BadgeProgress extends BadgeDef {
  earned: boolean;
  /** 0..1 fractional progress for in-progress badges, undefined when unknown. */
  progress?: number;
  /** Human-readable progress string for unearned in-progress badges. */
  progressLabel?: string;
  /**
   * Human-readable description of what the user did to earn this badge.
   * Shown on the earned badge tile so completed badges are as informative
   * as locked ones (which show progress). Examples:
   *   "Spain, France, Italy +2"
   *   "5 visits to Tokyo"
   *   "Organized Paris for 6"
   */
  earnedDetail?: string;
}

export interface TripForBadge {
  id: string;
  destination: string;
  groupSize: number;
  status: 'planning' | 'active' | 'completed';
  priorities: string[];
  isOrganizer: boolean;
}

export interface BadgeInputs {
  completedTrips: TripForBadge[];
  countriesVisited: Set<string>;
  continentsVisited: Set<string>;
  citiesVisited: Set<string>;
  photoCount: number;
}

const CATALOG: BadgeDef[] = [
  // Common — easy wins
  {
    id: 'first_trip',
    emoji: '🎒',
    title: 'First Trip',
    description: 'Complete your first trip.',
    tier: 'common',
  },
  {
    id: 'first_crossing',
    emoji: '🌍',
    title: 'First Crossing',
    description: 'Visit a country other than your home.',
    tier: 'common',
  },
  {
    id: 'repeat_offender',
    emoji: '🔁',
    title: 'Repeat Offender',
    description: 'Visit the same city 3 or more times.',
    tier: 'common',
  },

  // Rare — pattern-based
  {
    id: 'foodie_pilgrim',
    emoji: '🥖',
    title: 'Foodie Pilgrim',
    description: 'Complete 5 trips with food as a top priority.',
    tier: 'rare',
  },
  {
    id: 'culture_vulture',
    emoji: '🏛️',
    title: 'Culture Vulture',
    description: 'Complete 5 trips with history or culture as a priority.',
    tier: 'rare',
  },
  {
    id: 'group_mvp',
    emoji: '👑',
    title: 'Group MVP',
    description: 'Organize a trip for 5 or more travelers.',
    tier: 'rare',
  },
  {
    id: 'photo_journalist',
    emoji: '📷',
    title: 'Photo Journalist',
    description: 'Upload 100+ photos across your trips.',
    tier: 'rare',
  },
  {
    id: 'solo_voyager',
    emoji: '🧭',
    title: 'Solo Voyager',
    description: 'Complete 3 solo trips (groupSize = 1).',
    tier: 'rare',
  },

  // Epic — long-tail
  {
    id: 'continent_hopper',
    emoji: '🪐',
    title: 'Continent Hopper',
    description: 'Set foot on 4 different continents.',
    tier: 'epic',
  },
  {
    id: 'baker_dozen',
    emoji: '✈️',
    title: 'Baker\'s Dozen',
    description: 'Visit 13 unique countries.',
    tier: 'epic',
  },
  {
    id: 'city_collector',
    emoji: '🏙️',
    title: 'City Collector',
    description: 'Visit 25 unique cities.',
    tier: 'epic',
  },
  {
    id: 'adventure_seeker',
    emoji: '⚡',
    title: 'Adventure Seeker',
    description: 'Complete 5 trips with adventure as a priority.',
    tier: 'epic',
  },

  // Legendary — rare lifetime achievements
  {
    id: 'world_wanderer',
    emoji: '🌐',
    title: 'World Wanderer',
    description: 'Visit all 7 continents (or all 6 inhabited).',
    tier: 'legendary',
  },
  {
    id: 'half_century',
    emoji: '💎',
    title: 'Half Century',
    description: 'Visit 50 unique countries.',
    tier: 'legendary',
  },
];

function countPriority(trips: TripForBadge[], ...priorities: string[]): number {
  return trips.filter(t =>
    t.priorities.some(p => priorities.includes(p.toLowerCase())),
  ).length;
}

function tripsWithPriority(trips: TripForBadge[], ...priorities: string[]): TripForBadge[] {
  return trips.filter(t =>
    t.priorities.some(p => priorities.includes(p.toLowerCase())),
  );
}

/** First non-empty segment of a destination string, original case preserved. */
function cityOf(t: TripForBadge): string {
  return t.destination.split(',')[0]?.trim() ?? '';
}

/**
 * Comma/and-joined list. Truncates with "+N" once over `maxShow` so a
 * badge tile doesn't blow up on a power user with 50 countries. Filters
 * empties so we don't render trailing commas.
 */
function listify(items: string[], maxShow = 3): string {
  const arr = items.filter(s => s && s.trim()).map(s => s.trim());
  if (arr.length === 0) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} & ${arr[1]}`;
  if (arr.length <= maxShow) {
    return arr.slice(0, -1).join(', ') + ', & ' + arr[arr.length - 1];
  }
  return `${arr.slice(0, maxShow).join(', ')} +${arr.length - maxShow}`;
}

function visitCountByCity(trips: TripForBadge[]): Map<string, { display: string; count: number }> {
  const counts = new Map<string, { display: string; count: number }>();
  for (const t of trips) {
    const display = cityOf(t);
    if (!display) continue;
    const key = display.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { display, count: 1 });
  }
  return counts;
}

export function evaluateBadges(input: BadgeInputs): BadgeProgress[] {
  const { completedTrips, countriesVisited, continentsVisited, citiesVisited, photoCount } = input;
  const cityVisitCount = visitCountByCity(completedTrips);
  const maxRevisitEntry = Array.from(cityVisitCount.values())
    .sort((a, b) => b.count - a.count)[0];
  const maxRevisit = maxRevisitEntry?.count ?? 0;
  const soloTrips = completedTrips.filter(t => t.groupSize === 1);
  const soloCount = soloTrips.length;
  const bigGroupTrip = completedTrips.find(t => t.isOrganizer && t.groupSize >= 5);
  const largeGroup = !!bigGroupTrip;
  const foodTrips = tripsWithPriority(completedTrips, 'food');
  const cultureTrips = tripsWithPriority(completedTrips, 'history', 'culture');
  const adventureTrips = tripsWithPriority(completedTrips, 'adventure');
  const foodCount = foodTrips.length;
  const cultureCount = cultureTrips.length;
  const adventureCount = adventureTrips.length;
  const countryList = Array.from(countriesVisited);
  const continentList = Array.from(continentsVisited);

  const results: BadgeProgress[] = CATALOG.map(def => {
    switch (def.id) {
      case 'first_trip': {
        const earned = completedTrips.length >= 1;
        return {
          ...def,
          earned,
          earnedDetail: earned ? `Started with ${cityOf(completedTrips[0])}` : undefined,
        };
      }
      case 'first_crossing': {
        const earned = countriesVisited.size >= 2;
        return {
          ...def,
          earned,
          earnedDetail: earned ? listify(countryList) : undefined,
        };
      }
      case 'repeat_offender': {
        const earned = maxRevisit >= 3;
        return {
          ...def,
          earned,
          progress: Math.min(maxRevisit / 3, 1),
          progressLabel: earned ? undefined : `${maxRevisit}/3 visits to same city`,
          earnedDetail: earned && maxRevisitEntry
            ? `${maxRevisit} visits to ${maxRevisitEntry.display}`
            : undefined,
        };
      }
      case 'foodie_pilgrim': {
        const earned = foodCount >= 5;
        return {
          ...def,
          earned,
          progress: Math.min(foodCount / 5, 1),
          progressLabel: earned ? undefined : `${foodCount}/5 food trips`,
          earnedDetail: earned ? listify(foodTrips.map(cityOf)) : undefined,
        };
      }
      case 'culture_vulture': {
        const earned = cultureCount >= 5;
        return {
          ...def,
          earned,
          progress: Math.min(cultureCount / 5, 1),
          progressLabel: earned ? undefined : `${cultureCount}/5 history/culture trips`,
          earnedDetail: earned ? listify(cultureTrips.map(cityOf)) : undefined,
        };
      }
      case 'group_mvp': {
        const earned = largeGroup;
        return {
          ...def,
          earned,
          earnedDetail: earned && bigGroupTrip
            ? `Organized ${cityOf(bigGroupTrip)} for ${bigGroupTrip.groupSize}`
            : undefined,
        };
      }
      case 'photo_journalist': {
        const earned = photoCount >= 100;
        return {
          ...def,
          earned,
          progress: Math.min(photoCount / 100, 1),
          progressLabel: earned ? undefined : `${photoCount}/100 photos`,
          earnedDetail: earned ? `${photoCount.toLocaleString()} photos uploaded` : undefined,
        };
      }
      case 'solo_voyager': {
        const earned = soloCount >= 3;
        return {
          ...def,
          earned,
          progress: Math.min(soloCount / 3, 1),
          progressLabel: earned ? undefined : `${soloCount}/3 solo trips`,
          earnedDetail: earned ? listify(soloTrips.map(cityOf)) : undefined,
        };
      }
      case 'continent_hopper': {
        const earned = continentsVisited.size >= 4;
        return {
          ...def,
          earned,
          progress: Math.min(continentsVisited.size / 4, 1),
          progressLabel: earned ? undefined : `${continentsVisited.size}/4 continents`,
          earnedDetail: earned ? listify(continentList) : undefined,
        };
      }
      case 'baker_dozen': {
        const earned = countriesVisited.size >= 13;
        return {
          ...def,
          earned,
          progress: Math.min(countriesVisited.size / 13, 1),
          progressLabel: earned ? undefined : `${countriesVisited.size}/13 countries`,
          earnedDetail: earned ? `${countriesVisited.size} countries: ${listify(countryList)}` : undefined,
        };
      }
      case 'city_collector': {
        const earned = citiesVisited.size >= 25;
        return {
          ...def,
          earned,
          progress: Math.min(citiesVisited.size / 25, 1),
          progressLabel: earned ? undefined : `${citiesVisited.size}/25 cities`,
          earnedDetail: earned ? `${citiesVisited.size} cities visited` : undefined,
        };
      }
      case 'adventure_seeker': {
        const earned = adventureCount >= 5;
        return {
          ...def,
          earned,
          progress: Math.min(adventureCount / 5, 1),
          progressLabel: earned ? undefined : `${adventureCount}/5 adventure trips`,
          earnedDetail: earned ? listify(adventureTrips.map(cityOf)) : undefined,
        };
      }
      case 'world_wanderer': {
        const earned = continentsVisited.size >= 7;
        return {
          ...def,
          earned,
          progress: Math.min(continentsVisited.size / 7, 1),
          progressLabel: earned ? undefined : `${continentsVisited.size}/7 continents`,
          earnedDetail: earned ? `All 7 continents` : undefined,
        };
      }
      case 'half_century': {
        const earned = countriesVisited.size >= 50;
        return {
          ...def,
          earned,
          progress: Math.min(countriesVisited.size / 50, 1),
          progressLabel: earned ? undefined : `${countriesVisited.size}/50 countries`,
          earnedDetail: earned ? `${countriesVisited.size} countries` : undefined,
        };
      }
      default:
        return { ...def, earned: false };
    }
  });

  return results;
}
