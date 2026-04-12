import {
  Trip, ItineraryDay, GroupMember, GroupVote, Expense, Message,
  PrepTask, PackingItem, WishlistItem, TripPhoto, TranslationPhrase, Activity, TransportLeg
} from '@/lib/types';

// ─── Transport Legs ───────────────────────────────────────────────────────────
// Keyed by day number for easy lookup in itineraryDays below

const transportDay1: TransportLeg[] = [
  {
    id: 'trn_001',
    type: 'car_rental',
    departureTime: '15:45',
    meetTime: '15:30',
    meetingPoint: 'Keflavik Airport — Arrivals Hall, Hertz counter',
    destination: 'Hotel Borg, Reykjavik',
    duration: '45 min',
    operator: 'Hertz',
    confirmationRef: 'HRZ-29104B',
    carClass: 'SUV — Dacia Duster 4x4',
    notes: 'Pickup code: 4412. Silver Dacia. F-road insurance recommended.',
    costPerPerson: 42,
  },
];

const transportDay2: TransportLeg[] = [
  {
    id: 'trn_002',
    type: 'excursion',
    departureTime: '09:30',
    meetTime: '09:15',
    meetingPoint: 'Hotel Borg front entrance',
    destination: 'Golden Circle (Þingvellir → Geysir → Gullfoss)',
    duration: '9 h',
    operator: 'Reykjavik Excursions',
    confirmationRef: 'RE-GC-88210',
    notes: 'Bus picks up from hotel. Wear layers — weather changes fast.',
    costPerPerson: 89,
  },
];

const transportDay3: TransportLeg[] = [
  {
    id: 'trn_003',
    type: 'car_rental',
    departureTime: '08:15',
    meetTime: '08:00',
    meetingPoint: 'Hotel Borg car park — silver Dacia Duster',
    destination: 'South Coast (Seljalandsfoss → Skógafoss → Reynisfjara)',
    duration: 'Self-drive · ~3 h driving total',
    notes: 'Route 1 south. Fuel up before leaving Reykjavik — fewer stations on the south coast.',
  },
];

const transportDay4: TransportLeg[] = [
  {
    id: 'trn_004',
    type: 'bus',
    departureTime: '11:00',
    meetTime: '10:45',
    meetingPoint: 'Mjódd Bus Terminal — Bay 7',
    destination: 'Blue Lagoon',
    duration: '50 min',
    fromStation: 'Mjódd Terminal, Reykjavik',
    toStation: 'Blue Lagoon entrance',
    operator: 'Strætó · Route 55',
    confirmationRef: 'SRT-7741',
    notes: 'Exact fare required if paying on bus. Day card also accepted.',
    costPerPerson: 8,
  },
];

export const currentUser = {
  id: 'user_1',
  email: 'brandon@triphive.app',
  name: 'Brandon',
  avatarUrl: undefined,
  travelPersona: {
    style: 'Explorer',
    groupType: 'Friends',
    priorities: ['Food', 'Culture', 'Adventure'],
  },
  subscriptionTier: 'nomad' as const,
  aiCredits: {
    total: 350,
    used: 42,
    refreshAt: '2026-05-01T00:00:00Z',
  },
  tripPasses: [] as import('@/lib/types').TripPass[],
};

export const trips: Trip[] = [
  {
    id: 'trip_1',
    creatorId: 'user_1',
    title: 'Iceland Adventure',
    destination: 'Reykjavik, Iceland',
    coverImage: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800',
    startDate: '2026-09-15',
    endDate: '2026-09-21',
    status: 'planning',
    budgetTotal: 4300,
    budgetBreakdown: { flights: 1800, hotel: 1000, food: 600, experiences: 600, transport: 300 },
    memberCount: 4,
    guestCount: 2,
  },
  {
    id: 'trip_2',
    creatorId: 'user_1',
    title: 'Tokyo Food Tour',
    destination: 'Tokyo, Japan',
    coverImage: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
    startDate: '2026-11-01',
    endDate: '2026-11-08',
    status: 'planning',
    budgetTotal: 5200,
    budgetBreakdown: { flights: 2200, hotel: 1200, food: 800, experiences: 600, transport: 400 },
    memberCount: 2,
    guestCount: 0,
  },
  {
    id: 'trip_3',
    creatorId: 'user_1',
    title: 'Barcelona Beach Week',
    destination: 'Barcelona, Spain',
    coverImage: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800',
    startDate: '2026-06-10',
    endDate: '2026-06-17',
    status: 'active',
    budgetTotal: 3100,
    budgetBreakdown: { flights: 1100, hotel: 800, food: 500, experiences: 400, transport: 300 },
    memberCount: 6,
    guestCount: 3,
  },
  {
    id: 'trip_4',
    creatorId: 'user_1',
    title: 'Amalfi Coast Escape',
    destination: 'Amalfi, Italy',
    coverImage: 'https://images.unsplash.com/photo-1534113414509-0eec2bfb493f?w=800',
    startDate: '2026-04-01',
    endDate: '2026-04-05',
    status: 'completed',
    budgetTotal: 2800,
    budgetBreakdown: { flights: 900, hotel: 900, food: 500, experiences: 300, transport: 200 },
    memberCount: 2,
    guestCount: 0,
  },
];

