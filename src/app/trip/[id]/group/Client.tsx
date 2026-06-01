'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Avatar } from '@/components/Avatar';
import { groupMembers as mockGroupMembers, expenses as mockExpenses, messages as mockMessages, MOCK_TRIP_IDS } from '@/data/mock';
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client';

// Generic geographic qualifiers dropped (alongside the trip's destination
// words) when matching wishlist items that point at the same real place.
// Deliberately conservative — words like "city"/"center" are excluded so
// distinct venues (e.g. a "Convention Center") aren't wrongly merged.
const WISHLIST_GEO_STOPWORDS = new Set([
  'bay', 'area', 'downtown', 'uptown', 'midtown', 'district',
  'old', 'town', 'the', 'greater', 'metro', 'region',
]);

// One-tap prompts shown in the Group Votes empty state. Tapping one opens the
// vote modal pre-filled with the question so the crew can spin up a poll fast.
const VOTE_STARTERS = [
  'Where should we eat dinner?',
  'What time should we start the day?',
  'Which activity should we add?',
];

interface VoteOption { id: string; label: string; votes: number; voters?: string[]; }
interface Vote {
  id: string;
  title: string;
  status: 'open' | 'closed';
  closesAt?: string;
  options: VoteOption[];
  /** 'single' = one pick per user (default); 'multi' = users can pick multiple. */
  voteType?: 'single' | 'multi';
  /** Multi-pick cap. null/undefined = no cap. */
  maxPicks?: number | null;
  /** Distinct users who've cast at least one pick on this poll. */
  distinctVoterCount?: number;
  /** Option_ids the current user has picked on this poll (server-supplied). */
  userPicks?: string[];
}
interface GroupMemberData { id: string; name: string; email?: string | null; avatarUrl?: string | null; role: string; joinedAt?: string; interests?: string[]; preferencesSubmittedAt?: string | null; }
import {
  UserPlus,
  Send,
  Plus,
  TrendingUp,
  ChevronRight,
  Users,
  Receipt,
  Upload,
  Camera,
  FileText,
  ScanLine,
  Lock,
  ShieldCheck,
  Crown,
  CalendarDays,
  CheckCircle2,
  X,
  MessageCircle,
  Vote,
  ChevronDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useModalUX } from '@/hooks/useModalUX';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { UpgradeModal, LockBadge } from '@/components/UpgradeModal';
import { EmptyState } from '@/components/EmptyState';
import type { ItineraryDay, Activity } from '@/lib/types';

type TabType = 'overview' | 'expenses' | 'chat' | 'votes';

type SettlementTransaction = {
  from: string;
  to: string;
  amount: number;
};

type ScannedReceipt = {
  merchant: string;
  total: number;
  subtotal?: number;
  tax?: number;
  tip?: number;
  date: string;
  items: string[];
  category?: string;
};

