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

// ─── Trip Pass per-member preferences ─────────────────────────────────────────
// The buyer fills the full Trip Builder. Other group members fill a trimmed
// mini-wizard that captures these fields, stored on `trip_members.preferences`
// and merged into the AI generation prompt. See memory project_trip_pass_design.

export type DietaryTag =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'gluten_free'
  | 'dairy_free'
  | 'halal'
  | 'kosher'
  | 'nut_allergy'
  | 'shellfish_allergy';

export type AccessibilityNeed =
  | 'wheelchair'
  | 'low_stamina'
  | 'no_stairs'
  | 'visual_impairment'
  | 'hearing_impairment'
  | 'service_animal';

export type PaceLevel = 'relaxed' | 'balanced' | 'packed';

export interface TripMemberPreferences {
  /** Subset of the buyer-side priorityOptions IDs (e.g. 'food', 'nature'). */
  priorities: string[];
  pace: PaceLevel;
  dietary: { tags: DietaryTag[]; notes?: string };
  accessibility: { needs: AccessibilityNeed[]; notes?: string };
  /** Per-person daily food budget in USD. Most-restrictive wins for food only. */
  budgetPerDay?: number;
  /** ISO timestamp the member submitted. Used for the 24h fallback. */
  submittedAt: string;
}

export interface AiCredits {
  /** Credits included per billing period */
  total: number;
  /** Credits used this period */
  used: number;
  /** ISO date the credits next refresh */
  refreshAt: string;
}

/** Cost of each AI action in credits.
 *
 * Pricing model: 1 credit ≈ $0.04 TripCoord cost. Costs revised 2026-05-16
 * to match real spend after the post-gen venue verification feature shipped.
 * The cost driver is the build: ~$0.40 Anthropic + ~$0.20 Places-list fetch
 * + ~$1.40 venue verification = ~$2.00 per build. At $0.04/credit that's
 * 25 credits per build (was 10, severely underpriced).
 *
 * Per-tier build counts at current credit caps (after this repricing):
 *   Free      —  25 cr →  1 build/mo (free tier was bumped 10→25 cr to
 *                          preserve the "1 build/mo" promise)
 *   Trip Pass —  50 cr →  1 build + 1 regen + 5 small tweaks per pass
 *   Explorer  — 100 cr →  4 builds/mo
 *   Nomad     — 250 cr → 10 builds/mo
 *
 * Discover-style lookup actions (generate_discover, generate_hotels, etc.)
 * stay at 1 credit because they're lightweight Haiku calls that build on
 * existing trip data — the user shouldn't feel penalized for exploration.
 */
export const AI_CREDIT_COSTS = {
  // Full itinerary build. Charged at the END of generation (only if
  // daysEmitted > 0) so failed builds don't burn credits.
  itinerary_generate: 25,
  // Regenerate on an existing trip. Cheaper than a fresh build because
  // the venue verification cache is 100% warm — we already verified all
  // these venues on the initial build, so the post-gen verify call is
  // essentially free. Real cost is ~$0.50 (Anthropic only). Bumped 5→20
  // then dropped to 10 once the cache shipped — keeps regen affordable
  // inside a Trip Pass (build 25 + regen 10 + 15 cr in tweaks).
  itinerary_regenerate: 10,
  transport_parse: 1,
  activity_suggest: 2,
  // PDF / text itinerary parse via /api/parse-itinerary. 3 credits because
  // PDFs ship as document blocks (~10–20K input tokens, ~$0.10–0.15 per
  // parse). Roughly aligned to $0.04/credit.
  parse_itinerary: 3,
  // Single-day AI generation via /api/trips/[id]/add-day. One day costs
  // roughly 1/Nth of a full build plus its own slice of verification.
  // 3 credits keeps add-day cheap enough that organizers extending a trip
  // by a day or two don't feel penalized.
  add_day: 3,
  // Receipt OCR via /api/parse-receipt — Opus + vision, ~$0.04–0.06.
  parse_receipt: 1,
  // /api/generate-hotels — Haiku, ~800 output tokens (~$0.02). Cheap
  // lookup — kept at 1 so exploration isn't penalized.
  generate_hotels: 1,
  // /api/generate-discover — Haiku, 4096-token output (~$0.05). Builds on
  // existing itinerary data; kept at 1 deliberately so users browse freely.
  generate_discover: 1,
  // /api/generate-layover — Sonnet, 6000-token output (~$0.10).
  generate_layover: 2,
  // /api/generate-packing — Haiku, 2048-token output (~$0.03). Nomad-only.
  generate_packing: 1,
  // /api/generate-phrases — Sonnet, 8192-token output (~$0.15). Nomad-only.
  // Bumped 2→4 to match real cost.
  generate_phrases: 4,
  // /api/enrich-itinerary — Haiku, ~1500 output tokens/day (~$0.02). Cheap.
  enrich_day: 1,
} as const;