export const itineraryDays: ItineraryDay[] = [
  {
    day: 1,
    date: '2026-09-15',
    theme: 'Arrival & Reykjavik',
    tracks: {
      shared: [
        {
          id: 'act_001', dayNumber: 1, timeSlot: '15:00–17:00', title: 'Arrive at Keflavik Airport',
          description: 'Land at Keflavik International. Pick up rental car or take Flybus to city center.',
          costEstimate: 35, confidence: 5, verified: true, track: 'shared', category: 'transport',
          location: { lat: 63.985, lng: -22.605, address: 'Keflavik International Airport' },
        },
        {
          id: 'act_002', dayNumber: 1, timeSlot: '17:30–18:30', title: 'Check in at Hotel Borg',
          description: 'Iconic Art Deco hotel overlooking Austurvöllur Square. Walk to main attractions.',
          costEstimate: 280, confidence: 4, verified: true, track: 'shared', category: 'accommodation',
          location: { lat: 64.147, lng: -21.933, address: 'Pósthússtræti 11, Reykjavik' },
        },
        {
          id: 'act_003', dayNumber: 1, timeSlot: '19:00–21:00', title: 'Dinner at Grillið',
          description: 'Upscale Icelandic cuisine with panoramic city views. Try the lamb or Arctic char.',
          costEstimate: 85, confidence: 4, verified: true, track: 'shared', category: 'food',
          location: { lat: 64.144, lng: -21.927, address: 'Hagatorg, Reykjavik' },
        },
      ],
      track_a: [],
      track_b: [],
    },
    transportLegs: transportDay1,
    meetupTime: '19:00',
    meetupLocation: 'Hotel Borg lobby',
  },
  {
    day: 2,
    date: '2026-09-16',
    theme: 'Golden Circle',
    tracks: {
      shared: [
        {
          id: 'act_004', dayNumber: 2, timeSlot: '08:00–09:00', title: 'Breakfast at hotel',
          description: 'Full Icelandic breakfast buffet included with stay.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'food',
        },
        {
          id: 'act_005', dayNumber: 2, timeSlot: '09:30–11:30', title: 'Þingvellir National Park',
          description: 'UNESCO World Heritage site. Walk between tectonic plates. Historical parliament site.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'nature',
          location: { lat: 64.255, lng: -21.13, address: 'Þingvellir National Park' },
        },
        {
          id: 'act_006', dayNumber: 2, timeSlot: '12:00–13:30', title: 'Geysir Geothermal Area',
          description: 'Watch Strokkur geyser erupt every 5–10 minutes. Hot springs and mud pots.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'nature',
          location: { lat: 64.31, lng: -20.302, address: 'Geysir, Iceland' },
        },
        {
          id: 'act_007', dayNumber: 2, timeSlot: '14:00–15:00', title: 'Lunch at Geysir Glima',
          description: 'Casual restaurant near the geothermal area. Lamb soup and fresh bread.',
          costEstimate: 30, confidence: 3, verified: false, track: 'shared', category: 'food',
        },
        {
          id: 'act_008', dayNumber: 2, timeSlot: '15:30–17:00', title: 'Gullfoss Waterfall',
          description: 'Majestic two-tiered waterfall. Free to visit. Bring waterproof layers.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'nature',
          location: { lat: 64.326, lng: -20.121, address: 'Gullfoss, Iceland' },
        },
        {
          id: 'act_009', dayNumber: 2, timeSlot: '19:00–20:30', title: 'Dinner at Lækjarbrekka',
          description: 'Traditional Icelandic cuisine in a charming historic house. Fresh seafood and local specialties.',
          costEstimate: 70, confidence: 4, verified: true, track: 'shared', category: 'food',
          location: { lat: 64.146, lng: -21.933, address: 'Lækjargata 2A, Reykjavik' },
        },
      ],
      track_a: [],
      track_b: [],
    },
    transportLegs: transportDay2,
    meetupTime: '08:00',
    meetupLocation: 'Hotel lobby',
  },
  {
    day: 3,
    date: '2026-09-17',
    theme: 'South Coast Adventures',
    tracks: {
      shared: [
        {
          id: 'act_010', dayNumber: 3, timeSlot: '07:30–08:15', title: 'Grab & Go Breakfast at Hotel',
          description: 'Quick pastries, yogurt, and coffee before heading out on south coast adventure.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'food',
        },
        {
          id: 'act_011', dayNumber: 3, timeSlot: '08:30–10:30', title: 'Drive to Seljalandsfoss',
          description: 'Walk behind the 60m waterfall. Waterproof jacket essential.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'nature',
        },
        {
          id: 'act_012', dayNumber: 3, timeSlot: '11:00–12:30', title: 'Skógafoss Waterfall',
          description: 'Climb the 500 steps for panoramic views. Rainbow on sunny days.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'nature',
        },
        {
          id: 'act_013', dayNumber: 3, timeSlot: '12:45–13:45', title: 'Lunch at Skógafoss Café',
          description: 'Small café at the waterfall with hot soup, sandwiches, and local snacks.',
          costEstimate: 25, confidence: 4, verified: true, track: 'shared', category: 'food',
        },
        {
          id: 'act_016', dayNumber: 3, timeSlot: '19:00–20:30', title: 'Dinner at Sudur Vik',
          description: 'Southern Iceland institution with local lamb, fresh fish, and cozy atmosphere. Book ahead.',
          costEstimate: 55, confidence: 4, verified: true, track: 'shared', category: 'food',
          location: { lat: 63.418, lng: -19.008, address: 'Vik, Iceland' },
        },
      ],
      track_a: [
        {
          id: 'act_014', dayNumber: 3, timeSlot: '14:00–17:00', title: 'Glacier Hiking on Sólheimajökull',
          description: 'Guided 3-hour glacier hike. Crampons and gear provided. Moderate difficulty.',
          costEstimate: 95, confidence: 4, verified: true, track: 'track_a', category: 'adventure',
        },
      ],
      track_b: [
        {
          id: 'act_015', dayNumber: 3, timeSlot: '14:00–16:00', title: 'Vík Village & Black Sand Beach',
          description: 'Explore Reynisfjara black sand beach and sea stacks. Café stop in Vík.',
          costEstimate: 15, confidence: 5, verified: true, track: 'track_b', category: 'nature',
        },
      ],
    },
    transportLegs: transportDay3,
    meetupTime: '18:00',
    meetupLocation: 'Vík accommodation',
  },
  {
    day: 4,
    date: '2026-09-18',
    theme: 'Blue Lagoon & Reykjavik Nightlife',
    tracks: {
      shared: [
        {
          id: 'act_017', dayNumber: 4, timeSlot: '07:45–08:30', title: 'Breakfast at Hotel Borg',
          description: 'Hearty breakfast buffet before heading to Blue Lagoon adventure.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'food',
        },
        {
          id: 'act_018', dayNumber: 4, timeSlot: '10:00–13:00', title: 'Blue Lagoon',
          description: 'Iconic geothermal spa. Pre-booking essential. Includes one drink.',
          costEstimate: 85, confidence: 5, verified: true, track: 'shared', category: 'wellness',
          location: { lat: 63.88, lng: -22.449, address: 'Norðurljósavegur 9, Grindavík' },
        },
        {
          id: 'act_019', dayNumber: 4, timeSlot: '14:00–15:30', title: 'Lunch in Reykjavik — Bæjarins Beztu',
          description: 'Famous Icelandic hot dog stand since 1937. A must-try Reykjavik experience.',
          costEstimate: 12, confidence: 5, verified: true, track: 'shared', category: 'food',
        },
        {
          id: 'act_020', dayNumber: 4, timeSlot: '16:00–18:00', title: 'Hallgrímskirkja & Laugavegur Shopping',
          description: 'Iconic church tower views, then browse the main shopping street.',
          costEstimate: 15, confidence: 5, verified: true, track: 'shared', category: 'culture',
        },
        {
          id: 'act_021', dayNumber: 4, timeSlot: '19:00–20:45', title: 'Dinner at Dill Restaurant',
          description: 'Michelin-starred restaurant featuring innovative Nordic cuisine and local ingredients.',
          costEstimate: 120, confidence: 4, verified: true, track: 'shared', category: 'food',
          location: { lat: 64.141, lng: -21.94, address: 'Laugavegur 56, Reykjavik' },
        },
        {
          id: 'act_022', dayNumber: 4, timeSlot: '21:00–00:00', title: 'Northern Lights Tour',
          description: 'Bus tour to dark sky areas outside the city. Weather dependent.',
          costEstimate: 70, confidence: 3, verified: true, track: 'shared', category: 'nature',
        },
      ],
      track_a: [],
      track_b: [],
    },
    transportLegs: transportDay4,
  },
  {
    day: 5,
    date: '2026-09-19',
    theme: 'Whale Watching & Departure',
    tracks: {
      shared: [
        {
          id: 'act_023', dayNumber: 5, timeSlot: '07:30–08:15', title: 'Quick Breakfast at Hotel',
          description: 'Light breakfast before whale watching tour.',
          costEstimate: 0, confidence: 5, verified: true, track: 'shared', category: 'food',
        },
        {
          id: 'act_024', dayNumber: 5, timeSlot: '09:00–12:00', title: 'Whale Watching from Reykjavik',
          description: 'Sail from the Old Harbour. Minke whales, dolphins, and puffins common in September.',
          costEstimate: 85, confidence: 4, verified: true, track: 'shared', category: 'nature',
        },
        {
          id: 'act_025', dayNumber: 5, timeSlot: '13:00–14:00', title: 'Lunch at the Old Harbour',
          description: 'Fresh seafood at one of the harbour restaurants.',
          costEstimate: 40, confidence: 4, verified: false, track: 'shared', category: 'food',
        },
        {
          id: 'act_028', dayNumber: 5, timeSlot: '18:30–19:45', title: 'Farewell Dinner at Grillmarket',
          description: 'Casual upscale Icelandic restaurant perfect for a final celebration. Great cocktails.',
          costEstimate: 65, confidence: 4, verified: true, track: 'shared', category: 'food',
          location: { lat: 64.146, lng: -21.934, address: 'Frakkastígur 2A, Reykjavik' },
        },
      ],
      track_a: [
        {
          id: 'act_026', dayNumber: 5, timeSlot: '15:00–17:00', title: 'National Museum of Iceland',
          description: 'Viking history and Icelandic culture from settlement to modern day.',
          costEstimate: 18, confidence: 5, verified: true, track: 'track_a', category: 'culture',
        },
      ],
      track_b: [
        {
          id: 'act_027', dayNumber: 5, timeSlot: '15:00–17:30', title: 'Perlan Museum & Observation Deck',
          description: 'Interactive exhibits on Icelandic nature. Planetarium and 360° observation deck.',
          costEstimate: 35, confidence: 5, verified: true, track: 'track_b', category: 'culture',
        },
      ],
    },
    meetupTime: '18:30',
    meetupLocation: 'Hotel lobby',
  },
];

