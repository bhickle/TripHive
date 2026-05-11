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

function visitCountByCity(trips: TripForBadge[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of trips) {
    const city = t.destination.split(',')[0]?.trim().toLowerCase();
    if (!city) continue;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return counts;
}

export function evaluateBadges(input: BadgeInputs): BadgeProgress[] {
  const { completedTrips, countriesVisited, continentsVisited, citiesVisited, photoCount } = input;
  const cityVisitCount = visitCountByCity(completedTrips);
  const maxRevisit = Math.max(0, ...Array.from(cityVisitCount.values()));
  const soloCount = completedTrips.filter(t => t.groupSize === 1).length;
  const largeGroup = completedTrips.some(t => t.isOrganizer && t.groupSize >= 5);
  const foodCount = countPriority(completedTrips, 'food');
  const cultureCount = countPriority(completedTrips, 'history', 'culture');
  const adventureCount = countPriority(completedTrips, 'adventure');

  const results: BadgeProgress[] = CATALOG.map(def => {
    switch (def.id) {
      case 'first_trip':
        return { ...def, earned: completedTrips.length >= 1 };
      case 'first_crossing':
        return { ...def, earned: countriesVisited.size >= 2 };
      case 'repeat_offender': {
        const earned = maxRevisit >= 3;
        return {
          ...def,
          earned,
          progress: Math.min(maxRevisit / 3, 1),
          progressLabel: earned ? undefined : `${maxRevisit}/3 visits to same city`,
        };
      }
      case 'foodie_pilgrim': {
        const earned = foodCount >= 5;
        return {
          ...def,
          earned,
          progress: Math.min(foodCount / 5, 1),
          progressLabel: earned ? undefined : `${foodCount}/5 food trips`,
        };
      }
      case 'culture_vulture': {
        const earned = cultureCount >= 5;
        return {
          ...def,
          earned,
          progress: Math.min(cultureCount / 5, 1),
          progressLabel: earned ? undefined : `${cultureCount}/5 history/culture trips`,
        };
      }
      case 'group_mvp':
        return { ...def, earned: largeGroup };
      case 'photo_journalist': {
        const earned = photoCount >= 100;
        return {
          ...def,
          earned,
          progress: Math.min(photoCount / 100, 1),
          progressLabel: earned ? undefined : `${photoCount}/100 photos`,
        };
      }
      case 'solo_voyager': {
        const earned = soloCount >= 3;
        return {
          ...def,
          earned,
          progress: Math.min(soloCount / 3, 1),
          progressLabel: earned ? undefined : `${soloCount}/3 solo trips`,
        };
      }
      case 'continent_hopper': {
        const earned = continentsVisited.size >= 4;
        return {
          ...def,
          earned,
          progress: Math.min(continentsVisited.size / 4, 1),
          progressLabel: earned ? undefined : `${continentsVisited.size}/4 continents`,
        };
      }
      case 'baker_dozen': {
        const earned = countriesVisited.size >= 13;
        return {
          ...def,
          earned,
          progress: Math.min(countriesVisited.size / 13, 1),
          progressLabel: earned ? undefined : `${countriesVisited.size}/13 countries`,
        };
      }
      case 'city_collector': {
        const earned = citiesVisited.size >= 25;
        return {
          ...def,
          earned,
          progress: Math.min(citiesVisited.size / 25, 1),
          progressLabel: earned ? undefined : `${citiesVisited.size}/25 cities`,
        };
      }
      case 'adventure_seeker': {
        const earned = adventureCount >= 5;
        return {
          ...def,
          earned,
          progress: Math.min(adventureCount / 5, 1),
          progressLabel: earned ? undefined : `${adventureCount}/5 adventure trips`,
        };
      }
      case 'world_wanderer': {
        const earned = continentsVisited.size >= 7;
        return {
          ...def,
          earned,
          progress: Math.min(continentsVisited.size / 7, 1),
          progressLabel: earned ? undefined : `${continentsVisited.size}/7 continents`,
        };
      }
      case 'half_century': {
        const earned = countriesVisited.size >= 50;
        return {
          ...def,
          earned,
          progress: Math.min(countriesVisited.size / 50, 1),
          progressLabel: earned ? undefined : `${countriesVisited.size}/50 countries`,
        };
      }
      default:
        return { ...def, earned: false };
    }
  });

  return results;
}