export type AiAction = keyof typeof AI_CREDIT_COSTS;

/** Per-tier entitlement limits */
export const TIER_LIMITS: Record<SubscriptionTier, {
  activeTrips: number | 'plan_based';
  travelersPerTrip: number | 'plan_based';
  aiCreditsPerMonth: number | 'plan_based';
  /** Maximum AI-generated itinerary length in days */
  maxTripDays: number;
  /** Pre-booked hotels the user can attach when filling Trip Builder */
  maxBookedHotels: number;
  canUseAI: boolean;
  canUseTripStory: boolean;
  canUseYearInReview: boolean;
  canUseSplitTracks: boolean;
  canAddCoOrganizer: boolean;
  canUseTransportParser: boolean;
  canUseWishlist: boolean;
  canUseAIPacking: boolean;
  canUseAIPhrasebook: boolean;
  /** Manual group expense tracking (equal/custom splits, settlement calc) */
  canUseExpenses: boolean;
  /** AI receipt scanning via vision API — Nomad only */
  canUseAIReceiptScan: boolean;
  supportLevel: 'community' | 'email' | 'priority';
  earlyAccess: boolean;
}> = {
  free: {
    // Trip count is no longer the constraint — AI credits are.
    // Free users can plan as many trips as they like; the 25-credit
    // monthly allowance (= 1 itinerary build) is the natural throttle.
    // Bumped from 10 to 25 on 2026-05-16 when itinerary_generate was
    // repriced 10→25 cr to match real Anthropic + Places verify cost.
    activeTrips: 999,
    travelersPerTrip: 4,
    aiCreditsPerMonth: 25,
    maxTripDays: 7,
    maxBookedHotels: 1,
    canUseAI: true,
    canUseTripStory: true,   // Trip Story on all tiers — great for organic sharing
    canUseYearInReview: false,
    canUseSplitTracks: false,
    canAddCoOrganizer: false,
    canUseTransportParser: false,
    canUseWishlist: true,    // basic wishlist (no AI preview) — good retention + affiliate hook
    canUseAIPacking: false,
    canUseAIPhrasebook: false,
    canUseExpenses: false,
    canUseAIReceiptScan: false,
    supportLevel: 'community',
    earlyAccess: false,
  },
  trip_pass: {
    activeTrips: 'plan_based',   // only the purchased trip
    travelersPerTrip: 'plan_based', // 6 base + extras purchased
    aiCreditsPerMonth: 'plan_based', // 50 per pass (PRICING.trip_pass.aiCredits)
    maxTripDays: 7,
    maxBookedHotels: 3,
    canUseAI: true,
    canUseTripStory: true,
    canUseYearInReview: false,
    canUseSplitTracks: true,    // group trips benefit from split tracks; no ongoing AI cost
    canAddCoOrganizer: true,    // co-organiser is core to group trip planning — no AI cost
    canUseTransportParser: true,
    canUseWishlist: false,
    canUseAIPacking: false,
    canUseAIPhrasebook: false,
    canUseExpenses: true,
    canUseAIReceiptScan: false,
    supportLevel: 'email',
    earlyAccess: false,
  },
  explorer: {
    activeTrips: 999,          // unlimited in practice — AI credits are the constraint
    travelersPerTrip: 8,
    aiCreditsPerMonth: 100,
    maxTripDays: 10,
    maxBookedHotels: 3,
    canUseAI: true,
    canUseTripStory: true,
    canUseYearInReview: true,
    canUseSplitTracks: true,   // available from Trip Pass and up — group trips benefit
    canAddCoOrganizer: true,   // available from Trip Pass and up; Co-organizer uses their own AI credit pool
    canUseTransportParser: true,
    canUseWishlist: true,
    canUseAIPacking: false,
    canUseAIPhrasebook: false,
    canUseExpenses: true,
    canUseAIReceiptScan: false,
    supportLevel: 'email',
    earlyAccess: false,
  },
  nomad: {
    activeTrips: 999,          // unlimited in practice — AI credits are the constraint
    travelersPerTrip: 15,
    aiCreditsPerMonth: 250,
    maxTripDays: 14,
    maxBookedHotels: 7,
    canUseAI: true,
    canUseTripStory: true,
    canUseYearInReview: true,
    canUseSplitTracks: true,
    canAddCoOrganizer: true,
    canUseTransportParser: true,
    canUseWishlist: true,
    canUseAIPacking: true,
    canUseAIPhrasebook: true,
    canUseExpenses: true,
    canUseAIReceiptScan: true,
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

/** Unsplash attribution metadata persisted alongside an Unsplash-sourced
 *  coverImage. When present, TripCard renders the photographer credit chip.
 *  Null/undefined for user-uploaded covers (no attribution needed). */
export interface CoverImageMeta {
  photographer?: string | null;
  photographerUrl?: string | null;
  photoUrl?: string | null;
  downloadLocation?: string | null;
}

export interface Trip {
  id: string;
  creatorId: string;
  title: string;
  destination: string;
  coverImage: string;
  coverImageMeta?: CoverImageMeta | null;
  startDate: string;
  endDate: string;
  /** The user-selected trip length in days (from the trip builder button).
   *  Use this as the canonical day count — it's correct for both fixed-date
   *  and flexible-date trips. For flexible trips the date range spans the
   *  whole availability window, so date-diff would be wrong. */
  tripLength?: number;
  status: 'planning' | 'active' | 'completed';
  budgetTotal: number;
  budgetBreakdown: BudgetBreakdown;
  memberCount: number;
  guestCount: number;
  /** AI-planned per-day cities, derived server-side from
   *  `itineraries.days[].city`. Captures multi-city legs and side-trips. */
  cities?: string[];
  /** User-tagged ground truth of cities visited (`trips.visited_cities`).
   *  Wins over `cities` for the dashboard count and Trip Story map slide. */
  visitedCities?: string[];
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
  /** Set when the activity was added to the itinerary from the
   *  trip's What's Out There discover tab (vs. AI-generated). */
  fromDiscover?: boolean;
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
  /** Persisted vote tallies — updated whenever a traveler casts a Yay/Nay */
  upVotes?: number;
  downVotes?: number;
  /** Set to true when this activity was AI-replaced via "Suggest another" */
  wasReplaced?: boolean;
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
  /** Primary city/location for this day — used for per-day weather and localisation. */
  city?: string;
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
  /** Bonus foodie finds for the day — only present when Food is a top priority */
  foodieTips?: Array<{
    name: string; type?: string; neighborhood?: string;
    why?: string; bestFor?: string; orderThis?: string; priceRange?: string;
    timeOfDay?: string; tip?: string;
  }>;
  /** Per-day nightlife picks anchored to the day's neighborhoods — only when Nightlife is a top priority */
  nightlifeHighlights?: Array<{
    name: string; type?: string; neighborhood?: string;
    vibe?: string; bestNight?: string; openFrom?: string; tip?: string;
  }>;
  /** Per-day shopping picks anchored to the day's neighborhoods — only when Shopping is a top priority */
  shoppingGuide?: Array<{
    name: string; type?: string; neighborhood?: string;
    what?: string; bestFor?: string; openDays?: string; tip?: string;
  }>;
  /** Per-day sidebar spots keyed by priority id (nature/history/wellness/etc), anchored to that day */
  priorityHighlights?: Record<string, Array<{
    name: string; type?: string; neighborhood?: string;
    description?: string; bestFor?: string; bestTime?: string; tip?: string;
  }>>;
  /** Punchy insider fact about the destination for this day */
  destinationTip?: string;
  /** For split-track days: restaurant name + address where both tracks reconvene for dinner */
  dinnerMeetupLocation?: string | null;
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
}

export interface PackingItem {
  id: string;
  name: string;
  category: string;
  packed: boolean;
  affiliateUrl?: string;
}

/** Saved-link preview card on a wishlist item — TripAdvisor / Reddit /
 *  blog / Instagram URL pasted by the user, enriched at paste time
 *  with Open Graph metadata via /api/og-preview. */
export interface WishlistLink {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  fetchedAt: string;
}

export interface WishlistItem {
  id: string;
  destination: string;
  country: string;
  coverImage: string;
  bestSeason: string;
  estimatedCost: number;
  tags: string[];
  /** Static highlights pulled from VIBE_HIGHLIGHTS at save time. */
  highlights?: string[];
  /** Planned trip length in days (set during the Add Destination flow) */
  tripDays?: number;
  /** User-pasted link previews (TripAdvisor reviews, blog posts, etc.) */
  links?: WishlistLink[];
  /** User notes — free text */
  notes?: string;
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