export const groupMembers: GroupMember[] = [
  { id: 'user_1', name: 'Brandon', role: 'owner', interests: ['Food', 'Culture', 'Adventure', 'Photography'], joinedAt: '2026-08-01' },
  { id: 'user_2', name: 'Sarah Chen', role: 'member', interests: ['Nature', 'Wellness', 'Food', 'Photography'], joinedAt: '2026-08-03' },
  { id: 'user_3', name: 'Marcus Johnson', role: 'member', interests: ['Adventure', 'Nightlife', 'Sports', 'Food'], joinedAt: '2026-08-05' },
  { id: 'user_4', name: 'Emily Park', role: 'member', interests: ['Culture', 'History', 'Food', 'Shopping'], joinedAt: '2026-08-05' },
  { id: 'guest_1', name: 'Alex Rivera', role: 'guest', interests: ['Adventure', 'Nature', 'Photography'], joinedAt: '2026-08-10', email: 'alex@email.com' },
  { id: 'guest_2', name: 'Jordan', role: 'guest', interests: ['Food', 'Wellness', 'Nature'], joinedAt: '2026-08-12' },
];

export const groupVotes: GroupVote[] = [
  {
    id: 'vote_1', title: 'Add sunset boat tour on Day 3?', status: 'open', closesAt: '2026-09-10',
    createdBy: 'AI',
    options: [
      { id: 'opt_1', label: 'Yes — looks amazing!', votes: 4, voters: ['Brandon', 'Sarah', 'Alex', 'Jordan'] },
      { id: 'opt_2', label: 'No — too tired after glacier hike', votes: 1, voters: ['Marcus'] },
      { id: 'opt_3', label: 'Maybe — depends on weather', votes: 1, voters: ['Emily'] },
    ],
  },
  {
    id: 'vote_2', title: 'Restaurant for Day 4 dinner?', status: 'open', closesAt: '2026-09-12',
    createdBy: 'Emily Park',
    options: [
      { id: 'opt_4', label: 'Dill — Michelin starred', votes: 3, voters: ['Brandon', 'Emily', 'Sarah'] },
      { id: 'opt_5', label: 'Grillmarket — casual upscale', votes: 2, voters: ['Marcus', 'Alex'] },
      { id: 'opt_6', label: 'Fish Market — seafood focus', votes: 1, voters: ['Jordan'] },
    ],
  },
  {
    id: 'vote_3', title: 'Skip Blue Lagoon for Sky Lagoon?', status: 'closed', result: 'Blue Lagoon wins',
    createdBy: 'Marcus Johnson',
    options: [
      { id: 'opt_7', label: 'Keep Blue Lagoon', votes: 4, voters: ['Brandon', 'Sarah', 'Emily', 'Jordan'] },
      { id: 'opt_8', label: 'Switch to Sky Lagoon', votes: 2, voters: ['Marcus', 'Alex'] },
    ],
  },
];

