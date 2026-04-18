// ─── Subscription / entitlements ──────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'trip_pass' | 'explorer' | 'nomad';

export interface TripPass {
  /** The trip ID this pass is valid for */
  tripId: string;
  /** ISO date the pass was purchased */
  purchasedAt: string;
  /** ISO date the pass expires (trip end + 30 days) */
  expiresAt: string;
  /** Extra people purchased beyond the base 6 */
  extraPeople: number;
  /** AI credits included with this pass */
  aiCreditsTotal: number;
  /** AI credits consumed so far */
  aiCreditsUsed: number;
}

export interface AiCredits {
  /** Credits included per billing period */
  total: number;
  /** Credits used this period */
  used: number;
  /** ISO date the credits next refresh */
  refreshAt: string;
}

/** Cost of each AI action in credits */
export const AI_CREDIT_COSTS = {
  itinerary_generate: 10,
  itinerary_regenerate: 5,
  transport_parse: 1,
  activity_suggest: 2,
} as const;

export type AiAction = keyof typeof AI_CREDIT_COSTS;

/** Per-tier entitlement limits */
export const TIER_LIMITS: Record<SubscriptionTier, {
  activeTrips: number | 'plan_based';
  travelersPerTrip: number | 'plan_based';
  aiCreditsPerMonth: number | 'plan_based';
  /** Maximum AI-generated itinerary length in days */
  maxTripDays: number;
  canUseAI: boolean;
  canUseTripStory: boolean;
  canUseYearInReview: boolean;
  canUseSplitTracks: boolean;
  canAddCoOrganizer: boolean;
  canUseTransportParser: boolean;
  canUseWishlist: boolean;
  canUseAIPacking: boolean;
  canUseAIPhrasebook: boolean;
  supportLevel: 'community' | 'email' | 'priority';
  earlyAccess: boolean;
}> = {
  free: {
    activeTrips: 1,
    travelersPerTrip: 4,
    aiCreditsPerMonth: 10,
    maxTripDays: 7,
    canUseAI: true,
    canUseTripStory: false,
    canUseYearInReview: false,
    canUseSplitTracks: false,
    canAddCoOrganizer: false,
    canUseTransportParser: false,
    canUseWishlist: false,
    canUseAIPacking: false,
    canUseAIPhrasebook: false,
    supportLevel: 'community',
    earlyAccess: false,
  },
  trip_pass: {
    activeTrips: 'plan_based',   // only the purchased trip
    travelersPerTrip: 'plan_based', // 6 base + extras purchased
    aiCreditsPerMonth: 'plan_based', // 30 per pass
    maxTripDays: 7,
    canUseAI: true,
    canUseTripStory: true,
    canUseYearInReview: false,
    canUseSplitTracks: false,
    canAddCoOrganizer: false,
    canUseTransportParser: true,
    canUseWishlist: false,
    canUseAIPacking: false,
    canUseAIPhrasebook: false,
    supportLevel: 'email',
    earlyAccess: false,
  },
  explorer: {
    activeTrips: 8,
    travelersPerTrip: 8,
    aiCreditsPerMonth: 100,
    maxTripDays: 10,
    canUseAI: true,
    canUseTripStory: true,
    canUseYearInReview: true,
    canUseSplitTracks: false,
    canAddCoOrganizer: false,
    canUseTransportParser: true,
    canUseWishlist: true,
    canUseAIPacking: false,
    canUseAIPhrasebook: false,
    supportLevel: 'email',
    earlyAccess: false,
  },
  nomad: {
    activeTrips: 15,
    travelersPerTrip: 15,
    aiCreditsPerMonth: 350,
    maxTripDays: 14,
    canUseAI: true,
    canUseTripStory: true,
    canUseYearInReview: true,
    canUseSplitTracks: true,
    canAddCoOrganizer: true,
    canUseTransportParser: true,
    canUseWishlist: true,
    canUseAIPacking: true,
    canUseAIPhrasebook: true,
    supportLevel: 'priority',
    earlyAccess: true,
  },
};

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  travelPersona?: TravelPersona;
  subscriptionTier: SubscriptionTier;
  aiCredits?: AiCredits;
  tripPasses?: TripPass[];
}

export interface TravelPersona {
  style: string;
  groupType: string;
  priorities: string[];
}

export interface Trip {
  id: string;
  creatorId: string;
  title: string;
  destination: string;
  coverImage: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed';
  budgetTotal: number;
  budgetBreakdown: BudgetBreakdown;
  memberCount: number;
  guestCount: number;
}

export interface BudgetBreakdown {
  flights: number;
  hotel: number;
  food: number;
  experiences: number;
  transport: number;
}