export default function GroupPage({ params }: { params: { id: string } }) {
  const isMockTrip = MOCK_TRIP_IDS.has(params.id);

  // For mock trips: static data. For real trips: fetched from Supabase.
  const [groupMembers, setGroupMembers] = useState<GroupMemberData[]>(
    isMockTrip ? (mockGroupMembers as GroupMemberData[]) : []
  );
  const expenses = isMockTrip ? mockExpenses : [];
  const [chatMessages, setChatMessages] = useState(isMockTrip ? mockMessages : []);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [dataLoading, setDataLoading] = useState(!isMockTrip);
  // Tracks which group resources failed their initial fetch so we can surface
  // an inline error banner instead of silently rendering an empty tab. Without
  // this, a failed /expenses or /messages fetch looked identical to "no data
  // yet" — users had no way to tell something was broken.
  const [tabLoadErrors, setTabLoadErrors] = useState<{ votes: boolean; chat: boolean; expenses: boolean; members: boolean }>(
    { votes: false, chat: false, expenses: false, members: false }
  );

  // Current user info (for message attribution)
  // Defaults to empty so we never accidentally send a chat or expense
  // tagged as "You" before the auth fetch resolves. Consumers are
  // expected to wait for a non-empty value before persisting.
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Trip name for invite messages — fetched from Supabase for real trips
  const [tripName, setTripName] = useState<string>(isMockTrip ? 'Iceland Adventure' : 'our trip');

  // isTripPassTrip drives the Trip Pass overlay in useEntitlements: when this
  // specific trip has an active trip_passes purchase, every invitee — regardless
  // of their own tier — gets the Trip Pass trip-scoped features (expenses,
  // co-organizer, split tracks, transport parser) on this trip. Explorer/Nomad
  // organizers' personal subscriptions do NOT trigger the overlay.
  const [isTripPassTrip, setIsTripPassTrip] = useState<boolean>(false);

  // Fetch current user info for message attribution
  useEffect(() => {
    if (isMockTrip) return;
    fetch('/api/auth/me').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.name) { setCurrentUserName(data.name); setNewExpensePaidBy(data.name); }
      if (data?.id) setCurrentUserId(data.id);
    }).catch(() => {});
  }, [isMockTrip]);

  // Load all real-trip data from Supabase APIs
  useEffect(() => {
    if (isMockTrip) return;
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(params.id);
    if (!looksLikeUuid) return;

    const loadAll = async () => {
      setDataLoading(true);
      setTabLoadErrors({ votes: false, chat: false, expenses: false, members: false });
      // ok=false signals "fetch ran but the server returned an error". The
      // tabLoadErrors flags below are derived from this so we can show banners.
      const fetchOrFlag = (url: string) =>
        fetch(url).then(r => r.ok ? r.json() : { __failed: true, status: r.status });
      try {
        // Fetch trip title, members, votes, messages, wishlist, expenses in parallel
        const [tripRes, membersRes, votesRes, messagesRes, wishlistRes, expensesRes, settlementsRes] = await Promise.allSettled([
          fetchOrFlag(`/api/trips/${params.id}`),
          fetchOrFlag(`/api/trips/${params.id}/members`),
          fetchOrFlag(`/api/trips/${params.id}/group-votes`),
          fetchOrFlag(`/api/trips/${params.id}/messages`),
          fetchOrFlag(`/api/trips/${params.id}/discover-wishlist`),
          fetchOrFlag(`/api/trips/${params.id}/expenses`),
          fetchOrFlag(`/api/trips/${params.id}/settlements`),
        ]);

        setTabLoadErrors({
          members: membersRes.status === 'rejected' || (membersRes.status === 'fulfilled' && membersRes.value?.__failed),
          votes: votesRes.status === 'rejected' || (votesRes.status === 'fulfilled' && votesRes.value?.__failed),
          chat: messagesRes.status === 'rejected' || (messagesRes.status === 'fulfilled' && messagesRes.value?.__failed),
          expenses: expensesRes.status === 'rejected' || (expensesRes.status === 'fulfilled' && expensesRes.value?.__failed),
        });

        if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.title) {
          setTripName(tripRes.value.trip.title);
        }
        if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.destination) {
          setTripDestination(tripRes.value.trip.destination);
        }
        if (tripRes.status === 'fulfilled' && typeof tripRes.value?.trip?.group_size === 'number') {
          setTripGroupSize(tripRes.value.trip.group_size);
        }
        if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.budget_total) {
          setTripBudgetTotal(tripRes.value.trip.budget_total);
        }
        if (tripRes.status === 'fulfilled' && typeof tripRes.value?.trip?.is_private === 'boolean') {
          setTripIsPrivate(tripRes.value.trip.is_private);
        }
        if (tripRes.status === 'fulfilled' && typeof tripRes.value?.isTripPassTrip === 'boolean') {
          setIsTripPassTrip(tripRes.value.isTripPassTrip);
        }
        if (tripRes.status === 'fulfilled' && tripRes.value?.itinerary?.days) {
          const days: ItineraryDay[] = tripRes.value.itinerary.days;
          setItineraryDaysData(days);
          // Find all activities where downVotes > upVotes
          const nays: NayActivity[] = [];
          for (const day of days) {
            for (const track of ['shared', 'track_a', 'track_b'] as const) {
              for (const act of (day.tracks?.[track] ?? [])) {
                if ((act.downVotes ?? 0) > 0 && (act.downVotes ?? 0) > (act.upVotes ?? 0)) {
                  nays.push({
                    id: act.id,
                    name: act.name || act.title || 'Activity',
                    dayNumber: day.day,
                    timeSlot: act.timeSlot ?? '',
                    upVotes: act.upVotes ?? 0,
                    downVotes: act.downVotes ?? 0,
                  });
                }
              }
            }
          }
          setNayActivities(nays);
        }
        if (membersRes.status === 'fulfilled' && membersRes.value?.members) {
          setGroupMembers(membersRes.value.members);
        }
        if (votesRes.status === 'fulfilled' && votesRes.value?.votes) {
          setVotes(votesRes.value.votes);
          // Hydrate the current user's picks from the server so "voted"
          // styling survives a page reload. Without this, the user sees
          // the right vote counts but no indication of which option(s)
          // they themselves picked.
          const picksByVote: Record<string, string[]> = {};
          for (const v of votesRes.value.votes as Vote[]) {
            if (v.userPicks && v.userPicks.length > 0) picksByVote[v.id] = v.userPicks;
          }
          setUserVotes(picksByVote);
        }
        if (messagesRes.status === 'fulfilled' && messagesRes.value?.messages) {
          // Shape returned by /api/trips/[id]/messages — reactions is the
          // Supabase Json column (we narrow per-emoji below).
          type MessageRow = {
            id: string;
            senderId: string | null;
            senderName: string;
            content: string;
            createdAt: string;
            reactions?: unknown;
          };
          const rawMessages: MessageRow[] = messagesRes.value.messages;
          // Mark messages from current user as isOwn
          const msgs = rawMessages.map((m) => ({
            ...m,
            isOwn: currentUserId ? m.senderId === currentUserId : false,
          }));
          setChatMessages(msgs);
          // Populate reactions from DB
          const initialReactions: Record<string, Record<string, string[]>> = {};
          for (const m of rawMessages) {
            if (m.reactions && typeof m.reactions === 'object') {
              const normalized: Record<string, string[]> = {};
              for (const [emoji, val] of Object.entries(m.reactions as Record<string, unknown>)) {
                normalized[emoji] = Array.isArray(val) ? (val as string[]) : [];
              }
              initialReactions[m.id] = normalized;
            }
          }
          setReactions(initialReactions);
        }
        if (expensesRes.status === 'fulfilled' && expensesRes.value?.expenses) {
          // Shape from /api/trips/[id]/expenses GET (the camelCased mapping).
          type ExpenseRow = {
            id: string;
            description: string;
            amount: number;
            paidByName: string;
            splitType: 'equal' | 'custom';
            category: string;
            customAmounts?: Record<string, number>;
            lineItems?: { description: string; amount: number }[];
            settled?: boolean;
          };
          const rawExpenses: ExpenseRow[] = expensesRes.value.expenses;
          const mapped = rawExpenses.map((e) => ({
            id: e.id,
            name: e.description,
            amount: e.amount,
            paidBy: e.paidByName,
            splitType: e.splitType,
            category: e.category,
            splitAmong: [],
            customAmounts: e.customAmounts ?? {},
            lineItems: e.lineItems ?? [],
            settled: e.settled ?? false,
          }));
          setLocalExpenses(mapped);
        }
        if (settlementsRes.status === 'fulfilled' && Array.isArray(settlementsRes.value?.settlements)) {
          setSettlementPayments(settlementsRes.value.settlements);
        }
        if (wishlistRes.status === 'fulfilled' && wishlistRes.value?.items) {
          // Sort by total engagement (up + down) descending, then by yay-heavy first
          const sorted = [...wishlistRes.value.items].sort((a: WishlistItem, b: WishlistItem) => {
            const engA = a.upVotes + a.downVotes;
            const engB = b.upVotes + b.downVotes;
            if (engB !== engA) return engB - engA;
            return b.upVotes - a.upVotes;
          });
          setWishlistItems(sorted);
        }
      } catch { /* ignore */ } finally {
        setDataLoading(false);
      }
    };

    loadAll();
  }, [isMockTrip, params.id, currentUserId]);

  const { canAddTraveler, getUpgradePrompt, hasCoOrganizer, hasExpenses, hasAIReceiptScan } = useEntitlements(params.id, isTripPassTrip);
  const [showTravelerUpgrade, setShowTravelerUpgrade] = useState(false);

  // Co-organizer role state
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null);

  const handleRoleChange = async (memberId: string, newRole: 'member' | 'co_organizer') => {
    if (!hasCoOrganizer || isMockTrip) return;
    setRoleUpdating(memberId);
    try {
      const res = await fetch(`/api/trips/${params.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, role: newRole }),
      });
      if (!res.ok) {
        // Parse the server's error reason if it's JSON (e.g. "Co-organizer
        // roles require a Nomad subscription"). Without this, the user clicks
        // and sees no change — they don't know if they hit a tier gate, a
        // permission error, or a network issue.
        let detail = `request failed (${res.status})`;
        try {
          const errBody = await res.json() as { error?: string };
          if (errBody?.error) detail = errBody.error;
        } catch { /* response wasn't JSON */ }
        throw new Error(detail);
      }
      setGroupMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    } catch (err) {
      console.error('Role change error:', err);
      const msg = err instanceof Error ? err.message : 'Try again.';
      setActionError(`Couldn't update role — ${msg}`);
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setRoleUpdating(null);
    }
  };

  // Nay Watch — activities where downVotes > upVotes, loaded from itinerary
  type NayActivity = { id: string; name: string; dayNumber: number; timeSlot: string; upVotes: number; downVotes: number; };
  const [nayActivities, setNayActivities] = useState<NayActivity[]>([]);
  const [replacingActivityId, setReplacingActivityId] = useState<string | null>(null);
  const [replacedActivityIds, setReplacedActivityIds] = useState<Set<string>>(new Set());
  const [tripDestination, setTripDestination] = useState<string>('');
  // Planned party size from the Trip Builder (trips.group_size). This is the
  // expected headcount, which can exceed the number of people who have
  // actually joined (groupMembers.length). Showing both as "X of N joined"
  // avoids the dashboard-card-vs-group-hub mismatch where the card showed the
  // planned size (group_size) and the hub showed only joined members.
  const [tripGroupSize, setTripGroupSize] = useState<number>(0);
  const [itineraryDaysData, setItineraryDaysData] = useState<ItineraryDay[]>([]);
  // Trip budget_total from Supabase — used to calculate the utilization bar
  const [tripBudgetTotal, setTripBudgetTotal] = useState<number>(0);
  // Privacy flag — when true, /join/[id] without a valid invite token is
  // rejected with 403 by the members POST. UI toggle on the Overview tab.
  const [tripIsPrivate, setTripIsPrivate] = useState<boolean>(false);
  const [privacyToggleSaving, setPrivacyToggleSaving] = useState(false);

  // Discover Wishlist — items voted on in the What's Out There tab
  type WishlistItem = {
    itemId: string;
    itemData: {
      name?: string; category?: string; rating?: number; priceRange?: string;
      description?: string; duration?: string; location?: string;
      imageUrl?: string; imageGradient?: string; bookable?: boolean;
      affiliatePartner?: string; affiliateDeepUrl?: string; matchScore?: number;
    };
    upVotes: number;
    downVotes: number;
    myVote: 'up' | 'down' | null;
  };
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [wishlistAddingId, setWishlistAddingId] = useState<string | null>(null);
  const [wishlistAddedIds, setWishlistAddedIds] = useState<Set<string>>(new Set());
  const [wishlistDayPicker, setWishlistDayPicker] = useState<string | null>(null);

  // The What's Out There feed sometimes surfaces the same real place twice
  // under slightly different names ("Busch Gardens Tampa" vs "Busch Gardens
  // Tampa Bay"), each a separate item with its own votes — so the votes split
  // across two cards. Merge them into one card by a name key that drops the
  // trip's destination words plus a few generic geo qualifiers, then re-sort
  // by engagement (yay-heavy first) for display.
  const mergedWishlistItems = useMemo<WishlistItem[]>(() => {
    const destTokens = new Set(
      tripDestination.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    );
    const keyFor = (name?: string) =>
      String(name ?? '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t && !destTokens.has(t) && !WISHLIST_GEO_STOPWORDS.has(t))
        .join(' ');

    const byPlace = new Map<string, WishlistItem & { _repEngagement: number }>();
    for (const item of wishlistItems) {
      const engagement = item.upVotes + item.downVotes;
      // Fall back to itemId when the name normalizes to nothing, so unnamed
      // items never collapse into one another.
      const key = keyFor(item.itemData.name) || item.itemId;
      const existing = byPlace.get(key);
      if (!existing) {
        byPlace.set(key, { ...item, _repEngagement: engagement });
        continue;
      }
      existing.upVotes += item.upVotes;
      existing.downVotes += item.downVotes;
      if (existing.myVote === null) existing.myVote = item.myVote;
      // Keep the higher-engagement entry as the representative so its itemId
      // and itemData (used by the icon, link, and "Add to Trip") survive.
      if (engagement > existing._repEngagement) {
        existing.itemId = item.itemId;
        existing.itemData = item.itemData;
        existing._repEngagement = engagement;
      }
    }

    return Array.from(byPlace.values())
      .sort((a, b) => {
        const engA = a.upVotes + a.downVotes;
        const engB = b.upVotes + b.downVotes;
        if (engB !== engA) return engB - engA;
        return b.upVotes - a.upVotes;
      })
      .map((m) => ({
        itemId: m.itemId,
        itemData: m.itemData,
        upVotes: m.upVotes,
        downVotes: m.downVotes,
        myVote: m.myVote,
      }));
  }, [wishlistItems, tripDestination]);

  // Add a Wishlist item to the itinerary on the chosen day
  const handleWishlistAddToItinerary = async (item: WishlistItem, dayNumber: number) => {
    setWishlistAddingId(item.itemId);
    try {
      // Fetch fresh itinerary days
      let days = itineraryDaysData;
      if (!days.length) {
        const res = await fetch(`/api/trips/${params.id}`);
        if (res.ok) {
          const data = await res.json();
          days = data.itinerary?.days ?? [];
          setItineraryDaysData(days);
        }
      }
      const dayIndex = days.findIndex(d => d.day === dayNumber);
      if (dayIndex === -1) throw new Error('Day not found');

      // Explicit Activity type so the literal-string fields (track, mealType)
      // narrow to their union members instead of being inferred as plain
      // `string`. Previously the inline object needed a double cast at the
      // assignment site to widen back into Activity — typing it up front
      // means the ItineraryDay merge below works without any cast.
      const newActivity: Activity = {
        id: `wish_${item.itemId}_${Date.now()}`,
        dayNumber,
        timeSlot: item.itemData.category === 'dining' ? '19:00–21:00' : '14:00–16:00',
        name: item.itemData.name ?? item.itemId,
        title: item.itemData.name ?? item.itemId,
        address: item.itemData.location ?? '',
        isRestaurant: item.itemData.category === 'dining',
        mealType: item.itemData.category === 'dining' ? 'dinner' : null,
        track: 'shared',
        priceLevel: 2,
        description: item.itemData.description ?? '',
        costEstimate: 0,
        confidence: 0.8,
        verified: false,
        packingTips: [],
        fromDiscover: true,
      };

      const updatedDays: ItineraryDay[] = days.map((d, i) => {
        if (i !== dayIndex) return d;
        return { ...d, tracks: { ...d.tracks, shared: [...(d.tracks?.shared ?? []), newActivity] } };
      });

      const patchRes = await fetch(`/api/trips/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: updatedDays }),
      });
      if (!patchRes.ok) throw new Error('Save failed');

      setItineraryDaysData(updatedDays);
      setWishlistAddedIds(prev => new Set(Array.from(prev).concat(item.itemId)));
      setWishlistDayPicker(null);
    } catch (err) {
      // Surface so the user knows the day-picker close didn't mean
      // success. Mirrors confirmAddToItinerary's setAddToItinError
      // pattern below — dismiss after 4s like other action toasts.
      console.error('[group] wishlist add to itinerary failed:', err);
      setActionError("Couldn't add that to the itinerary. Please try again.");
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setWishlistAddingId(null);
    }
  };

  // Replace a majority-Nay activity with an AI suggestion
  const handleReplaceNayActivity = async (nay: NayActivity) => {
    setReplacingActivityId(nay.id);
    try {
      // Collect every existing activity name across the trip so the AI doesn't
      // suggest a venue that's already on another day.
      const excludeNames: string[] = [];
      const seen = new Set<string>();
      for (const d of itineraryDaysData) {
        for (const tr of ['shared', 'track_a', 'track_b'] as const) {
          for (const a of (d.tracks?.[tr] ?? [])) {
            const name = (a.name || a.title || '').trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            excludeNames.push(name);
          }
        }
      }

      // Pass the DAY's city (not the trip-level destination) so excursion
      // days like Versailles get a Versailles-area suggestion, not a
      // Paris one. Falls back to tripDestination when the day has no
      // city set (older trips built before the 2026-05-30 prompt fix).
      const dayForNay = itineraryDaysData.find(d => d.day === nay.dayNumber);
      const dayCity = dayForNay?.city || tripDestination;
      const res = await fetch('/api/suggest-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dayCity,
          dayNumber: nay.dayNumber,
          date: dayForNay?.date ?? '',
          existingActivityName: nay.name,
          timeSlot: nay.timeSlot,
          track: 'shared',
          excludeNames,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.activity) throw new Error(data.message || 'No suggestion');

      // Patch the replacement into the itinerary
      const updatedDays: ItineraryDay[] = itineraryDaysData.map(day => {
        if (day.day !== nay.dayNumber) return day;
        const replaceInTrack = (arr: Activity[]) =>
          arr.map(a => a.id === nay.id ? { ...data.activity, id: nay.id, track: a.track, upVotes: 0, downVotes: 0 } : a);
        return {
          ...day,
          tracks: {
            shared:  replaceInTrack(day.tracks?.shared  ?? []),
            track_a: replaceInTrack(day.tracks?.track_a ?? []),
            track_b: replaceInTrack(day.tracks?.track_b ?? []),
          },
        };
      });

      // Without the explicit res.ok check, a failed PATCH would still be
      // followed by the local state updates below — UI would show the
      // replacement, but on refresh the original (Nay'd) activity returns.
      const patchRes = await fetch(`/api/trips/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: updatedDays }),
      });
      if (!patchRes.ok) throw new Error(`save failed: ${patchRes.status}`);

      setItineraryDaysData(updatedDays);
      setReplacedActivityIds(prev => new Set(Array.from(prev).concat(nay.id)));
      setNayActivities(prev => prev.filter(a => a.id !== nay.id));
    } catch (err) {
      console.error('Replace activity error:', err);
      setActionError("Couldn't replace activity. Please try again.");
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setReplacingActivityId(null);
    }
  };

  // Vote → Add to Itinerary state
  const [addToItinVote, setAddToItinVote] = useState<{ voteId: string; label: string } | null>(null);
  useEscapeKey(() => setAddToItinVote(null), !!addToItinVote);
  const [addToItinDay, setAddToItinDay] = useState<number>(1);
  const [addToItinDays, setAddToItinDays] = useState<number>(7);
  const [addToItinSaving, setAddToItinSaving] = useState(false);
  const [addToItinDone, setAddToItinDone] = useState<string | null>(null);
  const [addToItinError, setAddToItinError] = useState<string | null>(null);

  const openAddToItinerary = async (voteId: string, label: string) => {
    setAddToItinVote({ voteId, label });
    setAddToItinDay(1);
    setAddToItinDone(null);
    // Try to load the number of itinerary days
    if (!isMockTrip) {
      try {
        const r = await fetch(`/api/trips/${params.id}`);
        const data = await r.json();
        const days = data?.itinerary?.days;
        if (Array.isArray(days) && days.length > 0) setAddToItinDays(days.length);
      } catch { /* use default */ }
    }
  };

  const confirmAddToItinerary = async () => {
    if (!addToItinVote) return;
    setAddToItinSaving(true);
    setAddToItinError(null);
    try {
      if (!isMockTrip) {
        // Fetch current itinerary, inject new activity, save.
        // Without explicit res.ok checks the previous handler showed
        // "Added!" unconditionally — even when the PATCH failed silently.
        // The activity would then vanish on refresh and the user would
        // think they'd added it.
        const r = await fetch(`/api/trips/${params.id}`);
        if (!r.ok) throw new Error(`Couldn't load itinerary (${r.status})`);
        const data = await r.json();
        const days: ItineraryDay[] = data?.itinerary?.days ?? [];
        const dayIdx = days.findIndex(d => d.day === addToItinDay);
        const newActivity: Activity = {
          id: `act_vote_${Date.now()}`,
          dayNumber: addToItinDay,
          timeSlot: '12:00',
          title: addToItinVote.label,
          name: addToItinVote.label,
          description: `Added from group vote: "${addToItinVote.label}"`,
          costEstimate: 0,
          confidence: 1,
          verified: false,
          track: 'shared',
          isRestaurant: false,
        };
        if (dayIdx >= 0) {
          days[dayIdx] = {
            ...days[dayIdx],
            tracks: {
              ...days[dayIdx].tracks,
              shared: [...(days[dayIdx].tracks?.shared ?? []), newActivity],
            },
          };
        }
        const patchRes = await fetch(`/api/trips/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days }),
        });
        if (!patchRes.ok) throw new Error(`Save failed (${patchRes.status})`);
      }
      setAddToItinDone(addToItinVote.label);
      setTimeout(() => setAddToItinVote(null), 1800);
    } catch (err) {
      console.error('Add-to-itinerary error:', err);
      setAddToItinError(err instanceof Error ? err.message : 'Could not add to itinerary. Please try again.');
    } finally {
      setAddToItinSaving(false);
    }
  };

  // Open the group page on a specific tab when the URL has ?tab=chat | votes
  // | expenses | overview (used by the notification bell to deep-link directly
  // to the chat/poll the user was notified about).
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const t = searchParams?.get('tab');
    return t === 'chat' || t === 'votes' || t === 'expenses' || t === 'overview'
      ? (t as TabType)
      : 'overview';
  })();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  // Trip Pass post-checkout landing — Stripe sends the buyer back here with
  // ?checkout=success. Show a one-time toast so they know the purchase went
  // through and can immediately invite the crew via the panel above.
  const [showPassPurchasedToast, setShowPassPurchasedToast] = useState(
    searchParams?.get('checkout') === 'success',
  );
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Size the chat panel by measurement instead of a guessed viewport calc:
  // fill from the panel's top edge down to just above the viewport bottom, so
  // the composer is always on-screen (messages scroll inside the panel) no
  // matter how tall the header/tabs are or what device chrome is showing.
  const chatPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeTab !== 'chat' || dataLoading) return;
    const fit = () => {
      const el = chatPanelRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      el.style.height = `${Math.max(360, window.innerHeight - top - 16)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [activeTab, dataLoading]);
  const [uploadedReceipt, setUploadedReceipt] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedReceipt | null>(null);
  // Emoji reactions: keyed by messageId → emoji → userId[]
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '✈️'];

  const toggleReaction = async (messageId: string, emoji: string) => {
    setShowReactionPicker(null);
    if (!currentUserId && !isMockTrip) return;

    // Capture pre-state for rollback. Without this, a failed PATCH leaves the
    // emoji visible to the current user but absent for everyone else — and on
    // refresh the reaction disappears, which reads as a flaky chat.
    const prevReactions = reactions;

    // Optimistic update
    setReactions(prev => {
      const msgReactions = { ...(prev[messageId] || {}) };
      const users = [...(msgReactions[emoji] || [])];
      const uid = currentUserId ?? 'mock_user';
      const idx = users.indexOf(uid);
      if (idx >= 0) {
        users.splice(idx, 1);
      } else {
        users.push(uid);
      }
      msgReactions[emoji] = users;
      return { ...prev, [messageId]: msgReactions };
    });

    // Persist for real trips
    if (!isMockTrip) {
      try {
        const res = await fetch(`/api/trips/${params.id}/messages/${messageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        });
        if (!res.ok) throw new Error(`reaction failed: ${res.status}`);
      } catch (err) {
        console.error('Reaction error:', err);
        setReactions(prevReactions);
        setActionError("Couldn't save reaction. Try again.");
        setTimeout(() => setActionError(null), 4000);
      }
    }
  };

  const [memberInvited, setMemberInvited] = useState(false);
  const [voteCreated, setVoteCreated] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [settledUp, setSettledUp] = useState(false);
  // Recorded debtor->creditor payments (settle-up ledger). Net balances =
  // owed (from expenses) − these payments, so "Mark Paid" clears one txn only.
  const [settlementPayments, setSettlementPayments] = useState<Array<{ id: string; fromName: string; toName: string; amount: number }>>([]);
  // The "Mark Paid" badge is now derived from whether all merged expenses
  // are settled — see the inline check at the Suggested Payments button.
  // Previously this state was a Set<number> keyed by settlement-array index,
  // which kept showing "Paid" on stale rows after new expenses arrived.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Member profile photo uploads (keyed by member id → data URL)
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Track which member card triggered the file picker
  const pendingAvatarMemberId = useRef<string>('');

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const memberId = pendingAvatarMemberId.current || (currentUserId ?? '');
    if (!memberId) return;

    // Optimistic preview — show the file via FileReader so the avatar updates
    // immediately while the upload runs.
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setMemberAvatars(prev => ({ ...prev, [memberId]: dataUrl }));
    };
    reader.readAsDataURL(file);

    // Upload to Supabase Storage + persist on profiles.avatar_url so it
    // survives navigation, shows for other trip members, and propagates to
    // every other trip the user is on. Without this the previous behavior
    // was "data URL in React state only" — vanished on refresh.
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      const { url } = await res.json() as { url: string };
      // Replace the temporary data URL with the persisted public URL
      setMemberAvatars(prev => ({ ...prev, [memberId]: url }));
      // Also keep groupMembers in sync so the avatar persists when the
      // memberAvatars overlay state is cleared on remount.
      setGroupMembers(prev => prev.map(m => m.id === memberId ? { ...m, avatarUrl: url } : m));
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setActionError('Couldn’t save your photo. Try again.');
      setTimeout(() => setActionError(null), 4000);
      // Roll back the optimistic data URL so it doesn't look like it saved
      setMemberAvatars(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    }
  };

  // Invite Members Modal
  const [showInviteModal, setShowInviteModal] = useState(false);
  useEscapeKey(() => setShowInviteModal(false), showInviteModal);
  const [inviteMethod, setInviteMethod] = useState<'email' | 'text' | 'link'>('email');
  const [inviteContact, setInviteContact] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Track which options the current user has picked, per vote.
  // Single-pick votes: the array has 0 or 1 entries (mirrors radio behavior).
  // Multi-pick votes: the array tracks all picks, with max_picks enforced
  // by the server on each toggle. Hydrated from server on initial load via
  // the `userPicks` field returned by GET /group-votes.
  const [userVotes, setUserVotes] = useState<Record<string, string[]>>({});

  const handleCastVote = async (voteId: string, optionId: string) => {
    const vote = votes.find(v => v.id === voteId);
    if (!vote || vote.status === 'closed') return;
    const isMulti = vote.voteType === 'multi';
    const currentPicks = userVotes[voteId] ?? [];
    const alreadyPicked = currentPicks.includes(optionId);

    // Single-pick: clicking the already-picked option is a no-op (matches
    // existing UX — radio buttons don't deselect themselves).
    // Multi-pick: clicking an already-picked option toggles it OFF.
    if (!isMulti && alreadyPicked) return;
    if (isMulti && !alreadyPicked && vote.maxPicks && currentPicks.length >= vote.maxPicks) {
      setActionError(`You can pick at most ${vote.maxPicks} option${vote.maxPicks === 1 ? '' : 's'} on this poll.`);
      setTimeout(() => setActionError(null), 4000);
      return;
    }

    // Capture pre-update state for rollback
    const prevVotes = votes;
    const prevUserVotes = userVotes;

    // Compute optimistic next-picks and per-option delta
    const nextPicks = isMulti
      ? (alreadyPicked ? currentPicks.filter(id => id !== optionId) : [...currentPicks, optionId])
      : [optionId];
    const removedIds = currentPicks.filter(id => !nextPicks.includes(id));
    const addedIds = nextPicks.filter(id => !currentPicks.includes(id));

    setUserVotes(prev => ({ ...prev, [voteId]: nextPicks }));
    setVotes(prev => prev.map(v => {
      if (v.id !== voteId) return v;
      return {
        ...v,
        options: v.options.map(o => {
          if (removedIds.includes(o.id)) return { ...o, votes: Math.max(0, o.votes - 1) };
          if (addedIds.includes(o.id)) return { ...o, votes: o.votes + 1 };
          return o;
        }),
      };
    }));

    if (!isMockTrip) {
      try {
        const payload = isMulti
          ? { voteId, optionId, picked: !alreadyPicked }
          : { voteId, optionId };
        const res = await fetch(`/api/trips/${params.id}/group-votes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Vote failed');
        // Reconcile against the server's canonical counts. Catches
        // concurrent votes from other members that our local +1/-1
        // arithmetic missed — without this we'd show stale numbers
        // until Realtime caught up.
        const data = await res.json().catch(() => null);
        const serverCounts = data?.counts as Record<string, number> | undefined;
        const serverVoterCount = data?.distinctVoterCount as number | undefined;
        if (serverCounts) {
          setVotes(prev => prev.map(v => {
            if (v.id !== voteId) return v;
            return {
              ...v,
              options: v.options.map(o => ({ ...o, votes: serverCounts[o.id] ?? 0 })),
              ...(typeof serverVoterCount === 'number' ? { distinctVoterCount: serverVoterCount } : {}),
            };
          }));
        }
      } catch {
        // Rollback optimistic update on failure + surface the error
        setVotes(prevVotes);
        setUserVotes(prevUserVotes);
        setActionError("Couldn't save your vote. Please try again.");
        setTimeout(() => setActionError(null), 4000);
      }
    }
  };

  // Create Vote Modal
  const [showVoteModal, setShowVoteModal] = useState(false);
  useEscapeKey(() => setShowVoteModal(false), showVoteModal);
  const [voteQuestion, setVoteQuestion] = useState('');
  const [voteOptions, setVoteOptions] = useState(['', '', '']);
  // Multi-pick controls for new polls. Off by default — single-pick is the
  // common case (one decision, one winner). Toggle on for "pick your top 3
  // restaurants for our 4-day stay" style asks.
  const [voteAllowMulti, setVoteAllowMulti] = useState(false);
  const [voteMaxPicksInput, setVoteMaxPicksInput] = useState<string>('');

  // Add Expense Modal
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  useEscapeKey(() => { setShowAddExpenseModal(false); setUploadedReceipt(null); setScannedData(null); }, showAddExpenseModal);

  // ── Shared modal UX (Escape key + body scroll lock) ──────────────────────
  // Inline arrows are fine — state setters are stable per React's guarantee,
  // so the hook re-registers cheaply on each render.
  useModalUX(showInviteModal, () => setShowInviteModal(false));
  useModalUX(showVoteModal, () => setShowVoteModal(false));
  useModalUX(showAddExpenseModal, () => { setShowAddExpenseModal(false); setUploadedReceipt(null); setScannedData(null); });
  useModalUX(addToItinVote !== null, () => { if (!addToItinSaving) { setAddToItinVote(null); setAddToItinError(null); } });

  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpensePaidBy, setNewExpensePaidBy] = useState(isMockTrip ? 'Brandon' : '');
  const [newExpenseSplit, setNewExpenseSplit] = useState<'equal' | 'custom'>('equal');
  const [newExpenseCategory, setNewExpenseCategory] = useState<string>('dining');
  const [newExpenseSplitAmong, setNewExpenseSplitAmong] = useState<string[]>(groupMembers.map(m => m.name));
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [itemizedBreakdown, setItemizedBreakdown] = useState<Record<string, { items: string; amount: string }>>({});
  const [localExpenses, setLocalExpenses] = useState<Array<{id: string; name: string; amount: number; paidBy: string; splitType: 'equal' | 'custom'; category?: string; splitAmong?: string[]; customAmounts?: Record<string, number>; lineItems?: { description: string; amount: number }[]; settled?: boolean}>>([]);
  // Per-expense expand + edit state for line item review/edit. expandedExpenseIds
  // tracks which rows are showing their line items; editingExpenseId tracks which
  // (single) expense is in edit mode. Edit drafts live in editingLineItems —
  // separate from the saved data so the user can cancel.
  const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<string>>(new Set());
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingLineItems, setEditingLineItems] = useState<Array<{ description: string; amount: string }>>([]);
  const [savingLineItems, setSavingLineItems] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Supabase Realtime subscription for chat messages + reaction updates
  useEffect(() => {
    if (isMockTrip) return;
    const supabase = createSupabaseBrowserClient();

    // Refetch votes from the API — used as the realtime callback. Simpler and
    // more correct than trying to update local counts incrementally from
    // INSERT/DELETE payloads (group_votes/vote_responses changes can affect
    // multiple counts at once when toggling).
    const refetchVotes = async () => {
      try {
        const fresh = await fetch(`/api/trips/${params.id}/group-votes`).then(r => r.ok ? r.json() : null);
        if (fresh?.votes) {
          setVotes(fresh.votes);
          // Keep userVotes in sync after a Realtime tick too — otherwise a
          // user who casts on device A wouldn't see the "voted" indicator
          // update on device B after the broadcast.
          const picksByVote: Record<string, string[]> = {};
          for (const v of fresh.votes as Vote[]) {
            if (v.userPicks && v.userPicks.length > 0) picksByVote[v.id] = v.userPicks;
          }
          setUserVotes(picksByVote);
        }
      } catch { /* non-critical */ }
    };

    const channel = supabase
      .channel(`group-channel-${params.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `trip_id=eq.${params.id}` },
        (payload) => {
          // Realtime row payload — Supabase types this as Record<string, any>;
          // we narrow to the columns we actually read.
          const msg = payload.new as {
            id: string;
            sender_id: string | null;
            sender_name: string;
            content: string;
            created_at: string;
          };
          // Skip own messages (already added optimistically)
          if (currentUserId && msg.sender_id === currentUserId) return;
          setChatMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, {
              id: msg.id,
              senderName: msg.sender_name,
              senderId: msg.sender_id,
              content: msg.content,
              createdAt: msg.created_at,
              isOwn: false,
            }];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `trip_id=eq.${params.id}` },
        (payload) => {
          // UPDATE payloads land here when only `reactions` changes — typed
          // narrowly to the columns we read. Always update local state even
          // when the new reactions value is null or {} so removing the last
          // reaction syncs across browsers (the previous early-return on
          // null left stale local state showing emojis that were already
          // gone in the DB).
          const msg = payload.new as { id: string; reactions?: unknown };
          if (!msg?.id) return;
          const reactionsObj = (msg.reactions && typeof msg.reactions === 'object' && !Array.isArray(msg.reactions))
            ? msg.reactions as Record<string, unknown>
            : {};
          const normalized: Record<string, string[]> = {};
          for (const [emoji, val] of Object.entries(reactionsObj)) {
            normalized[emoji] = Array.isArray(val) ? (val as string[]) : [];
          }
          setReactions(prev => ({ ...prev, [msg.id]: normalized }));
        }
      )
      // Group polls: a new vote was created on this trip
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_votes', filter: `trip_id=eq.${params.id}` },
        () => { refetchVotes(); }
      )
      // Group polls: someone cast or uncast a vote. vote_responses doesn't
      // carry trip_id directly, so we can't filter at the publication level —
      // every vote_responses change in the project will fire and refetchVotes
      // is the simplest correct response.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vote_responses' },
        () => { refetchVotes(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isMockTrip, params.id, currentUserId]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return;
    const content = messageInput.trim();
    setMessageInput('');

    // Optimistic update
    const optimistic = {
      id: `msg_opt_${Date.now()}`,
      senderName: currentUserName,
      content,
      createdAt: new Date().toISOString(),
      isOwn: true,
    };
    setChatMessages(prev => [...prev, optimistic]);

    // Persist to Supabase for real trips
    if (!isMockTrip) {
      try {
        const res = await fetch(`/api/trips/${params.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) throw new Error(`send failed (${res.status})`);
        // Reconcile the optimistic id to the real DB id so reaction-UPDATE
        // realtime events can match this message before a reload.
        const data = await res.json().catch(() => null);
        const realId = data?.message?.id;
        if (realId) {
          setChatMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, id: realId } : m));
        }
      } catch {
        // Send failed — remove the optimistic bubble and restore the input so
        // the user knows it didn't go through (it was silently kept before). (DATA-3)
        setChatMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setMessageInput(content);
        setActionError("Couldn't send your message — please try again.");
        setTimeout(() => setActionError(null), 4000);
      }
    }
  };

  const calculateInterestOverlap = () => {
    const interestMap: Record<string, number> = {};

    groupMembers.forEach((member) => {
      (member.interests ?? []).forEach((interest) => {
        interestMap[interest] = (interestMap[interest] || 0) + 1;
      });
    });

    return Object.entries(interestMap)
      .map(([interest, count]) => ({
        interest,
        count,
        percentage: (count / groupMembers.length) * 100,
      }))
      .sort((a, b) => b.count - a.count);
  };

  const interestOverlap = calculateInterestOverlap();
  const sharedInterests = interestOverlap.filter(i => i.count > 2);

  // ─── Expense calculations (keyed by member NAME throughout) ────────────────
  // For real trips, actual data lives in localExpenses (Supabase-loaded);
  // for mock trips it lives in expenses (static). Merge both for calculations.
  const allExpenses = [...expenses, ...localExpenses];

  // Resolve any name variant (full name "Mallory Hixon", first-only "Mallory",
  // case-different "MALLORY") to the canonical groupMember.name so the balance
  // calculation lines up regardless of how the expense was saved. Without this,
  // "Mallory Hixon" paid amounts went into a different bucket than the "Mallory"
  // entry in groupMembers and the totals didn't sum to zero.
  const canonicaliseName = (raw: string): string => {
    if (!raw) return raw;
    const trimmed = raw.trim();
    const lc = trimmed.toLowerCase();
    // Exact match first
    const exact = groupMembers.find(m => m.name?.toLowerCase() === lc);
    if (exact) return exact.name;
    // First-name prefix: "Mallory Hixon" → "Mallory" (or vice versa)
    const firstWord = lc.split(/\s+/)[0];
    const byFirst = groupMembers.find(m => {
      const memberFirst = (m.name ?? '').trim().toLowerCase().split(/\s+/)[0];
      return memberFirst && (memberFirst === firstWord || lc.startsWith(memberFirst + ' '));
    });
    if (byFirst) return byFirst.name;
    return trimmed;
  };

  const calculateExpenses = () => {
    // Total Spent shows lifetime trip total — settled + unsettled — so the
    // user can always see the full $ they spent on the trip.
    const totalSpent = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Balances and Suggested Payments must reflect ONLY unsettled expenses.
    // Brandon QA 5/10: $500 in prior expenses paid by Mallory + Luke owed
    // $250. User clicked Mark Paid (which sets settled=true on those rows).
    // Expectation: balances clear to zero. New $200 expense by Luke (equal
    // split) → Mallory owes Luke $100. Bug: this loop ran over ALL expenses
    // regardless of settled flag, so the $250 prior balance stayed in the
    // math; ($500+$200)/2 = $350 each → Mallory +$150, Luke -$150.
    const owedByName: Record<string, number> = {};
    const paidByName: Record<string, number> = {};

    groupMembers.forEach((m) => { owedByName[m.name] = 0; paidByName[m.name] = 0; });

    const unsettledExpenses = allExpenses.filter(e => !(e as { settled?: boolean }).settled);

    unsettledExpenses.forEach((exp) => {
      const paidByCanonical = canonicaliseName(exp.paidBy);
      paidByName[paidByCanonical] = (paidByName[paidByCanonical] || 0) + exp.amount;

      const rawParticipants: string[] = exp.splitAmong?.length
        ? exp.splitAmong
        : groupMembers.map(m => m.name);
      const participants = rawParticipants.map(canonicaliseName);

      if (exp.splitType === 'custom' && exp.customAmounts) {
        // Use explicit per-person amounts (also canonicalised)
        Object.entries(exp.customAmounts).forEach(([name, amt]) => {
          const canon = canonicaliseName(name);
          owedByName[canon] = (owedByName[canon] || 0) + (amt as number);
        });
      } else {
        // Equal split — distribute in whole cents so the shares always sum
        // EXACTLY to the expense (no lost/duplicated penny on amounts that
        // don't divide evenly, e.g. $100 / 3). The remainder cents go to the
        // first few participants. (GROUP-7)
        const totalCents = Math.round(exp.amount * 100);
        const n = participants.length;
        const baseCents = Math.floor(totalCents / n);
        const remainder = totalCents - baseCents * n;
        participants.forEach((name, i) => {
          const cents = baseCents + (i < remainder ? 1 : 0);
          owedByName[name] = (owedByName[name] || 0) + cents / 100;
        });
      }
    });

    return { totalSpent, owedByName, paidByName };
  };

  const calculateSettlements = (): SettlementTransaction[] => {
    const { owedByName, paidByName } = expenseData;

    // balance = paid - owed: positive means they're owed money, negative means they owe
    const balances: Record<string, number> = {};
    groupMembers.forEach((m) => {
      balances[m.name] = (paidByName[m.name] || 0) - (owedByName[m.name] || 0);
    });

    // Apply recorded settle-up payments. A payment from X to Y means X paid
    // down their debt (balance up) and Y was repaid (balance down). Only the
    // netted-out transactions then remain as Suggested Payments.
    settlementPayments.forEach((p) => {
      const from = canonicaliseName(p.fromName);
      const to = canonicaliseName(p.toName);
      if (from in balances) balances[from] += p.amount;
      if (to in balances) balances[to] -= p.amount;
    });

    // Greedy minimum-transactions settlement
    const transactions: SettlementTransaction[] = [];
    const debtors = Object.entries(balances).filter(([, b]) => b < -0.01).sort((a, b) => a[1] - b[1]);
    const creditors = Object.entries(balances).filter(([, b]) => b > 0.01).sort((a, b) => b[1] - a[1]);

    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
      const transfer = Math.min(Math.abs(debtors[di][1]), creditors[ci][1]);
      transactions.push({ from: debtors[di][0], to: creditors[ci][0], amount: parseFloat(transfer.toFixed(2)) });
      debtors[di][1] += transfer;
      creditors[ci][1] -= transfer;
      if (Math.abs(debtors[di][1]) < 0.01) di++;
      if (creditors[ci][1] < 0.01) ci++;
    }
    return transactions;
  };

  const handleReceiptDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        setUploadedReceipt(file);
        setScannedData(null);
      }
    }
  };

  const handleReceiptFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        setUploadedReceipt(file);
        setScannedData(null);
      }
    }
  };

  const handleScanReceipt = async () => {
    if (!uploadedReceipt) return;
    setIsScanning(true);
    try {
      // Convert file to base64
      const arrayBuffer = await uploadedReceipt.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const base64 = btoa(binary);
      const mediaType = uploadedReceipt.type || 'image/jpeg';

      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Parse failed');

      setScannedData({
        merchant: data.merchant,
        total: data.total,
        date: data.date || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        items: (data.lineItems || []).map((li: { description: string; amount: number }) =>
          `${li.description} — $${li.amount.toFixed(2)}`
        ),
        category: data.category,
        subtotal: data.subtotal,
        tax: data.tax,
        tip: data.tip,
      });
      // Pre-fill the add expense form
      setNewExpenseName(data.merchant);
      setNewExpenseAmount(data.total.toFixed(2));
      if (data.category) setNewExpenseCategory(data.category);
    } catch (err) {
      console.error('[scan-receipt]', err);
      // Surface the actual reason rather than a generic message — users were
      // blaming their receipt when the failure was an AI quota / 503 / auth
      // issue. Falling back to an empty form lets them still file the
      // expense manually with the cause clearly explained.
      const reason = err instanceof Error ? err.message : 'unknown error';
      setScannedData({
        merchant: '',
        total: 0,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        items: [`Receipt scan failed (${reason}). Enter details manually below.`],
      });
    } finally {
      setIsScanning(false);
    }
  };

  const expenseData = calculateExpenses();
  const openVotes = votes.filter(v => v.status === 'open');
  const closedVotes = votes.filter(v => v.status === 'closed');

  // All itinerary activities that have received any Yay or Nay votes
  type VotedActivity = { id: string; name: string; dayNumber: number; date: string; timeSlot: string; upVotes: number; downVotes: number; isRestaurant: boolean; };
  const allVotedActivities: VotedActivity[] = (() => {
    const result: VotedActivity[] = [];
    for (const day of itineraryDaysData) {
      for (const track of ['shared', 'track_a', 'track_b'] as const) {
        for (const act of (day.tracks?.[track] ?? [])) {
          const up = act.upVotes ?? 0;
          const down = act.downVotes ?? 0;
          if (up > 0 || down > 0) {
            result.push({
              id: act.id,
              name: act.name || act.title || 'Activity',
              dayNumber: day.day,
              date: day.date ?? '',
              timeSlot: act.timeSlot ?? '',
              upVotes: up,
              downVotes: down,
              isRestaurant: act.isRestaurant ?? false,
            });
          }
        }
      }
    }
    return result.sort((a, b) => (b.downVotes + b.upVotes) - (a.downVotes + a.upVotes));
  })();

  return (
    <div className="min-h-screen bg-parchment p-4 md:p-6">
      {actionError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:top-6 md:bottom-auto md:translate-x-0 z-50 flex items-center gap-3 bg-rose-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
          <span className="text-sm font-semibold">{actionError}</span>
        </div>
      )}
      {showPassPurchasedToast && (
        // Post-purchase onboarding modal — fires once after a successful
        // Stripe checkout (?checkout=success in the URL). Replaces the
        // previous small corner toast: the post-purchase moment is the
        // user's peak-engagement window, so it earns a celebratory modal
        // that explicitly lists what they unlocked + drives them toward
        // the high-leverage next step (invite the crew). Dismiss removes
        // the ?checkout=success param so a refresh doesn't show it twice.
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowPassPurchasedToast(false);
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('checkout');
              window.history.replaceState({}, '', url.toString());
            } catch { /* ignore */ }
          }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-emerald-500 to-sky-700 px-6 py-8 text-center">
              <div className="w-16 h-16 mx-auto mb-3 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <span className="text-3xl">🎉</span>
              </div>
              <h2 className="font-script italic text-2xl font-semibold text-white mb-1">Your Trip Pass is active</h2>
              <p className="text-sm text-emerald-50">Here&apos;s what you just unlocked for this trip.</p>
            </div>
            <div className="px-6 py-6">
              <ul className="space-y-2.5 mb-6">
                {[
                  { icon: '✨', text: '50 AI credits — enough for 1 full build + 1 regen + tweaks' },
                  { icon: '👥', text: 'Up to 6 travelers (add more for $4/each)' },
                  { icon: '💰', text: 'Group expense tracking & splits' },
                  { icon: '🎭', text: 'Split-track itineraries (Adventure / Relaxed)' },
                  { icon: '✈️', text: 'Transport confirmation parser' },
                  { icon: '🤝', text: 'Co-organizer role for a trusted member' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-700">
                    <span className="text-base flex-shrink-0 leading-tight">{item.icon}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setShowPassPurchasedToast(false);
                    setShowInviteModal(true);
                    try {
                      const url = new URL(window.location.href);
                      url.searchParams.delete('checkout');
                      window.history.replaceState({}, '', url.toString());
                    } catch { /* ignore */ }
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-full text-sm transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite the crew
                </button>
                <button
                  onClick={() => {
                    setShowPassPurchasedToast(false);
                    try {
                      const url = new URL(window.location.href);
                      url.searchParams.delete('checkout');
                      window.history.replaceState({}, '', url.toString());
                    } catch { /* ignore */ }
                  }}
                  className="w-full py-2.5 text-sm font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  Got it, I&apos;ll set up the trip first
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
      {dataLoading ? (
        <div className="mb-8 space-y-3">
          <div className="h-9 w-72 bg-zinc-200 rounded animate-pulse" />
          <div className="h-5 w-44 bg-zinc-100 rounded animate-pulse" />
        </div>
      ) : (
        <div className="mb-8">
          <h1 className="font-script italic text-4xl font-semibold text-zinc-900 mb-2">
            {tripName}
          </h1>
          <p className="text-lg text-zinc-600">
            {tripGroupSize > groupMembers.length ? (
              // Planned party size exceeds who's actually joined — show both so
              // this number reconciles with the "N travelers" on the trip card
              // (which reflects the planned group_size).
              <>{groupMembers.length} of {tripGroupSize} joined</>
            ) : (
              <>{groupMembers.length} {groupMembers.length === 1 ? 'person' : 'people'} on this trip</>
            )}
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-1 flex gap-1 mb-8 inline-flex flex-wrap">
        {([
          { id: 'overview' as TabType, label: 'The Crew', icon: Users },
          { id: 'expenses' as TabType, label: 'Who Owes Who', icon: Receipt },
          { id: 'chat' as TabType, label: 'Chat', icon: MessageCircle },
          { id: 'votes' as TabType, label: 'Yay/Nay', icon: Vote },
        ]).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                isActive
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div>
        {/* Tab-content skeleton — shows during the initial parallel fetch so
            users see a loading state instead of an empty tab. Disappears
            as soon as `dataLoading` flips to false (all fetches resolved). */}
        {dataLoading && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-zinc-100 p-6 space-y-4">
              <div className="h-5 w-40 bg-zinc-200 rounded animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl">
                    <div className="w-10 h-10 rounded-full bg-zinc-200 animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-24 bg-zinc-200 rounded animate-pulse" />
                      <div className="h-3 w-16 bg-zinc-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {(() => {
          if (dataLoading) return null;
          // Per-tab error banner. Only shows when the relevant tab's data
          // failed to load — so users on a working tab don't see noise.
          const failed =
            (activeTab === 'overview' && tabLoadErrors.members) ||
            (activeTab === 'votes' && tabLoadErrors.votes) ||
            (activeTab === 'chat' && tabLoadErrors.chat) ||
            (activeTab === 'expenses' && tabLoadErrors.expenses);
          if (!failed) return null;
          return (
            <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start justify-between gap-3">
              <p className="text-sm text-amber-900">
                We couldn&apos;t load this tab&apos;s data. Some items may be missing.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm font-medium text-amber-900 underline hover:text-amber-700 whitespace-nowrap"
              >
                Retry
              </button>
            </div>
          );
        })()}
        {!dataLoading && activeTab === 'overview' && (
          <div className="space-y-8">
            {/* ─── Viewer's own preference prompt ────────────────────────
                The Crew Readiness banner below is organizer-only — a member
                who was auto-added via default_partner_id would never see a
                CTA pointing them at /trip/[id]/preferences. This callout
                fixes that: shown to anyone (including the organizer) whose
                own preferences haven't been submitted yet. */}
            {(() => {
              const viewer = currentUserId ? groupMembers.find(m => m.id === currentUserId) : null;
              if (!viewer || viewer.preferencesSubmittedAt || groupMembers.length <= 1) return null;
              return (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sky-900">Share your travel preferences</p>
                    <p className="text-sm text-sky-800 mt-0.5">A 1-minute mini-wizard helps the AI build a trip that fits you too.</p>
                  </div>
                  <a
                    href={`/trip/${params.id}/preferences`}
                    className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold rounded-full transition-colors whitespace-nowrap"
                  >
                    Open preferences →
                  </a>
                </div>
              );
            })()}

            {/* ─── Crew Readiness ─────────────────────────────────────────
                Shown to the organizer/co-organizer only. Pending = members
                who haven't filled the preferences mini-wizard yet. The
                `Generate Itinerary` button on the itinerary page will read
                this same data via the soft generation gate (step 6). */}
            {(() => {
              const viewerIsOrganizer = currentUserId
                ? groupMembers.find(m => m.id === currentUserId)?.role === 'organizer' ||
                  groupMembers.find(m => m.id === currentUserId)?.role === 'co_organizer'
                : false;
              if (!viewerIsOrganizer || groupMembers.length <= 1) return null;
              const ready = groupMembers.filter(m => !!m.preferencesSubmittedAt);
              const pending = groupMembers.filter(m => !m.preferencesSubmittedAt);
              const total = groupMembers.length;
              const allReady = pending.length === 0;
              const inviteUrl = typeof window !== 'undefined'
                ? `${window.location.origin}/join/${params.id}`
                : '';

              return (
                <div className={`rounded-2xl border p-6 ${allReady ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h2 className="font-script italic text-2xl font-semibold text-zinc-900 mb-1">
                        {allReady ? 'Crew is ready' : 'Crew Readiness'}
                      </h2>
                      <p className="text-sm text-zinc-700">
                        {allReady
                          ? 'Everyone\'s preferences are in. Generate the itinerary whenever you\'re ready.'
                          : `${ready.length} of ${total} ready · ${pending.length} still need to share preferences.`}
                      </p>
                    </div>
                    <div className={`text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${allReady ? 'bg-emerald-700 text-white' : 'bg-amber-600 text-white'}`}>
                      {ready.length}/{total}
                    </div>
                  </div>
                  {!allReady && (
                    <>
                      <div className="space-y-2 mb-4">
                        {pending.map(m => (
                          <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-white rounded-2xl border border-amber-200">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-semibold text-zinc-600 flex-shrink-0">
                                {(m.name?.[0] ?? '?').toUpperCase()}
                              </div>
                              <span className="text-sm font-medium text-zinc-900 truncate">{m.name}</span>
                            </div>
                            <span className="text-xs text-amber-700 font-medium flex-shrink-0">Not yet</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(inviteUrl);
                              setActionError(null);
                            } catch {
                              setActionError('Could not copy invite link');
                            }
                          }}
                          className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-semibold rounded-full transition-colors"
                        >
                          Copy invite link
                        </button>
                        <p className="text-xs text-amber-800">Share this with anyone still pending — they&apos;ll fill preferences after joining.</p>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Privacy toggle — organizer/co-organizer only. Locks /join/[id]
                to require an invite token from /api/invite/email or /sms when
                enabled. Public is the default — preserves the open share-link
                UX for casual trips. */}
            {(() => {
              const viewerRole = currentUserId
                ? groupMembers.find(m => m.id === currentUserId)?.role
                : null;
              if (viewerRole !== 'organizer' && viewerRole !== 'co_organizer') return null;
              return (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className={`w-4 h-4 ${tripIsPrivate ? 'text-emerald-600' : 'text-zinc-400'}`} />
                        <h3 className="font-semibold text-zinc-900 text-sm">
                          Require invite to join
                        </h3>
                      </div>
                      <p className="text-xs text-zinc-500 leading-relaxed">
                        {tripIsPrivate
                          ? 'On — only people you\'ve invited via email or SMS can join. Sharing the bare trip link won\'t let anyone else in.'
                          : 'Off — anyone with the trip link can join the group. Turn on to require an emailed or texted invite.'}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        if (privacyToggleSaving) return;
                        const next = !tripIsPrivate;
                        setPrivacyToggleSaving(true);
                        // Optimistic UI flip; rollback on failure.
                        setTripIsPrivate(next);
                        try {
                          const res = await fetch(`/api/trips/${params.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tripPatch: { is_private: next } }),
                          });
                          if (!res.ok) throw new Error(`save failed: ${res.status}`);
                        } catch {
                          setTripIsPrivate(!next);
                          setActionError('Couldn\'t update privacy setting. Please try again.');
                          setTimeout(() => setActionError(null), 4000);
                        } finally {
                          setPrivacyToggleSaving(false);
                        }
                      }}
                      disabled={privacyToggleSaving}
                      role="switch"
                      aria-checked={tripIsPrivate}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        tripIsPrivate ? 'bg-emerald-600' : 'bg-zinc-300'
                      } ${privacyToggleSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          tripIsPrivate ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Members Grid */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-script italic text-2xl font-semibold text-zinc-900">Who's In</h2>
                <button
                  onClick={() => {
                    if (canAddTraveler(groupMembers.length)) {
                      setShowInviteModal(true);
                    } else {
                      setShowTravelerUpgrade(true);
                    }
                  }}
                  className="bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 relative"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Someone
                  {!canAddTraveler(groupMembers.length) && (
                    <LockBadge className="ml-1" />
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Hidden file input for avatar upload */}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                {groupMembers.map((member) => {
                  const isMe = currentUserId ? member.id === currentUserId : member.id === 'user_1';
                  const uploadedAvatar = memberAvatars[member.id];
                  const avatarSrc = uploadedAvatar || member.avatarUrl;
                  // Both organizer and co-organizer can manage roles (parity).
                  const viewerRole = currentUserId
                    ? groupMembers.find(m => m.id === currentUserId)?.role
                    : undefined;
                  const canManageRoles = viewerRole === 'organizer' || viewerRole === 'co_organizer';
                  const isCoOrg = member.role === 'co_organizer';
                  const canPromote = hasCoOrganizer && canManageRoles && !isMe && member.role !== 'organizer';
                  return (
                    <div key={member.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col items-center text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                      <div className="relative mb-3 group/avatar">
                        <Avatar src={avatarSrc ?? undefined} name={member.name} size="lg" />
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white" />
                        {/* Upload button — only on own card */}
                        {isMe && (
                          <button
                            onClick={() => { pendingAvatarMemberId.current = member.id; avatarInputRef.current?.click(); }}
                            className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity"
                            title="Upload photo"
                          >
                            <Camera className="w-5 h-5 text-white" />
                          </button>
                        )}
                      </div>
                      <h3 className="font-bold text-zinc-900 mb-1">{member.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full mb-2 ${
                          member.role === 'organizer'
                            ? 'bg-sky-100 text-sky-900'
                            : isCoOrg
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {isCoOrg && <ShieldCheck className="w-3 h-3" />}
                        {member.role === 'co_organizer' ? 'Co-organizer' : member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                      </span>
                      {/* Top priorities / interests */}
                      {(member.interests ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-center mb-2">
                          {(member.interests ?? []).slice(0, 3).map((interest, i) => (
                            <span key={`${interest}-${i}`} className="text-[10px] font-semibold px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full border border-sky-100">
                              {interest}
                            </span>
                          ))}
                        </div>
                      )}
                      {isMe && (
                        <button
                          onClick={() => { pendingAvatarMemberId.current = member.id; avatarInputRef.current?.click(); }}
                          className="text-xs text-sky-700 hover:text-sky-900 font-medium transition-colors"
                        >
                          {uploadedAvatar ? 'Change photo' : '+ Add photo'}
                        </button>
                      )}
                      {/* Co-organizer promote/demote button — visible to organizer only */}
                      {canPromote && (
                        <button
                          onClick={() => handleRoleChange(member.id, isCoOrg ? 'member' : 'co_organizer')}
                          disabled={roleUpdating === member.id}
                          className={`mt-2 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                            isCoOrg
                              ? 'text-zinc-500 border border-zinc-200 hover:bg-zinc-50'
                              : 'text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100'
                          } disabled:opacity-50`}
                        >
                          {roleUpdating === member.id
                            ? '…'
                            : isCoOrg
                            ? 'Remove co-organizer'
                            : '+ Make co-organizer'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                <p className="text-zinc-600 text-sm mb-1">Messages Sent</p>
                <p className="font-script italic text-2xl font-semibold text-zinc-900">{chatMessages.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                <p className="text-zinc-600 text-sm mb-1">Votes</p>
                <p className="font-script italic text-2xl font-semibold text-zinc-900">{votes.length}</p>
              </div>
            </div>

          </div>
        )}


        {!dataLoading && activeTab === 'expenses' && (
          <div className="space-y-6">
            {/* Tier gate for free users */}
            {!hasExpenses && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-8 text-center">
                <Lock className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                <h3 className="font-semibold text-zinc-800 mb-1">Expense tracking is a paid feature</h3>
                <p className="text-sm text-zinc-500 mb-5 max-w-xs mx-auto">
                  Split costs, track who paid, and settle up with your group. Available on Trip Pass and above.
                </p>
                <a href="/pricing" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-sm rounded-full transition-colors">
                  See plans
                </a>
              </div>
            )}

            {/* Header */}
            {hasExpenses && <div className="flex items-center justify-between">
              <h2 className="font-script italic text-2xl font-semibold text-zinc-900">Who Owes Who</h2>
              <button
                onClick={() => setShowAddExpenseModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-sm rounded-full transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Expense
              </button>
            </div>}

            {/* Summary bar */}
            {allExpenses.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-zinc-700">Total Spent</p>
                  <p className="font-script italic text-2xl font-bold text-zinc-900">${expenseData.totalSpent.toFixed(2)}</p>
                </div>
                {groupMembers.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {groupMembers.map(m => {
                      const paid = expenseData.paidByName[m.name] ?? 0;
                      const owed = expenseData.owedByName[m.name] ?? 0;
                      const net = paid - owed;
                      return (
                        <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-zinc-50 rounded-xl">
                          <span className="text-sm font-medium text-zinc-700 truncate">{m.name}</span>
                          <span className={`text-xs font-bold ml-2 flex-shrink-0 ${net > 0.01 ? 'text-emerald-600' : net < -0.01 ? 'text-rose-600' : 'text-zinc-400'}`}>
                            {net > 0.01 ? `+$${net.toFixed(2)}` : net < -0.01 ? `-$${Math.abs(net).toFixed(2)}` : 'Even'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Settlement suggestions */}
            {allExpenses.length > 0 && (() => {
              const settlements = calculateSettlements();
              if (settlements.length === 0) return (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                  <p className="text-emerald-700 font-semibold">All settled up! 🎉</p>
                </div>
              );
              return (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 bg-sky-800 text-white">
                    <h3 className="font-bold text-sm">Suggested Payments</h3>
                    <p className="text-xs text-sky-200 mt-0.5">Minimum transactions to settle up</p>
                  </div>
                  <div className="divide-y divide-zinc-50">
                    {settlements.map((txn, idx) => (
                      <div key={`${txn.from}->${txn.to}-${idx}`} className="flex items-center justify-between px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900">{txn.from}</span>
                          <span className="text-zinc-400 text-xs">→</span>
                          <span className="text-sm font-semibold text-zinc-900">{txn.to}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-bold text-zinc-900">${txn.amount.toFixed(2)}</span>
                          {!isMockTrip && (
                            <button
                              onClick={async () => {
                                // Record THIS payment in the settle-up ledger.
                                // Net balances subtract it, so only this
                                // transaction clears — unrelated debts stay put.
                                // (Replaces the old behavior that marked EVERY
                                // unsettled expense paid on a single click.)
                                const optimistic = {
                                  id: `opt_${txn.from}_${txn.to}_${idx}`,
                                  fromName: txn.from,
                                  toName: txn.to,
                                  amount: txn.amount,
                                };
                                setSettlementPayments(prev => [optimistic, ...prev]);
                                try {
                                  const res = await fetch(`/api/trips/${params.id}/settlements`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ fromName: txn.from, toName: txn.to, amount: txn.amount }),
                                  });
                                  if (!res.ok) throw new Error('record failed');
                                  const data = await res.json();
                                  setSettlementPayments(prev => prev.map(p => p.id === optimistic.id ? data.settlement : p));
                                } catch {
                                  setSettlementPayments(prev => prev.filter(p => p.id !== optimistic.id));
                                  setActionError("Couldn't record that payment. Please try again.");
                                  setTimeout(() => setActionError(null), 4500);
                                }
                              }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                            >
                              Mark Paid
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Settled payments — recorded settle-up payments, with undo. */}
            {!isMockTrip && settlementPayments.some(p => !p.id.startsWith('opt_')) && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-100">
                  <h3 className="font-bold text-sm text-zinc-700">Settled payments</h3>
                </div>
                <div className="divide-y divide-zinc-50">
                  {settlementPayments.filter(p => !p.id.startsWith('opt_')).map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-zinc-700">{p.fromName}</span>
                        <span className="text-zinc-400 text-xs">paid</span>
                        <span className="font-semibold text-zinc-700">{p.toName}</span>
                        <span className="text-zinc-300">·</span>
                        <span className="font-bold text-zinc-900">${p.amount.toFixed(2)}</span>
                      </div>
                      <button
                        onClick={async () => {
                          const prevPayments = settlementPayments;
                          setSettlementPayments(cur => cur.filter(x => x.id !== p.id));
                          try {
                            const res = await fetch(`/api/trips/${params.id}/settlements?settlementId=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
                            if (!res.ok) throw new Error('undo failed');
                          } catch {
                            setSettlementPayments(prevPayments);
                            setActionError("Couldn't undo that payment. Please try again.");
                            setTimeout(() => setActionError(null), 4500);
                          }
                        }}
                        className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 px-2 py-1 rounded-full hover:bg-zinc-100 transition-colors"
                      >
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expense list — only visible to paid tiers */}
            {hasExpenses && <div className="space-y-3">
              <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">All Expenses</h3>
              {allExpenses.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="No expenses yet"
                  description="Add one to start tracking who paid what."
                  action={{ label: '+ Add first expense', onClick: () => setShowAddExpenseModal(true) }}
                />
              ) : (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  {allExpenses.map((rawExp, idx) => {
                    // allExpenses merges mock `Expense` (has description) with
                    // `localExpenses` (has name). Normalised to a render-only
                    // shape that admits either label field plus the optional
                    // settle/category/split metadata both share.
                    const exp = rawExp as {
                      id: string;
                      name?: string;
                      description?: string;
                      title?: string;
                      paidBy: string;
                      amount: number;
                      category?: string;
                      splitType?: 'equal' | 'custom';
                      splitAmong?: string[];
                      lineItems?: { description: string; amount: number }[];
                      settled?: boolean;
                    };
                    const CATEGORY_ICONS: Record<string, string> = {
                      dining: '🍽️', transport: '🚗', accommodation: '🏨', activity: '🎯',
                      shopping: '🛍️', nightlife: '🍸', other: '📌',
                    };
                    const icon = CATEGORY_ICONS[exp.category ?? ''] ?? '💳';
                    const displayName = exp.name ?? exp.description ?? exp.title ?? 'Expense';
                    const splitTypeLabel = exp.splitType === 'custom' ? 'Custom split' : 'Equal split';
                    const splitParticipants: string[] = Array.isArray(exp.splitAmong) && exp.splitAmong.length > 0
                      ? exp.splitAmong
                      : [];
                    const splitDetail = splitParticipants.length > 0
                      ? `${splitTypeLabel} · ${splitParticipants.length} ${splitParticipants.length === 1 ? 'person' : 'people'}`
                      : splitTypeLabel;
                    const lineItems = Array.isArray(exp.lineItems) ? exp.lineItems : [];
                    const hasLineItems = lineItems.length > 0;
                    const isExpanded = expandedExpenseIds.has(exp.id);
                    const isEditing = editingExpenseId === exp.id;
                    return (
                      <div key={exp.id ?? idx} className={`${idx < allExpenses.length - 1 ? 'border-b border-zinc-50' : ''} ${exp.settled ? 'opacity-50' : ''}`}>
                        <button
                          type="button"
                          onClick={() => {
                            // Only expand if there are line items to review,
                            // otherwise the chevron does nothing useful.
                            if (!hasLineItems && !isMockTrip) return;
                            setExpandedExpenseIds(prev => {
                              const next = new Set(prev);
                              if (next.has(exp.id)) next.delete(exp.id);
                              else next.add(exp.id);
                              return next;
                            });
                          }}
                          className={`w-full flex items-center gap-4 px-5 py-4 text-left ${hasLineItems ? 'hover:bg-zinc-50' : 'cursor-default'}`}
                        >
                          <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-lg flex-shrink-0">
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 truncate">{displayName}</p>
                            <p className="text-xs text-zinc-400 mt-0.5">
                              Paid by {exp.paidBy} · {splitDetail}
                              {hasLineItems && <span> · {lineItems.length} {lineItems.length === 1 ? 'line item' : 'line items'}</span>}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-zinc-900">${exp.amount.toFixed(2)}</p>
                            {exp.settled && <p className="text-[10px] text-emerald-600 font-semibold">Settled</p>}
                          </div>
                          {hasLineItems && (
                            <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          )}
                        </button>
                        {isExpanded && hasLineItems && (
                          <div className="px-5 pb-4 -mt-1 bg-zinc-50/40 border-t border-zinc-50">
                            {!isEditing ? (
                              <div className="pt-3 space-y-1.5">
                                {lineItems.map((li, i) => (
                                  <div key={`${li.description}-${i}`} className="flex items-center justify-between text-xs">
                                    <span className="text-zinc-600 break-words">{li.description}</span>
                                    <span className="text-zinc-500 tabular-nums flex-shrink-0 ml-3">
                                      {li.amount > 0 ? `$${li.amount.toFixed(2)}` : '—'}
                                    </span>
                                  </div>
                                ))}
                                {!isMockTrip && (
                                  <button
                                    onClick={() => {
                                      setEditingExpenseId(exp.id);
                                      setEditingLineItems(
                                        lineItems.map(li => ({ description: li.description, amount: li.amount > 0 ? li.amount.toFixed(2) : '' })),
                                      );
                                    }}
                                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800"
                                  >
                                    <Pencil className="w-3 h-3" /> Edit line items
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="pt-3 space-y-2">
                                {editingLineItems.map((li, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={li.description}
                                      onChange={e => setEditingLineItems(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                                      placeholder="Item description"
                                      className="flex-1 px-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                                    />
                                    <div className="relative w-24 flex-shrink-0">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={li.amount}
                                        onChange={e => setEditingLineItems(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                                        placeholder="0.00"
                                        className="w-full pl-6 pr-2 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 tabular-nums"
                                      />
                                    </div>
                                    <button
                                      onClick={() => setEditingLineItems(prev => prev.filter((_, j) => j !== i))}
                                      title="Remove line item"
                                      aria-label="Remove line item"
                                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors flex-shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => setEditingLineItems(prev => [...prev, { description: '', amount: '' }])}
                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-800"
                                >
                                  <Plus className="w-3 h-3" /> Add line item
                                </button>
                                <div className="flex justify-end gap-2 pt-2">
                                  <button
                                    onClick={() => {
                                      setEditingExpenseId(null);
                                      setEditingLineItems([]);
                                    }}
                                    disabled={savingLineItems}
                                    className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={async () => {
                                      // Validate + persist. Empty rows are
                                      // dropped server-side, but we filter
                                      // here too so the optimistic update
                                      // doesn't render placeholder rows.
                                      const clean = editingLineItems
                                        .map(li => ({
                                          description: li.description.trim(),
                                          amount: parseFloat(li.amount) || 0,
                                        }))
                                        .filter(li => li.description.length > 0 && li.amount >= 0);

                                      setSavingLineItems(true);
                                      const prevLocal = localExpenses;
                                      // Optimistic — patch in the local copy.
                                      setLocalExpenses(prev => prev.map(e =>
                                        e.id === exp.id ? { ...e, lineItems: clean } : e,
                                      ));
                                      try {
                                        const res = await fetch(`/api/trips/${params.id}/expenses`, {
                                          method: 'PATCH',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ expenseId: exp.id, lineItems: clean }),
                                        });
                                        if (!res.ok) throw new Error(`save ${res.status}`);
                                        setEditingExpenseId(null);
                                        setEditingLineItems([]);
                                      } catch (err) {
                                        console.error('[expenses] line-item save failed:', err);
                                        setLocalExpenses(prevLocal);
                                        setActionError("Couldn't save line items. Try again.");
                                        setTimeout(() => setActionError(null), 4000);
                                      } finally {
                                        setSavingLineItems(false);
                                      }
                                    }}
                                    disabled={savingLineItems}
                                    className="px-3 py-1.5 text-xs font-semibold bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-full transition-colors"
                                  >
                                    {savingLineItems ? 'Saving…' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>}

            {/* Add Expense Modal */}
            {showAddExpenseModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add expense" onClick={() => { setShowAddExpenseModal(false); setUploadedReceipt(null); setScannedData(null); }}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="flex items-start justify-between mb-5">
                    <h3 className="font-script italic text-2xl font-semibold text-zinc-900">Add Expense</h3>
                    <button
                      onClick={() => { setShowAddExpenseModal(false); setUploadedReceipt(null); setScannedData(null); }}
                      className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors -mt-1 -mr-1"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>

                  {/* Receipt Scanner */}
                  <div className="mb-5 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                    <div className="flex items-center gap-2 mb-3">
                      <ScanLine className="w-4 h-4 text-sky-700" />
                      <span className="text-sm font-semibold text-zinc-700">AI Receipt Scan</span>
                      {hasAIReceiptScan
                        ? <span className="text-xs text-zinc-400 ml-auto">Optional</span>
                        : <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 font-semibold bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><Crown className="w-3 h-3" />Nomad</span>
                      }
                    </div>
                    {!hasAIReceiptScan ? (
                      <div className="border-2 border-dashed border-zinc-200 rounded-xl p-5 text-center opacity-60">
                        <Lock className="w-5 h-5 text-zinc-300 mx-auto mb-2" />
                        <p className="text-sm text-zinc-400">AI receipt scanning is a Nomad feature</p>
                        <a href="/pricing" className="text-xs text-sky-700 underline mt-1 inline-block">Upgrade to Nomad →</a>
                      </div>
                    ) : !uploadedReceipt ? (
                      <div
                        className="border-2 border-dashed border-zinc-200 rounded-xl p-5 text-center cursor-pointer hover:border-sky-400 transition-colors"
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleReceiptDrop}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
                        <p className="text-sm text-zinc-500">Drop receipt image here or click to upload</p>
                        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleReceiptFileSelect} />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-zinc-200">
                          <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                          <span className="text-sm text-zinc-700 truncate flex-1">{uploadedReceipt.name}</span>
                          <button onClick={() => { setUploadedReceipt(null); setScannedData(null); }} className="text-zinc-400 hover:text-zinc-600 text-xs">✕</button>
                        </div>
                        {!scannedData ? (
                          <button
                            onClick={handleScanReceipt}
                            disabled={isScanning}
                            className="w-full py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white text-sm font-semibold rounded-full transition-colors flex items-center justify-center gap-2"
                          >
                            {isScanning ? (
                              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Scanning…</>
                            ) : (
                              <><Camera className="w-4 h-4" />Scan with AI</>
                            )}
                          </button>
                        ) : (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <p className="text-xs font-bold text-emerald-700 mb-1">✓ Receipt scanned!</p>
                            <p className="text-xs text-emerald-600">
                              {scannedData.merchant} · ${scannedData.total.toFixed(2)}
                              {scannedData.items.length > 0 && ` · ${scannedData.items.length} items`}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Form fields */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Description</label>
                      <input
                        type="text"
                        placeholder="e.g., Dinner at Nobu"
                        value={newExpenseName}
                        onChange={e => setNewExpenseName(e.target.value)}
                        className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Amount ($)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={newExpenseAmount}
                          onChange={e => setNewExpenseAmount(e.target.value)}
                          min="0"
                          step="0.01"
                          className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Category</label>
                        <select
                          value={newExpenseCategory}
                          onChange={e => setNewExpenseCategory(e.target.value)}
                          className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm bg-white"
                        >
                          <option value="dining">🍽️ Dining</option>
                          <option value="transport">🚗 Transport</option>
                          <option value="accommodation">🏨 Hotel</option>
                          <option value="activity">🎯 Activity</option>
                          <option value="shopping">🛍️ Shopping</option>
                          <option value="nightlife">🍸 Nightlife</option>
                          <option value="other">📌 Other</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Paid by</label>
                      <select
                        value={newExpensePaidBy}
                        onChange={e => setNewExpensePaidBy(e.target.value)}
                        className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm bg-white"
                      >
                        <option value="" disabled>Who paid?</option>
                        {groupMembers.map(m => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Split</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setNewExpenseSplit('equal')}
                          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${newExpenseSplit === 'equal' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                        >
                          Equal
                        </button>
                        <button
                          onClick={() => setNewExpenseSplit('custom')}
                          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${newExpenseSplit === 'custom' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'}`}
                        >
                          Custom
                        </button>
                      </div>
                    </div>
                    {newExpenseSplit === 'custom' && groupMembers.length > 0 && (() => {
                      // Live total + payer-share preview. Users were
                      // misreading the grid as "what each person paid out
                      // of pocket" when the math actually treats it as
                      // "what each person owes for this expense" — the
                      // payer is owed back the difference. The preview
                      // makes the intent unambiguous before submit.
                      const customTotal = Object.values(customAmounts)
                        .map(v => parseFloat(v))
                        .filter(v => !isNaN(v))
                        .reduce((a, b) => a + b, 0);
                      const expenseTotalNum = parseFloat(newExpenseAmount) || 0;
                      const totalsMatch = expenseTotalNum > 0 && Math.abs(customTotal - expenseTotalNum) < 0.01;
                      return (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Each person&apos;s share of this expense</label>
                          <p className="text-[11px] text-zinc-500 -mt-1">
                            Enter what each person owes for this expense. Whoever paid will be reimbursed the difference between what they paid and what they owe.
                          </p>
                          {groupMembers.map(m => (
                            <div key={m.id} className="flex items-center gap-3">
                              <span className="text-sm text-zinc-700 flex-1">{m.name}</span>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={customAmounts[m.name] ?? ''}
                                  onChange={e => setCustomAmounts(prev => ({ ...prev, [m.name]: e.target.value }))}
                                  className="pl-7 pr-3 py-2 w-28 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
                                />
                              </div>
                            </div>
                          ))}
                          {expenseTotalNum > 0 && (
                            <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${totalsMatch ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-800 border border-amber-100'}`}>
                              Shares total ${customTotal.toFixed(2)} of ${expenseTotalNum.toFixed(2)}
                              {!totalsMatch && expenseTotalNum > 0 && (
                                <span> — {customTotal < expenseTotalNum ? `add $${(expenseTotalNum - customTotal).toFixed(2)} more` : `remove $${(customTotal - expenseTotalNum).toFixed(2)}`}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => { setShowAddExpenseModal(false); setUploadedReceipt(null); setScannedData(null); setNewExpenseName(''); setNewExpenseAmount(''); setCustomAmounts({}); }}
                      className="flex-1 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!newExpenseName.trim() || !newExpenseAmount || !newExpensePaidBy.trim()) return;
                        const amt = parseFloat(newExpenseAmount);
                        if (isNaN(amt) || amt <= 0) return;

                        // Validate custom split sums to the total. The
                        // earlier-rendered live preview also shows this in
                        // green/amber, so an inline action-error toast
                        // here just confirms why submit was blocked.
                        if (newExpenseSplit === 'custom') {
                          const customTotal = Object.values(customAmounts)
                            .map(v => parseFloat(v))
                            .filter(v => !isNaN(v))
                            .reduce((a, b) => a + b, 0);
                          if (Math.abs(customTotal - amt) > 0.01) {
                            setActionError(`Custom split totals $${customTotal.toFixed(2)} but the expense is $${amt.toFixed(2)}. Adjust the shares so they add up.`);
                            setTimeout(() => setActionError(null), 4500);
                            return;
                          }
                        }

                        const custom = newExpenseSplit === 'custom'
                          ? Object.fromEntries(
                              Object.entries(customAmounts)
                                .map(([k, v]) => [k, parseFloat(v)])
                                .filter(([, v]) => !isNaN(v as number) && (v as number) > 0)
                            )
                          : {};

                        // ScannedReceipt.items is string[] (free-text item
                        // descriptions). The expense row's lineItems shape is
                        // { description, amount }[] so the API + downstream
                        // settlement math line up. The receipt scanner doesn't
                        // produce per-item amounts, so we leave amount=0 — the
                        // optimistic row will be replaced by the canonical
                        // server row after the POST resolves.
                        const optimisticLineItems = (scannedData?.items ?? []).map(
                          desc => ({ description: desc, amount: 0 })
                        );

                        const newExp = {
                          id: `exp_opt_${Date.now()}`,
                          name: newExpenseName.trim(),
                          amount: amt,
                          paidBy: newExpensePaidBy.trim(),
                          splitType: newExpenseSplit,
                          category: newExpenseCategory,
                          splitAmong: groupMembers.map(m => m.name),
                          customAmounts: custom,
                          lineItems: optimisticLineItems,
                          settled: false,
                        };

                        // Optimistic
                        setLocalExpenses(prev => [...prev, newExp]);
                        setShowAddExpenseModal(false);
                        setUploadedReceipt(null);
                        setScannedData(null);
                        setNewExpenseName('');
                        setNewExpenseAmount('');
                        setCustomAmounts({});

                        // Persist for real trips. Capture the optimistic-row id so a
                        // failed POST can be rolled back — otherwise the row stays in
                        // the UI permanently and disappears on refresh, which looks
                        // like a save bug.
                        if (!isMockTrip) {
                          try {
                            const res = await fetch(`/api/trips/${params.id}/expenses`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                description: newExp.name,
                                amount: newExp.amount,
                                paidByName: newExp.paidBy,
                                splitType: newExp.splitType,
                                category: newExp.category,
                                customAmounts: Object.keys(custom).length > 0 ? custom : null,
                                lineItems: newExp.lineItems.length > 0 ? newExp.lineItems : null,
                              }),
                            });
                            if (!res.ok) throw new Error(`save failed: ${res.status}`);
                            const data = await res.json();
                            // Replace optimistic with real ID
                            setLocalExpenses(prev => prev.map(e => e.id === newExp.id ? { ...e, id: data.expense.id } : e));
                          } catch (err) {
                            console.error('Expense save error:', err);
                            setLocalExpenses(prev => prev.filter(e => e.id !== newExp.id));
                            setActionError("Couldn't save the expense. Please try again.");
                            setTimeout(() => setActionError(null), 4000);
                          }
                        }
                      }}
                      disabled={!newExpenseName.trim() || !newExpenseAmount || !newExpensePaidBy.trim()}
                      className="flex-1 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-full font-semibold text-sm transition-colors"
                    >
                      Add Expense
                    </button>
                  </div>
                </div>
              </div>
            )}

            {settledUp && (
              <div className="fixed bottom-6 right-6 bg-emerald-700 text-white px-5 py-3 rounded-2xl shadow-lg font-semibold text-sm z-50">
                ✓ All settled up!
              </div>
            )}
          </div>
        )}

        {!dataLoading && activeTab === 'votes' && (
          <div className="space-y-6">
            {/* Masonry flow: all four blocks (Group Votes, Activity Pulse,
                Wishlist, Nay Watch) flow into two balanced columns so there's
                no dead space when any one of them is short or empty. Each block
                is break-inside-avoid so it never splits across a column. */}
            <div className="columns-1 lg:columns-2 gap-6">

              {/* ── Group Votes ───────────────────────────────────────────── */}
              <div className="space-y-4 break-inside-avoid mb-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-script italic text-2xl font-semibold text-zinc-900">Group Votes</h3>
                  <button
                    onClick={() => setShowVoteModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-sm rounded-full transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Start a Vote
                  </button>
                </div>

                {openVotes.length === 0 && closedVotes.length === 0 && (
                  <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-sky-100 mx-auto flex items-center justify-center mb-3">
                      <span className="text-xl">🗳️</span>
                    </div>
                    <p className="text-sm font-semibold text-zinc-700 mb-1">No votes yet</p>
                    <p className="text-xs text-zinc-400 mb-4">Start a quick poll to get the crew aligned. Try one of these:</p>
                    <div className="space-y-2 text-left">
                      {VOTE_STARTERS.map((q) => (
                        <button
                          key={q}
                          onClick={() => { setVoteQuestion(q); setShowVoteModal(true); }}
                          className="w-full flex items-center justify-between px-4 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-700 hover:border-sky-400 hover:bg-sky-50 transition-colors"
                        >
                          <span>{q}</span>
                          <span className="text-sky-700 text-xs font-semibold">+ Start</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {openVotes.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Still Deciding</p>
                    {openVotes.map((vote) => {
                      const isMulti = vote.voteType === 'multi';
                      const totalVotes = vote.options.reduce((sum, o) => sum + o.votes, 0);
                      // Voter count = distinct people who picked at least one option.
                      // For single-pick: same as totalVotes. For multi-pick: usually
                      // smaller, since one voter can produce several "votes".
                      const voterCount = vote.distinctVoterCount ?? totalVotes;
                      const myPicks = userVotes[vote.id] ?? [];
                      // Bar % is meaningful for single-pick (share of all votes).
                      // For multi-pick we show share-of-voters instead so each bar
                      // can independently reach 100% if everyone picked it.
                      const denominator = isMulti ? Math.max(1, voterCount) : Math.max(1, totalVotes);
                      return (
                        <div key={vote.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                          <h4 className="font-bold text-zinc-900 text-base mb-1">{vote.title}</h4>
                          <p className="text-xs text-zinc-400 mb-4">
                            {vote.closesAt && <>Closes {new Date(vote.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · </>}
                            {isMulti
                              ? <>{voterCount} voter{voterCount !== 1 ? 's' : ''} · pick up to {vote.maxPicks ?? vote.options.length}</>
                              : <>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</>}
                          </p>
                          <div className="space-y-3">
                            {vote.options.map((option) => {
                              const percentage = (option.votes / denominator) * 100;
                              const isVoted = myPicks.includes(option.id);
                              return (
                                <div key={option.id}>
                                  <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <button
                                      onClick={() => handleCastVote(vote.id, option.id)}
                                      className={`flex-1 text-left px-4 py-2 border rounded-xl transition-all text-sm font-medium flex items-center gap-2 ${
                                        isVoted
                                          ? 'bg-sky-800 border-sky-800 text-white'
                                          : 'border-zinc-200 hover:border-sky-400 text-zinc-900 hover:bg-sky-50'
                                      }`}
                                    >
                                      {/* Visual affordance: square for multi-pick
                                          (checkbox metaphor), circle for single
                                          (radio). Filled when picked. */}
                                      {isMulti ? (
                                        <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isVoted ? 'bg-white border-white text-sky-800' : 'border-zinc-300'}`}>
                                          {isVoted && <CheckCircle2 className="w-3 h-3" strokeWidth={3} />}
                                        </span>
                                      ) : (
                                        <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${isVoted ? 'border-white bg-white' : 'border-zinc-300'}`}>
                                          {isVoted && <span className="block w-2 h-2 m-[3px] rounded-full bg-sky-800" />}
                                        </span>
                                      )}
                                      <span className="flex-1">{option.label}</span>
                                    </button>
                                    <span className="text-xs font-semibold text-zinc-400 flex-shrink-0">{option.votes}</span>
                                  </div>
                                  <div className="w-full bg-zinc-100 rounded-full h-1.5">
                                    <div className="bg-sky-800 h-1.5 rounded-full transition-all" style={{ width: `${percentage}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full mt-4 bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {isMulti
                              ? `Open · pick ${vote.maxPicks ? `up to ${vote.maxPicks}` : 'as many as you want'}`
                              : 'Open · tap an option to vote'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {closedVotes.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">The Verdict</p>
                    {closedVotes.map((vote) => {
                      const isMulti = vote.voteType === 'multi';
                      const totalVotes = vote.options.reduce((sum, o) => sum + o.votes, 0);
                      const maxVotes = Math.max(...vote.options.map(o => o.votes));
                      const voterCount = vote.distinctVoterCount ?? totalVotes;
                      const denominator = isMulti ? Math.max(1, voterCount) : Math.max(1, totalVotes);
                      return (
                        <div key={vote.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                          <h4 className="font-bold text-zinc-900 text-base mb-1">{vote.title}</h4>
                          <p className="text-xs text-zinc-400 mb-4">
                            {isMulti
                              ? <>{voterCount} voter{voterCount !== 1 ? 's' : ''} · {totalVotes} pick{totalVotes !== 1 ? 's' : ''}</>
                              : <>{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</>}
                          </p>
                          <div className="space-y-3">
                            {vote.options.map((option) => {
                              const percentage = (option.votes / denominator) * 100;
                              const isWinner = option.votes === maxVotes && maxVotes > 0;
                              return (
                                <div key={option.id}>
                                  <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <span className={`text-sm font-medium flex-1 ${isWinner ? 'text-zinc-900 font-semibold' : 'text-zinc-500'}`}>
                                      {isWinner && <span className="text-sky-700 mr-1">✦</span>}
                                      {option.label}
                                    </span>
                                    <span className="text-xs font-semibold text-zinc-400 flex-shrink-0">{option.votes}</span>
                                  </div>
                                  <div className="w-full bg-zinc-100 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${isWinner ? 'bg-sky-800' : 'bg-zinc-300'}`} style={{ width: `${percentage}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-3 mt-4 flex-wrap">
                            <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-zinc-100 text-zinc-600">Decided ✓</span>
                            {(() => {
                              const winner = vote.options.find(o => o.votes === Math.max(...vote.options.map(x => x.votes)));
                              return winner ? (
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => openAddToItinerary(vote.id, winner.label)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-sky-100 text-sky-800 hover:bg-sky-200 transition-colors"
                                  >
                                    <CalendarDays className="w-3.5 h-3.5" />
                                    Add &quot;{winner.label}&quot; to itinerary
                                  </button>
                                  <p className="text-[10px] text-zinc-400 pl-1">The organizer may need to slot it into the right day.</p>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Activity Vote Pulse ───────────────────────────────────── */}
              <div className="space-y-4 break-inside-avoid mb-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-script italic text-2xl font-semibold text-zinc-900">Activity Pulse</h3>
                  <span className="text-xs text-zinc-400 font-medium">{allVotedActivities.length} voted</span>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 bg-white border-b border-zinc-100 text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
                    <span>Activity</span>
                    <span className="text-center">👍</span>
                    <span className="text-center">👎</span>
                  </div>

                  {allVotedActivities.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-zinc-400">No votes yet — head to the itinerary to Yay or Nay activities!</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-50">
                      {allVotedActivities.map((act) => (
                        <a
                          key={act.id}
                          href={`/trip/${params.id}/itinerary?day=${act.dayNumber}`}
                          className="grid grid-cols-[1fr_auto_auto] gap-2 sm:gap-3 px-3 sm:px-4 py-3 hover:bg-zinc-50 transition-colors items-center group"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 truncate group-hover:text-sky-800 transition-colors">
                              {act.isRestaurant && <span className="text-xs mr-1">🍽</span>}
                              {act.name}
                            </p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              Day {act.dayNumber}
                              {act.timeSlot ? ` · ${act.timeSlot.split(/–|—/)[0]?.trim()}` : ''}
                            </p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full text-center min-w-[2rem] ${act.upVotes > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-300'}`}>
                            {act.upVotes}
                          </span>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full text-center min-w-[2rem] ${act.downVotes > 0 ? 'bg-rose-50 text-rose-600' : 'text-zinc-300'}`}>
                            {act.downVotes}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>


            {/* ── Discover Wishlist ─────────────────────────────────────────── */}
            {!isMockTrip && mergedWishlistItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 break-inside-avoid mb-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">⭐</span>
                  </div>
                  <div>
                    <h2 className="font-script italic text-xl font-semibold text-zinc-900">Wishlist</h2>
                    <p className="text-xs text-zinc-400">Activities the group voted on in What&apos;s Out There</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {mergedWishlistItems.map(item => {
                    const name = item.itemData.name ?? item.itemId;
                    const isAdded = wishlistAddedIds.has(item.itemId);
                    const isPickerOpen = wishlistDayPicker === item.itemId;
                    const dayCount = itineraryDaysData.length || 7;
                    return (
                      <div key={item.itemId} className="border border-zinc-100 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          {/* Gradient swatch — clickable, sends user to the
                              trip's What's Out There discover tab where they
                              can read the full description, hours, etc. */}
                          <a
                            href={`/trip/${params.id}/discover?q=${encodeURIComponent(name)}`}
                            className={`w-10 h-10 rounded-lg flex-shrink-0 bg-gradient-to-br ${item.itemData.imageGradient ?? 'from-sky-300 to-indigo-500'} flex items-center justify-center hover:ring-2 hover:ring-sky-300 transition-all`}
                            title="View on What's Out There"
                          >
                            <span className="text-lg">
                              {item.itemData.category === 'dining' ? '🍽️' :
                               item.itemData.category === 'nature' ? '🏔️' :
                               item.itemData.category === 'sights' ? '🏛️' :
                               item.itemData.category === 'events' ? '🎭' :
                               item.itemData.category === 'sports' ? '⛹️' : '🎯'}
                            </span>
                          </a>
                          <a
                            href={`/trip/${params.id}/discover?q=${encodeURIComponent(name)}`}
                            className="flex-1 min-w-0 group hover:bg-zinc-50 -mx-1 px-1 py-0.5 rounded transition-colors"
                            title="View on What's Out There"
                          >
                            <p className="text-sm font-semibold text-zinc-900 truncate group-hover:text-sky-800 transition-colors">{name}</p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              {item.itemData.duration && `${item.itemData.duration} · `}
                              {item.itemData.priceRange}
                            </p>
                          </a>
                          {/* Vote tally */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${item.upVotes > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-300 bg-zinc-50'}`}>
                              👍 {item.upVotes}
                            </span>
                            <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${item.downVotes > 0 ? 'bg-rose-50 text-rose-600' : 'text-zinc-300 bg-zinc-50'}`}>
                              👎 {item.downVotes}
                            </span>
                          </div>
                          {/* Add to itinerary */}
                          <button
                            onClick={() => setWishlistDayPicker(isPickerOpen ? null : item.itemId)}
                            disabled={isAdded}
                            className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                              isAdded
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-sky-100 text-sky-800 hover:bg-sky-200'
                            }`}
                          >
                            {isAdded ? '✓ Added' : '+ Add to Trip'}
                          </button>
                        </div>

                        {/* Day picker */}
                        {isPickerOpen && (
                          <div className="px-4 pb-4 bg-zinc-50 border-t border-zinc-100">
                            <p className="text-xs font-semibold text-zinc-600 mt-3 mb-2">Which day?</p>
                            <div className="flex flex-wrap gap-2">
                              {Array.from({ length: dayCount }, (_, i) => i + 1).map(day => (
                                <button
                                  key={day}
                                  disabled={wishlistAddingId === item.itemId}
                                  onClick={() => handleWishlistAddToItinerary(item, day)}
                                  className="px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                >
                                  {wishlistAddingId === item.itemId ? '…' : `Day ${day}`}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Nay Watch — only shown for real trips with majority-Nay activities */}
            {!isMockTrip && (nayActivities.length > 0 || replacedActivityIds.size > 0) && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 break-inside-avoid mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">😬</span>
                  </div>
                  <div>
                    <h2 className="font-script italic text-xl font-semibold text-zinc-900">Nay Watch</h2>
                    <p className="text-xs text-zinc-400">Activities with more Nays than Yays — click to swap with an AI pick</p>
                  </div>
                </div>

                {replacedActivityIds.size > 0 && (
                  <div className="mb-4 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="text-xs font-semibold text-emerald-700">
                      ✓ {replacedActivityIds.size} activit{replacedActivityIds.size === 1 ? 'y' : 'ies'} replaced this session
                    </p>
                  </div>
                )}

                {nayActivities.length === 0 ? (
                  <p className="text-sm text-zinc-400 text-center py-2">All clear — no majority Nays remaining 🎉</p>
                ) : (
                  <div className="space-y-3">
                    {nayActivities.map(nay => (
                      <div key={nay.id} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 leading-snug truncate">{nay.name}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            Day {nay.dayNumber} · {(nay.timeSlot ?? '').split(/–|—/)[0]?.trim() ?? ''}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                              👍 {nay.upVotes}
                            </span>
                            <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-full">
                              👎 {nay.downVotes}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleReplaceNayActivity(nay)}
                          disabled={replacingActivityId === nay.id}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-all"
                        >
                          {replacingActivityId === nay.id
                            ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Finding…</>
                            : <>✦ AI Replace</>
                          }
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            </div>{/* end masonry */}

            {showVoteModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create vote" onClick={() => setShowVoteModal(false)}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-start justify-between mb-6">
                    <h3 className="font-script italic text-2xl font-semibold text-zinc-900">Put It to a Vote</h3>
                    <button
                      onClick={() => setShowVoteModal(false)}
                      className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors -mt-1 -mr-1"
                      aria-label="Close"
                    >
                      <X className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>

                  {/* Question */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-zinc-700 mb-2">What are you deciding?</label>
                    <input
                      type="text"
                      placeholder="e.g., Where should we eat on Day 3?"
                      value={voteQuestion}
                      onChange={(e) => setVoteQuestion(e.target.value)}
                      className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                    />
                  </div>

                  {/* Options */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-zinc-700 mb-2">Options</label>
                    <div className="space-y-2">
                      {voteOptions.map((option, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-500 w-6">{idx + 1}.</span>
                          <input
                            type="text"
                            placeholder={`Option ${idx + 1}`}
                            value={option}
                            onChange={(e) => {
                              const newOptions = [...voteOptions];
                              newOptions[idx] = e.target.value;
                              setVoteOptions(newOptions);
                            }}
                            className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
                          />
                          {voteOptions.length > 2 && (
                            <button
                              onClick={() => setVoteOptions(voteOptions.filter((_, i) => i !== idx))}
                              className="text-rose-400 hover:text-rose-600 text-sm"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {voteOptions.length < 5 && (
                      <button
                        onClick={() => setVoteOptions([...voteOptions, ''])}
                        className="mt-2 text-sm text-sky-700 hover:text-sky-800 font-medium flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add more
                      </button>
                    )}
                  </div>

                  {/* Multi-pick toggle. Off by default; when on, voters pick
                       multiple options (great for "pick our 3 dinners for the
                       Rome leg"-style polls). max_picks is optional — left
                       blank means no cap beyond the option count itself. */}
                  <div className="mb-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">Let voters pick multiple</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Good for "pick your top N" or multi-day stops.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={voteAllowMulti}
                        onChange={(e) => setVoteAllowMulti(e.target.checked)}
                        className="w-5 h-5 accent-sky-700"
                      />
                    </label>
                    {voteAllowMulti && (
                      <div className="mt-3 flex items-center gap-2">
                        <label className="text-xs font-medium text-zinc-700">Max picks per voter</label>
                        <input
                          type="number"
                          min={2}
                          max={voteOptions.filter(o => o.trim()).length || voteOptions.length}
                          value={voteMaxPicksInput}
                          onChange={(e) => setVoteMaxPicksInput(e.target.value)}
                          placeholder="no limit"
                          className="w-20 px-2 py-1 border border-zinc-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
                        />
                        <span className="text-xs text-zinc-400">2+ picks · leave blank for no cap</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowVoteModal(false); setVoteQuestion(''); setVoteOptions(['', '', '']); setVoteAllowMulti(false); setVoteMaxPicksInput(''); }}
                      className="flex-1 px-4 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        const filledOptions = voteOptions.filter(o => o.trim());
                        if (!voteQuestion.trim() || filledOptions.length < 2) return;

                        const resolvedType: 'single' | 'multi' = voteAllowMulti ? 'multi' : 'single';
                        // Floor at 2 — a multi-pick poll with maxPicks=1 is just a single-pick
                        // poll wearing a checkbox. The number input has min={2} but users can
                        // still type 1, so clamp here too.
                        const parsedMaxPicks = voteAllowMulti && voteMaxPicksInput.trim()
                          ? Math.max(2, Math.min(filledOptions.length, parseInt(voteMaxPicksInput, 10) || filledOptions.length))
                          : null;

                        // Optimistic local state
                        const optimisticVote: Vote = {
                          id: `vote_opt_${Date.now()}`,
                          title: voteQuestion.trim(),
                          status: 'open' as const,
                          closesAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                          voteType: resolvedType,
                          maxPicks: parsedMaxPicks,
                          distinctVoterCount: 0,
                          options: filledOptions.map((label, i) => ({
                            id: `opt_${Date.now()}_${i}`,
                            label,
                            votes: 0,
                          })),
                        };
                        setVotes(prev => [...prev, optimisticVote]);
                        setVoteCreated(true);
                        setShowVoteModal(false);
                        setVoteQuestion('');
                        setVoteOptions(['', '', '']);
                        setVoteAllowMulti(false);
                        setVoteMaxPicksInput('');
                        setTimeout(() => setVoteCreated(false), 3000);

                        // Persist to Supabase for real trips
                        if (!isMockTrip) {
                          try {
                            const res = await fetch(`/api/trips/${params.id}/group-votes`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                title: voteQuestion.trim(),
                                options: filledOptions,
                                closesAt: optimisticVote.closesAt,
                                createdByName: currentUserName,
                                voteType: resolvedType,
                                maxPicks: parsedMaxPicks,
                              }),
                            });
                            if (!res.ok) throw new Error(`vote create failed: ${res.status}`);
                            // Refresh votes to get real IDs. Guard res.ok and
                            // require a non-empty array — a transient 500 returns
                            // { votes: [] } (truthy), which would otherwise wipe
                            // the just-created poll from the UI (QA #6).
                            const fresh = await fetch(`/api/trips/${params.id}/group-votes`).then(r => r.ok ? r.json() : null);
                            if (fresh?.votes?.length) setVotes(fresh.votes);
                          } catch {
                            // Rollback: drop the optimistic vote and tell the user
                            setVotes(prev => prev.filter(v => v.id !== optimisticVote.id));
                            setVoteCreated(false);
                            setActionError('Couldn’t save the vote. Try again.');
                            setTimeout(() => setActionError(null), 4000);
                          }
                        }
                      }}
                      className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-full font-medium text-sm transition-colors"
                    >
                      Put It Out There
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Add to Itinerary modal */}
            {addToItinVote && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Add to itinerary" onClick={() => setAddToItinVote(null)}>
                <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
                  {addToItinDone ? (
                    <div className="text-center py-4">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                      <h3 className="font-semibold text-zinc-900 text-lg mb-1">Added!</h3>
                      <p className="text-sm text-zinc-500">&ldquo;{addToItinDone}&rdquo; is now on Day {addToItinDay} of your itinerary.</p>
                    </div>
                  ) : (
                    <>
                      <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-2">Add to Itinerary</h3>
                      <p className="text-sm text-zinc-500 mb-6">
                        Adding <span className="font-semibold text-zinc-800">&ldquo;{addToItinVote.label}&rdquo;</span> — choose which day.
                      </p>
                      <div className="mb-6">
                        <label className="block text-sm font-semibold text-zinc-700 mb-2">Day</label>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setAddToItinDay(d => Math.max(1, d - 1))}
                            className="w-9 h-9 rounded-full border border-zinc-200 hover:bg-zinc-50 flex items-center justify-center font-bold text-zinc-600 transition-colors"
                          >−</button>
                          <span className="flex-1 text-center text-xl font-bold text-zinc-900">Day {addToItinDay}</span>
                          <button
                            onClick={() => setAddToItinDay(d => Math.min(addToItinDays, d + 1))}
                            className="w-9 h-9 rounded-full border border-zinc-200 hover:bg-zinc-50 flex items-center justify-center font-bold text-zinc-600 transition-colors"
                          >+</button>
                        </div>
                        <p className="text-center text-xs text-zinc-400 mt-1">of {addToItinDays} days</p>
                      </div>
                      {addToItinError && (
                        <p className="mb-3 text-xs text-rose-600 text-center">{addToItinError}</p>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={() => setAddToItinVote(null)}
                          className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg font-medium text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >Cancel</button>
                        <button
                          onClick={confirmAddToItinerary}
                          disabled={addToItinSaving}
                          className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-full font-semibold text-sm transition-colors"
                        >
                          {addToItinSaving ? 'Saving…' : 'Add to Itinerary'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!dataLoading && activeTab === 'chat' && (
          // Panel height is set by the chatPanelRef effect — it measures from
          // the panel's top edge to the viewport bottom so the composer is
          // always visible (messages scroll inside). The inline calc is just an
          // SSR / first-paint fallback before the effect runs on the client.
          <div ref={chatPanelRef} className="flex flex-col bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden" style={{ height: 'calc(100dvh - 240px)' }}>
            <div className="flex-1 overflow-y-auto px-4 py-4 bg-white" onClick={() => setShowReactionPicker(null)}>
              {chatMessages.length === 0 && (
                // Without this, the white area + below-fold input looks
                // broken to first-time visitors who don't realize they
                // can scroll. Compact variant centered in the scroll area.
                <div className="h-full min-h-[300px] flex items-center justify-center px-6">
                  <EmptyState
                    icon={MessageCircle}
                    title="No messages yet"
                    description="Say hi to the crew below."
                    compact
                  />
                </div>
              )}
              {chatMessages.map((message) => {
                const msgReactions = reactions[message.id] || {};
                const activeReactions = Object.entries(msgReactions).filter(([, users]) => users.length > 0);
                return (
                  <div key={message.id} className={`mb-5 flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] sm:max-w-xs ${message.isOwn ? 'order-2' : 'order-1'} relative group/msg`}>
                      {!message.isOwn && (
                        <p className="text-sm font-semibold text-zinc-600 mb-1">{message.senderName}</p>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl ${
                        message.isOwn
                          ? 'bg-sky-800 text-white rounded-tr-sm'
                          : 'bg-zinc-100 text-zinc-900 rounded-tl-sm'
                      }`}>
                        <p className="text-sm">{message.content}</p>
                      </div>

                      {/* Reaction trigger */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowReactionPicker(prev => prev === message.id ? null : message.id); }}
                        className={`absolute -bottom-1 ${message.isOwn ? 'left-0' : 'right-0'} opacity-0 group-hover/msg:opacity-100 transition-opacity w-6 h-6 bg-white border border-zinc-200 rounded-full text-xs flex items-center justify-center shadow-sm hover:bg-zinc-50`}
                      >
                        +
                      </button>

                      {/* Emoji picker */}
                      {showReactionPicker === message.id && (
                        <div
                          className={`absolute bottom-6 ${message.isOwn ? 'right-0' : 'left-0'} bg-white border border-zinc-200 rounded-2xl shadow-lg px-2 py-1.5 flex gap-1 z-10`}
                          onClick={e => e.stopPropagation()}
                        >
                          {QUICK_EMOJIS.map(emoji => {
                            const alreadyReacted = (msgReactions[emoji] ?? []).includes(currentUserId ?? '');
                            return (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(message.id, emoji)}
                                className={`text-base hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 ${alreadyReacted ? 'bg-sky-50 ring-1 ring-sky-300' : ''}`}
                              >
                                {emoji}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Active reactions */}
                      {activeReactions.length > 0 && (
                        <div className={`flex gap-1 mt-1 flex-wrap ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
                          {activeReactions.map(([emoji, users]) => {
                            const isMine = users.includes(currentUserId ?? '');
                            return (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(message.id, emoji)}
                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs shadow-sm transition-colors ${
                                  isMine
                                    ? 'bg-sky-100 border border-sky-300 text-sky-800'
                                    : 'bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600'
                                }`}
                              >
                                <span>{emoji}</span>
                                <span className="font-medium">{users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <p className={`text-xs mt-1 ${message.isOwn ? 'text-right' : 'text-left'} text-zinc-500`}>
                        {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer — pill input with the send button embedded inside on
                the right. No border-top divider; the white-on-parchment
                transition does the work and keeps the chat feeling continuous
                instead of footer-stamped. */}
            <div className="px-4 py-3 bg-white">
              <div className="relative">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Say something to the crew..."
                  className="w-full pl-4 pr-12 py-3 bg-zinc-50 border border-zinc-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-full flex items-center justify-center transition-colors"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Invite to trip" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-6">
              <h3 className="font-script italic text-2xl font-semibold text-zinc-900">Invite to Trip</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors -mt-1 -mr-1"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            {/* Method Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setInviteMethod('email')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                  inviteMethod === 'email' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                Email
              </button>
              <button
                onClick={() => setInviteMethod('text')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                  inviteMethod === 'text' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                Text
              </button>
              <button
                onClick={() => setInviteMethod('link')}
                className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                  inviteMethod === 'link' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                Copy Link
              </button>
            </div>

            {inviteMethod === 'link' ? (
              /* Copy Link UI */
              <div className="mb-4">
                <label className="block text-sm font-semibold text-zinc-700 mb-2">Invite Link</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/join/${params.id}`}
                    className="flex-1 px-3 py-2.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 bg-zinc-50 focus:outline-none"
                  />
                  <button
                    onClick={async () => {
                      const url = `${window.location.origin}/join/${params.id}`;
                      await navigator.clipboard.writeText(url);
                      setInviteLinkCopied(true);
                      setTimeout(() => setInviteLinkCopied(false), 2000);
                    }}
                    className="px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-full font-medium text-sm transition-colors whitespace-nowrap"
                  >
                    {inviteLinkCopied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">Anyone with this link can join the trip.</p>
              </div>
            ) : (
              /* Email / Text input */
              <div className="mb-4">
                <label className="block text-sm font-semibold text-zinc-700 mb-2">
                  {inviteMethod === 'email' ? 'Email Address' : 'Phone Number'}
                </label>
                <input
                  type={inviteMethod === 'email' ? 'email' : 'tel'}
                  placeholder={inviteMethod === 'email' ? 'friend@example.com' : '+1 (555) 123-4567'}
                  value={inviteContact}
                  onChange={(e) => setInviteContact(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                />
              </div>
            )}

            {inviteMethod !== 'link' && (
              /* Preview */
              <div className="mb-4 p-3 bg-parchment rounded-lg border border-zinc-200">
                <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1">Preview</p>
                <p className="text-sm text-zinc-700">
                  {inviteMethod === 'email'
                    ? `Hey! You're invited to join our ${tripName} trip on tripcoord. Click the link to join the group and start planning together!`
                    : `You're invited to ${tripName} on tripcoord! Join here: ${typeof window !== 'undefined' ? window.location.origin : 'tripcoord.app'}/join/${params.id}`}
                </p>
              </div>
            )}

            {inviteSent ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center mb-4">
                <p className="text-sm font-semibold text-emerald-700">
                  {inviteMethod === 'email' ? '✓ Invite sent! They\'ll see it in their email or tripcoord dashboard.' : `✓ Invite sent via ${inviteMethod}!`}
                </p>
              </div>
            ) : null}

            {inviteError ? (
              <div className={`p-3 rounded-lg text-center mb-4 border ${inviteError.includes('copied') ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                <p className={`text-sm font-semibold ${inviteError.includes('copied') ? 'text-amber-700' : 'text-rose-700'}`}>
                  {inviteError}
                </p>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 px-4 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-50"
              >
                {inviteMethod === 'link' ? 'Done' : 'Cancel'}
              </button>
              {inviteMethod !== 'link' && <button
                onClick={async () => {
                  if (!inviteContact.trim()) return;

                  setIsSending(true);
                  setInviteError(null);

                  try {
                    const endpoint = inviteMethod === 'email' ? '/api/invite/email' : '/api/invite/sms';
                    const payload = inviteMethod === 'email'
                      ? { email: inviteContact, tripId: params.id, tripName, inviterName: currentUserName }
                      : { phone: inviteContact, tripId: params.id, tripName, inviterName: currentUserName };

                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });

                    if (!res.ok) {
                      throw new Error('Failed to send invite');
                    }

                    const data = await res.json();

                    if (data.noService) {
                      // Email or SMS service not configured — fall back to link copy.
                      const inviteLink = `${window.location.origin}/join/${params.id}`;
                      await navigator.clipboard.writeText(inviteLink).catch(() => {});
                      setInviteMethod('link');
                      const channel = inviteMethod === 'email' ? 'Email' : 'SMS';
                      setInviteError(`${channel} isn't set up yet — invite link copied to clipboard! Paste it to your guest.`);
                      return;
                    }

                    if (data.notified === 'in_app') {
                      setInviteSent(true);
                      setTimeout(() => {
                        setShowInviteModal(false);
                        setInviteSent(false);
                        setInviteContact('');
                      }, 2500);
                      return;
                    }

                    setInviteSent(true);
                    setTimeout(() => {
                      setShowInviteModal(false);
                      setInviteSent(false);
                      setInviteContact('');
                    }, 2000);
                  } catch (err) {
                    console.error('Invite error:', err);
                    setInviteError('Failed to send invite. Please try again.');
                  } finally {
                    setIsSending(false);
                  }
                }}
                disabled={isSending}
                className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-sky-600 text-white rounded-full font-medium text-sm transition-colors"
              >
                {isSending ? 'Sending...' : 'Send Invite'}
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* Traveler limit upgrade modal — pass trip context so the buyer sees
          a Trip Pass purchase CTA scoped to this trip + group size. */}
      {showTravelerUpgrade && (
        <UpgradeModal
          prompt={getUpgradePrompt('traveler_limit')}
          onClose={() => setShowTravelerUpgrade(false)}
          tripId={params.id}
          tripGroupSize={groupMembers.length + 1}
        />
      )}
      </div>{/* /max-w-5xl */}
    </div>
  );
}