const GROUP_NAMES = ['Brandon', 'Sarah Chen', 'Marcus Johnson', 'Emily Park', 'Alex Rivera'];

export const expenses: Expense[] = [
  {
    id: 'exp_1', paidBy: 'Brandon', amount: 1120, currency: 'USD',
    description: 'Hotel Borg — 4 nights (group booking)',
    splitType: 'equal', date: '2026-08-20', category: 'accommodation',
    splitAmong: GROUP_NAMES,
  },
  {
    id: 'exp_2', paidBy: 'Sarah Chen', amount: 380, currency: 'USD',
    description: 'Glacier hiking tour — 4 tickets',
    splitType: 'equal', date: '2026-08-22', category: 'experiences',
    splitAmong: GROUP_NAMES,
    lineItems: [
      { description: 'Glacier hike ticket × 4', amount: 320 },
      { description: 'Equipment rental', amount: 60 },
    ],
  },
  {
    id: 'exp_3', paidBy: 'Marcus Johnson', amount: 340, currency: 'USD',
    description: 'Blue Lagoon — 4 premium tickets',
    splitType: 'equal', date: '2026-08-25', category: 'experiences',
    splitAmong: ['Brandon', 'Sarah Chen', 'Marcus Johnson', 'Emily Park'],
  },
  {
    id: 'exp_4', paidBy: 'Brandon', amount: 510, currency: 'USD',
    description: 'Rental car — 5 days',
    splitType: 'equal', date: '2026-08-28', category: 'transport',
    splitAmong: GROUP_NAMES,
  },
  {
    id: 'exp_5', paidBy: 'Emily Park', amount: 170, currency: 'USD',
    description: 'Dinner at Grillið',
    splitType: 'custom', date: '2026-09-15', category: 'dining',
    splitAmong: GROUP_NAMES,
    customAmounts: { Brandon: 38, 'Sarah Chen': 32, 'Marcus Johnson': 40, 'Emily Park': 30, 'Alex Rivera': 30 },
    lineItems: [
      { description: 'Lamb shank × 2', amount: 80 },
      { description: 'Arctic char', amount: 38 },
      { description: 'Cocktails × 4', amount: 32 },
      { description: 'Desserts × 2', amount: 20 },
    ],
  },
  {
    id: 'exp_6', paidBy: 'Alex Rivera', amount: 85, currency: 'USD',
    description: 'Whale watching — 1 ticket',
    splitType: 'custom', date: '2026-09-01', category: 'experiences',
    splitAmong: ['Alex Rivera'],
    customAmounts: { 'Alex Rivera': 85 },
  },
];