export interface Activity {
  id: string;
  dayNumber: number;
  timeSlot: string;
  title: string;
  description: string;
  costEstimate: number;
  bookingUrl?: string;
  location?: { lat: number; lng: number; address: string };
  confidence: number;
  verified: boolean;
  track: 'shared' | 'track_a' | 'track_b';
  alternatives?: Activity[];
  category?: string;
  // Fields used by itinerary page UI
  name?: string;
  address?: string;
  website?: string;
  isRestaurant?: boolean;
  // Google Places enrichment
  placeId?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  lat?: number;
  lng?: number;
  googleVerified?: boolean;
  /** What to bring / pack for this activity (AI-generated for excursions/hikes) */
  packingTips?: string[];
  /** For restaurant activities: which meal slot this fills */
  mealType?: 'breakfast' | 'lunch' | 'dinner' | null;
  /** Transport to the next activity (AI-generated) */
  transportToNext?: {
    mode: string;
    durationMins: number;
    distanceMiles: number;
    notes?: string | null;
  } | null;
  /**
   * When true this activity is private — only visible to the traveler who added it.
   * Full enforcement requires auth (future); for now it's shown with a lock badge
   * and marked in the data model so it's ready when auth is wired up.
   */
  isPrivate?: boolean;
}

export type TransportType = 'car_rental' | 'bus' | 'train' | 'excursion';

export interface TransportLeg {
  id: string;
  type: TransportType;
  /** ISO time string "HH:MM" — used to sort the leg into the day timeline */
  departureTime: string;
  /** When the group should meet / be ready — often 15–30 min before departure */
  meetTime?: string;
  /** Where to assemble or board */
  meetingPoint: string;
  /** Where this transport is going */
  destination: string;
  /** Human-friendly duration e.g. "45 min" or "2h 30m" */
  duration?: string;
  // — Expandable details —
  operator?: string;         // "Hertz", "Reykjavik Excursions", "Strætó", "Flirt"
  confirmationRef?: string;  // booking / confirmation code
  notes?: string;            // free-form e.g. "Silver Dacia Duster · pickup code 4412"
  costPerPerson?: number;
  // Train / bus specifics
  fromStation?: string;
  toStation?: string;
  platform?: string;
  seatInfo?: string;
  // Car-rental specifics
  carClass?: string;
}

export interface PhotoSpot {
  name: string;
  /** Best time of day — e.g. "sunrise", "golden hour", "blue hour", "midday" */
  timeOfDay: string;
  /** One-sentence shooting tip */
  tip: string;
}

export interface ItineraryDay {
  day: number;
  date: string;
  theme: string;
  tracks: {
    shared: Activity[];
    track_a: Activity[];
    track_b: Activity[];
  };
  /** Human-readable label for track A, e.g. "Adventure & Outdoors" */
  trackALabel?: string;
  /** Human-readable label for track B, e.g. "Culture & Relaxation" */
  trackBLabel?: string;
  transportLegs?: TransportLeg[];
  meetupTime?: string;
  meetupLocation?: string;
  /** AI-curated photo opportunities for the day */
  photoSpots?: PhotoSpot[];
}

export interface GroupMember {
  id: string;
  name: string;
  avatarUrl?: string;
  role: 'owner' | 'member' | 'guest';
  interests: string[];
  joinedAt: string;
  email?: string;
}

export interface GroupVote {
  id: string;
  title: string;
  options: VoteOption[];
  status: 'open' | 'closed';
  closesAt?: string;
  result?: string;
  createdBy: string;
}

export interface VoteOption {
  id: string;
  label: string;
  votes: number;
  voters: string[];
}

export interface Expense {
  id: string;
  /** Name of the person who paid (matches groupMember.name) */
  paidBy: string;
  amount: number;
  currency: string;
  description: string;
  splitType: 'equal' | 'custom';
  date: string;
  category: 'flights' | 'accommodation' | 'dining' | 'experiences' | 'transport' | 'other';
  receiptUrl?: string;
  /** Names of people splitting this expense. If omitted, split among all group members. */
  splitAmong?: string[];
  /** For custom splits: per-person amounts keyed by member name */
  customAmounts?: Record<string, number>;
  /** Receipt line items parsed by AI */
  lineItems?: { description: string; amount: number }[];
}

/** Settlement transaction: `from` owes `to` the given amount */
export interface SettlementTransaction {
  from: string;
  to: string;
  amount: number;
}

export interface Message {
  id: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  createdAt: string;
  isOwn: boolean;
}

export interface PrepTask {
  id: string;
  category: 'document' | 'packing' | 'logistics';
  title: string;
  dueDate?: string;
  completed: boolean;
  urgent?: boolean;
}

export interface PackingItem {
  id: string;
  name: string;
  category: string;
  packed: boolean;
  affiliateUrl?: string;
}

export interface WishlistItem {
  id: string;
  destination: string;
  country: string;
  coverImage: string;
  bestSeason: string;
  estimatedCost: number;
  tags: string[];
  /** Top highlights generated by AI when added via the Add Destination modal */
  highlights?: string[];
  /** True when the card was created by the AI preview flow */
  aiGenerated?: boolean;
  /** Planned trip length in days (set during the Add Destination flow) */
  tripDays?: number;
}

export interface FlightAlert {
  id: string;
  origin: string;
  destination: string;
  currentPrice: number;
  lowestPrice: number;
  status: 'active' | 'paused';
}

export interface TripPhoto {
  id: string;
  url: string;
  day: number;
  activity: string;
  uploadedBy: string;
  timestamp: string;
}

export interface TranslationPhrase {
  id: string;
  category: string;
  english: string;
  local: string;
  phonetic: string;
}