export const messages: Message[] = [
  { id: 'msg_1', senderName: 'Sarah Chen', content: 'Just booked the glacier tour! 🧊 Got us the morning slot so we have the afternoon free.', createdAt: '2026-08-22T10:30:00', isOwn: false },
  { id: 'msg_2', senderName: 'Brandon', content: 'Nice! I added the Northern Lights tour for Day 4 — it\'s weather dependent but September is supposed to be great.', createdAt: '2026-08-22T10:45:00', isOwn: true },
  { id: 'msg_3', senderName: 'Marcus Johnson', content: 'Yo can we add a day at the hot springs? Not the Blue Lagoon, like a local one', createdAt: '2026-08-22T11:02:00', isOwn: false },
  { id: 'msg_4', senderName: 'Emily Park', content: 'I created a vote for the Day 4 dinner spot. Everyone please vote!', createdAt: '2026-08-23T09:15:00', isOwn: false },
  { id: 'msg_5', senderName: 'Alex Rivera', content: 'Hey everyone! Just joined the trip. The itinerary looks incredible 🔥', createdAt: '2026-08-24T14:00:00', isOwn: false },
  { id: 'msg_6', senderName: 'Jordan', content: 'Same here! So excited. Do we need special gear for the glacier hike?', createdAt: '2026-08-24T14:30:00', isOwn: false },
  { id: 'msg_7', senderName: 'Brandon', content: 'Crampons and gear are provided by the tour company. Just bring waterproof layers and good hiking boots!', createdAt: '2026-08-24T14:45:00', isOwn: true },
  { id: 'msg_8', senderName: 'Sarah Chen', content: 'Also pack a swimsuit for the Blue Lagoon day. And sunscreen — you can still burn in Iceland!', createdAt: '2026-08-24T15:00:00', isOwn: false },
];

export const prepTasks: PrepTask[] = [
  { id: 'prep_1', category: 'document', title: 'Check passport validity (6+ months required)', dueDate: '2026-08-01', completed: true },
  { id: 'prep_2', category: 'document', title: 'No visa required for US citizens (Schengen area)', completed: true },
  { id: 'prep_3', category: 'document', title: 'Purchase travel insurance', dueDate: '2026-09-01', completed: false, urgent: true },
  { id: 'prep_4', category: 'document', title: 'Download offline map of Iceland', dueDate: '2026-09-14', completed: false },
  { id: 'prep_5', category: 'logistics', title: 'Book airport transfer or arrange car pickup', dueDate: '2026-09-10', completed: true },
  { id: 'prep_6', category: 'logistics', title: 'Arrange pet care for trip duration', dueDate: '2026-09-12', completed: false },
  { id: 'prep_7', category: 'logistics', title: 'Set up international phone plan or buy local SIM', dueDate: '2026-09-14', completed: false },
  { id: 'prep_8', category: 'logistics', title: 'Notify bank of travel dates', dueDate: '2026-09-10', completed: true },
  { id: 'prep_9', category: 'logistics', title: 'Exchange currency — ISK (Icelandic Krona)', completed: false },
];

export const packingItems: PackingItem[] = [
  { id: 'pack_1', name: 'Waterproof jacket (Gore-Tex recommended)', category: 'Clothing', packed: true },
  { id: 'pack_2', name: 'Thermal base layers (2 sets)', category: 'Clothing', packed: false },
  { id: 'pack_3', name: 'Hiking boots (waterproof, broken in)', category: 'Clothing', packed: true },
  { id: 'pack_4', name: 'Warm fleece or down jacket', category: 'Clothing', packed: false },
  { id: 'pack_5', name: 'Swimsuit (Blue Lagoon + hot springs)', category: 'Clothing', packed: false },
  { id: 'pack_6', name: 'Wool socks (3+ pairs)', category: 'Clothing', packed: false },
  { id: 'pack_7', name: 'Beanie and gloves', category: 'Clothing', packed: true },
  { id: 'pack_8', name: 'Sunglasses (glacier glare)', category: 'Accessories', packed: false },
  { id: 'pack_9', name: 'Passport', category: 'Documents', packed: false },
  { id: 'pack_10', name: 'Travel insurance documents', category: 'Documents', packed: false },
  { id: 'pack_11', name: 'Hotel & activity confirmations (printed)', category: 'Documents', packed: false },
  { id: 'pack_12', name: 'Camera + extra batteries', category: 'Electronics', packed: true },
  { id: 'pack_13', name: 'Portable charger / power bank', category: 'Electronics', packed: false },
  { id: 'pack_14', name: 'EU power adapter (Type C/F)', category: 'Electronics', packed: false },
  { id: 'pack_15', name: 'Sunscreen SPF 30+', category: 'Toiletries', packed: false },
  { id: 'pack_16', name: 'Lip balm with SPF', category: 'Toiletries', packed: false },
  { id: 'pack_17', name: 'Hand warmers', category: 'Gear', packed: false },
  { id: 'pack_18', name: 'Daypack / small backpack', category: 'Gear', packed: true },
];

export const wishlistItems: WishlistItem[] = [
  { id: 'wish_1', destination: 'Kyoto', country: 'Japan', coverImage: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800', bestSeason: 'Spring (Mar–May)', estimatedCost: 3800, tags: ['Culture', 'Food', 'Temples'] },
  { id: 'wish_2', destination: 'Patagonia', country: 'Argentina', coverImage: 'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800', bestSeason: 'Nov–Mar', estimatedCost: 4500, tags: ['Adventure', 'Nature', 'Hiking'] },
  { id: 'wish_3', destination: 'Marrakech', country: 'Morocco', coverImage: 'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800', bestSeason: 'Mar–May', estimatedCost: 2200, tags: ['Culture', 'Food', 'Markets'] },
  { id: 'wish_4', destination: 'Queenstown', country: 'New Zealand', coverImage: 'https://images.unsplash.com/photo-1589871973318-9ca1258faa5d?w=800', bestSeason: 'Dec–Feb', estimatedCost: 5100, tags: ['Adventure', 'Nature', 'Photography'] },
  { id: 'wish_5', destination: 'Santorini', country: 'Greece', coverImage: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800', bestSeason: 'Jun–Sep', estimatedCost: 3200, tags: ['Romance', 'Food', 'Photography'] },
  { id: 'wish_6', destination: 'Bali', country: 'Indonesia', coverImage: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800', bestSeason: 'Apr–Oct', estimatedCost: 2800, tags: ['Wellness', 'Culture', 'Nature'] },
];

export const tripPhotos: TripPhoto[] = [
  { id: 'photo_1', url: 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=600', day: 1, activity: 'Arrival', uploadedBy: 'Brandon', timestamp: '2026-09-15T16:30:00' },
  { id: 'photo_2', url: 'https://images.unsplash.com/photo-1520769669658-f07657f5a307?w=600', day: 2, activity: 'Þingvellir', uploadedBy: 'Sarah Chen', timestamp: '2026-09-16T10:30:00' },
  { id: 'photo_3', url: 'https://images.unsplash.com/photo-1504893524553-b855bce32c67?w=600', day: 2, activity: 'Geysir', uploadedBy: 'Marcus Johnson', timestamp: '2026-09-16T12:45:00' },
  { id: 'photo_4', url: 'https://images.unsplash.com/photo-1509225770129-c9654483efb5?w=600', day: 2, activity: 'Gullfoss', uploadedBy: 'Emily Park', timestamp: '2026-09-16T16:00:00' },
  { id: 'photo_5', url: 'https://images.unsplash.com/photo-1531168556467-80aace0d0144?w=600', day: 3, activity: 'Seljalandsfoss', uploadedBy: 'Brandon', timestamp: '2026-09-17T09:30:00' },
  { id: 'photo_6', url: 'https://images.unsplash.com/photo-1476610182048-b716b8515aaa?w=600', day: 3, activity: 'Glacier Hike', uploadedBy: 'Alex Rivera', timestamp: '2026-09-17T15:00:00' },
  { id: 'photo_7', url: 'https://images.unsplash.com/photo-1515002246390-7bf7e8f87b39?w=600', day: 4, activity: 'Blue Lagoon', uploadedBy: 'Sarah Chen', timestamp: '2026-09-18T11:00:00' },
  { id: 'photo_8', url: 'https://images.unsplash.com/photo-1474690870753-1b92efa1f2d8?w=600', day: 4, activity: 'Northern Lights', uploadedBy: 'Brandon', timestamp: '2026-09-18T22:00:00' },
];

export const translationPhrases: TranslationPhrase[] = [
  { id: 'phrase_1', category: 'Arrival', english: 'Hello', local: 'Halló', phonetic: 'HAH-lo' },
  { id: 'phrase_2', category: 'Arrival', english: 'Thank you', local: 'Takk fyrir', phonetic: 'TAHK FIR-ir' },
  { id: 'phrase_3', category: 'Arrival', english: 'Goodbye', local: 'Bless', phonetic: 'BLESS' },
  { id: 'phrase_4', category: 'Restaurant', english: 'The check, please', local: 'Reikninginn, takk', phonetic: 'RAYK-ning-in, TAHK' },
  { id: 'phrase_5', category: 'Restaurant', english: 'I would like...', local: 'Ég myndi vilja...', phonetic: 'YEG MIN-di VIL-ya' },
  { id: 'phrase_6', category: 'Transport', english: 'Where is...?', local: 'Hvar er...?', phonetic: 'KVAR er' },
  { id: 'phrase_7', category: 'Emergency', english: 'Help!', local: 'Hjálp!', phonetic: 'HYOWLP' },
  { id: 'phrase_8', category: 'Emergency', english: 'Call an ambulance', local: 'Hringdu í sjúkrabíl', phonetic: 'HRING-du ee SYOOK-ra-beel' },
  { id: 'phrase_9', category: 'Shopping', english: 'How much does this cost?', local: 'Hvað kostar þetta?', phonetic: 'KVATH KOS-tar THET-ta' },
  { id: 'phrase_10', category: 'Hotel', english: 'I have a reservation', local: 'Ég er með bókun', phonetic: 'YEG er meth BO-kun' },
];

export const suggestedDestinations = [
  { name: 'Swiss Alps', country: 'Switzerland', image: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=600', tagline: 'Peak season starts in 6 weeks', matchScore: 95 },
  { name: 'Porto', country: 'Portugal', image: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=600', tagline: 'Wine, history, and coastline', matchScore: 91 },
  { name: 'Oaxaca', country: 'Mexico', image: 'https://images.unsplash.com/photo-1578632292335-df3abbb0d586?w=600', tagline: 'Food capital of the Americas', matchScore: 88 },
];

// ─── Discover destinations ────────────────────────────────────────────────────

export type VibeTag = 'Adventure' | 'Culture' | 'Food' | 'Beach' | 'Wellness' | 'Romance' | 'City Break' | 'Nature';

export interface DiscoverDestination {
  id: string;
  name: string;
  country: string;
  continent: string;
  image: string;
  tagline: string;
  description: string;
  vibes: VibeTag[];
  avgCost: number;        // USD / person / week estimate
  bestMonths: string;
  flightHours: number;    // from NYC approx
  trending: boolean;
  editorPick: boolean;
  affiliateLinks: {
    flights: string;
    hotels: string;
    experiences: string;
  };
}

export const discoverDestinations: DiscoverDestination[] = [
  {
    id: 'disc_1',
    name: 'Kyoto',
    country: 'Japan',
    continent: 'Asia',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800',
    tagline: 'Ancient temples, neon nights, and the best ramen of your life.',
    description: 'Wander bamboo groves in the morning, browse Nishiki Market at noon, and watch lanterns float on the Kamo River at dusk.',
    vibes: ['Culture', 'Food', 'City Break'],
    avgCost: 2800,
    bestMonths: 'Mar–May, Oct–Nov',
    flightHours: 14,
    trending: true,
    editorPick: true,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/kyoa/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Kyoto&aid=triphive',
      experiences: 'https://www.getyourguide.com/kyoto-l96/?partner_id=triphive',
    },
  },
  {
    id: 'disc_2',
    name: 'Lisbon',
    country: 'Portugal',
    continent: 'Europe',
    image: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
    tagline: 'Tilework, trams, and the world\'s best pastel de nata.',
    description: 'Ride the historic Tram 28 through impossibly steep streets, eat your weight in pastéis, and end every evening with a glass of ginjinha.',
    vibes: ['Culture', 'Food', 'City Break'],
    avgCost: 1900,
    bestMonths: 'Mar–Jun, Sep–Oct',
    flightHours: 7,
    trending: true,
    editorPick: false,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/lisb/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Lisbon&aid=triphive',
      experiences: 'https://www.getyourguide.com/lisbon-l42/?partner_id=triphive',
    },
  },
  {
    id: 'disc_3',
    name: 'Queenstown',
    country: 'New Zealand',
    continent: 'Oceania',
    image: 'https://images.unsplash.com/photo-1589871973318-9ca1258faa5d?w=800',
    tagline: 'Bungee jump at dawn. Pinot Noir at sunset.',
    description: 'The adventure capital of the world delivers impossibly blue lakes and peaks straight out of Middle-earth — plus a surprisingly killer food scene.',
    vibes: ['Adventure', 'Nature'],
    avgCost: 3800,
    bestMonths: 'Dec–Feb',
    flightHours: 18,
    trending: false,
    editorPick: true,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/zqn/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Queenstown&aid=triphive',
      experiences: 'https://www.getyourguide.com/queenstown-l1023/?partner_id=triphive',
    },
  },
  {
    id: 'disc_4',
    name: 'Marrakech',
    country: 'Morocco',
    continent: 'Africa',
    image: 'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800',
    tagline: 'A labyrinth of spice, color, and sensory overload.',
    description: 'Get lost in the medina, haggle for lanterns in the souks, and fall asleep to the call to prayer from a rooftop riad.',
    vibes: ['Culture', 'Food'],
    avgCost: 1600,
    bestMonths: 'Mar–May, Oct–Nov',
    flightHours: 8,
    trending: false,
    editorPick: false,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/rak/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Marrakech&aid=triphive',
      experiences: 'https://www.getyourguide.com/marrakesh-l208/?partner_id=triphive',
    },
  },
  {
    id: 'disc_5',
    name: 'Patagonia',
    country: 'Argentina & Chile',
    continent: 'South America',
    image: 'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800',
    tagline: 'The end of the world, in the best possible way.',
    description: 'Trek the W Circuit past the iconic horns of Torres del Paine, camp beside glaciers, and drink Malbec in towns that feel like the edge of the earth.',
    vibes: ['Adventure', 'Nature'],
    avgCost: 3200,
    bestMonths: 'Nov–Mar',
    flightHours: 11,
    trending: false,
    editorPick: true,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/punta-arenas/?adultsv2=1',
      hotels: 'https://www.booking.com/searchresults.html?ss=Patagonia&aid=triphive',
      experiences: 'https://www.getyourguide.com/patagonia-l2621/?partner_id=triphive',
    },
  },
  {
    id: 'disc_6',
    name: 'Bali',
    country: 'Indonesia',
    continent: 'Asia',
    image: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800',
    tagline: 'Terraced rice fields, surf breaks, and ceremony at every corner.',
    description: 'Meditate at sunrise in Ubud, catch a dawn barrel at Uluwatu, and join a temple ceremony in full ceremonial dress — all in the same day.',
    vibes: ['Wellness', 'Culture', 'Beach'],
    avgCost: 1800,
    bestMonths: 'Apr–Oct',
    flightHours: 20,
    trending: true,
    editorPick: false,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/dps/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Bali&aid=triphive',
      experiences: 'https://www.getyourguide.com/bali-l347/?partner_id=triphive',
    },
  },
  {
    id: 'disc_7',
    name: 'Santorini',
    country: 'Greece',
    continent: 'Europe',
    image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800',
    tagline: 'Where every sunset looks like a screensaver.',
    description: 'Sip Assyrtiko on a clifftop in Oia, take a boat to the volcanic hot springs, and eat grilled octopus watching the caldera turn pink.',
    vibes: ['Romance', 'Beach', 'Food'],
    avgCost: 3600,
    bestMonths: 'Jun–Sep',
    flightHours: 10,
    trending: true,
    editorPick: false,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/jtr/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Santorini&aid=triphive',
      experiences: 'https://www.getyourguide.com/santorini-l2697/?partner_id=triphive',
    },
  },
  {
    id: 'disc_8',
    name: 'Oaxaca',
    country: 'Mexico',
    continent: 'North America',
    image: 'https://images.unsplash.com/photo-1578632292335-df3abbb0d586?w=800',
    tagline: 'The food capital of Mexico. Full stop.',
    description: 'Drink mezcal at a rooftop bar, take a mole-making class with a local abuela, and browse the Saturday market in Tlacolula for handwoven textiles.',
    vibes: ['Food', 'Culture'],
    avgCost: 1400,
    bestMonths: 'Oct–Apr',
    flightHours: 6,
    trending: true,
    editorPick: true,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/oax/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Oaxaca&aid=triphive',
      experiences: 'https://www.getyourguide.com/oaxaca-l3800/?partner_id=triphive',
    },
  },
  {
    id: 'disc_9',
    name: 'Swiss Alps',
    country: 'Switzerland',
    continent: 'Europe',
    image: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800',
    tagline: 'Ski in the morning. Fondue by the fire at night.',
    description: 'Take the cogwheel train to Jungfraujoch, hike the Haute Route in summer, and stay in a mountain hut where the stars are impossibly bright.',
    vibes: ['Adventure', 'Nature', 'Romance'],
    avgCost: 4200,
    bestMonths: 'Dec–Mar, Jun–Sep',
    flightHours: 8,
    trending: false,
    editorPick: false,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/zrha/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Swiss+Alps&aid=triphive',
      experiences: 'https://www.getyourguide.com/swiss-alps-l2682/?partner_id=triphive',
    },
  },
  {
    id: 'disc_10',
    name: 'Cape Town',
    country: 'South Africa',
    continent: 'Africa',
    image: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800',
    tagline: 'Table Mountain, Boulders Beach, and Stellenbosch wine country.',
    description: 'Hike up Table Mountain for a 360° view of two oceans, drive the Cape Peninsula for penguin sightings, and end the day in a vineyard.',
    vibes: ['Adventure', 'Nature', 'Food'],
    avgCost: 2400,
    bestMonths: 'Nov–Apr',
    flightHours: 15,
    trending: false,
    editorPick: true,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/cpt/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Cape+Town&aid=triphive',
      experiences: 'https://www.getyourguide.com/cape-town-l153/?partner_id=triphive',
    },
  },
  {
    id: 'disc_11',
    name: 'Amalfi Coast',
    country: 'Italy',
    continent: 'Europe',
    image: 'https://images.unsplash.com/photo-1534113414509-0eec2bfb493f?w=800',
    tagline: 'Cliffs, limoncello, and absurdly blue water.',
    description: 'Rent a scooter along the SS163, swim in hidden grottos accessible only by boat, and eat too much pasta in a terrace restaurant above the sea.',
    vibes: ['Romance', 'Beach', 'Food'],
    avgCost: 3100,
    bestMonths: 'May–Jun, Sep',
    flightHours: 9,
    trending: false,
    editorPick: false,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/nap/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Amalfi+Coast&aid=triphive',
      experiences: 'https://www.getyourguide.com/amalfi-coast-l2526/?partner_id=triphive',
    },
  },
  {
    id: 'disc_12',
    name: 'Chiang Mai',
    country: 'Thailand',
    continent: 'Asia',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
    tagline: 'Night markets, elephant sanctuaries, and the best khao soi anywhere.',
    description: 'Visit the famous Sunday Walking Street, take a cooking class at a farm outside the city, and catch Yi Peng lantern festival if timing allows.',
    vibes: ['Culture', 'Food', 'Wellness'],
    avgCost: 1200,
    bestMonths: 'Nov–Feb',
    flightHours: 19,
    trending: false,
    editorPick: false,
    affiliateLinks: {
      flights: 'https://www.skyscanner.net/flights/nyca/cnx/?adultsv2=1&cabinclass=economy',
      hotels: 'https://www.booking.com/searchresults.html?ss=Chiang+Mai&aid=triphive',
      experiences: 'https://www.getyourguide.com/chiang-mai-l973/?partner_id=triphive',
    },
  },
];
