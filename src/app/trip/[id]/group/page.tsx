'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarStack } from '@/components/Avatar';
import { ExpenseRow } from '@/components/ExpenseRow';
import { VoteCard } from '@/components/VoteCard';
import { ChatBubble } from '@/components/ChatBubble';
import { groupMembers as mockGroupMembers, expenses as mockExpenses, groupVotes as mockGroupVotes, messages as mockMessages, MOCK_TRIP_IDS } from '@/data/mock';
import { createBrowserClient } from '@supabase/ssr';

interface VoteOption { id: string; label: string; votes: number; voters?: string[]; }
interface Vote { id: string; title: string; status: 'open' | 'closed'; closesAt?: string; options: VoteOption[]; }
interface GroupMemberData { id: string; name: string; email?: string | null; avatarUrl?: string | null; role: string; joinedAt?: string; interests?: string[]; }
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
} from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeModal, LockBadge } from '@/components/UpgradeModal';

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

  // Current user info (for message attribution)
  const [currentUserName, setCurrentUserName] = useState<string>('You');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Trip name for invite messages — fetched from Supabase for real trips
  const [tripName, setTripName] = useState<string>(isMockTrip ? 'Iceland Adventure' : 'our trip');

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
      try {
        // Fetch trip title, members, votes, messages, wishlist, expenses in parallel
        const [tripRes, membersRes, votesRes, messagesRes, wishlistRes, expensesRes] = await Promise.allSettled([
          fetch(`/api/trips/${params.id}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/members`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/group-votes`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/messages`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/discover-wishlist`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/expenses`).then(r => r.ok ? r.json() : null),
        ]);

        if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.title) {
          setTripName(tripRes.value.trip.title);
        }
        if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.destination) {
          setTripDestination(tripRes.value.trip.destination);
        }
        if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.budget_total) {
          setTripBudgetTotal(tripRes.value.trip.budget_total);
        }
        if (tripRes.status === 'fulfilled' && tripRes.value?.itinerary?.days) {
          const days = tripRes.value.itinerary.days;
          setItineraryDaysData(days);
          // Find all activities where downVotes > upVotes
          const nays: NayActivity[] = [];
          for (const day of days) {
            for (const track of ['shared', 'track_a', 'track_b']) {
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
        }
        if (messagesRes.status === 'fulfilled' && messagesRes.value?.messages) {
          // Mark messages from current user as isOwn
          const msgs = messagesRes.value.messages.map((m: any) => ({
            ...m,
            isOwn: currentUserId ? m.senderId === currentUserId : false,
          }));
          setChatMessages(msgs);
          // Populate reactions from DB
          const initialReactions: Record<string, Record<string, string[]>> = {};
          for (const m of messagesRes.value.messages) {
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
          const mapped = expensesRes.value.expenses.map((e: any) => ({
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

  const { canAddTraveler, getUpgradePrompt, hasCoOrganizer, hasExpenses, hasAIReceiptScan } = useEntitlements(params.id);
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
      if (res.ok) {
        setGroupMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
      }
    } catch { /* ignore */ } finally {
      setRoleUpdating(null);
    }
  };

  // Nay Watch — activities where downVotes > upVotes, loaded from itinerary
  type NayActivity = { id: string; name: string; dayNumber: number; timeSlot: string; upVotes: number; downVotes: number; };
  const [nayActivities, setNayActivities] = useState<NayActivity[]>([]);
  const [replacingActivityId, setReplacingActivityId] = useState<string | null>(null);
  const [replacedActivityIds, setReplacedActivityIds] = useState<Set<string>>(new Set());
  const [tripDestination, setTripDestination] = useState<string>('');
  const [itineraryDaysData, setItineraryDaysData] = useState<any[]>([]);
  // Trip budget_total from Supabase — used to calculate the utilization bar
  const [tripBudgetTotal, setTripBudgetTotal] = useState<number>(0);

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
      const dayIndex = days.findIndex((d: any) => d.day === dayNumber);
      if (dayIndex === -1) throw new Error('Day not found');

      const newActivity = {
        id: `wish_${item.itemId}_${Date.now()}`,
        dayNumber,
        timeSlot: item.itemData.category === 'dining' ? '19:00–21:00' : '14:00–16:00',
        name: item.itemData.name ?? item.itemId,
        title: item.itemData.name ?? item.itemId,
        address: item.itemData.location ?? '',
        website: null,
        isRestaurant: item.itemData.category === 'dining',
        mealType: item.itemData.category === 'dining' ? 'dinner' : null,
        track: 'shared',
        priceLevel: 2,
        description: item.itemData.description ?? '',
        costEstimate: null,
        confidence: 0.8,
        verified: false,
        packingTips: [],
        transportToNext: null,
        fromDiscover: true,
      };

      const updatedDays = days.map((d: any, i: number) => {
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
    } catch { /* ignore */ } finally {
      setWishlistAddingId(null);
    }
  };

  // Replace a majority-Nay activity with an AI suggestion
  const handleReplaceNayActivity = async (nay: NayActivity) => {
    setReplacingActivityId(nay.id);
    try {
      const res = await fetch('/api/suggest-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: tripDestination,
          dayNumber: nay.dayNumber,
          date: itineraryDaysData.find((d: any) => d.day === nay.dayNumber)?.date ?? '',
          existingActivityName: nay.name,
          timeSlot: nay.timeSlot,
          track: 'shared',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.activity) throw new Error('No suggestion');

      // Patch the replacement into the itinerary
      const updatedDays = itineraryDaysData.map((day: any) => {
        if (day.day !== nay.dayNumber) return day;
        const replaceInTrack = (arr: any[]) =>
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

      await fetch(`/api/trips/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: updatedDays }),
      });

      setItineraryDaysData(updatedDays);
      setReplacedActivityIds(prev => new Set(Array.from(prev).concat(nay.id)));
      setNayActivities(prev => prev.filter(a => a.id !== nay.id));
    } catch (err) {
      console.error('Replace activity error:', err);
    } finally {
      setReplacingActivityId(null);
    }
  };

  // Vote → Add to Itinerary state
  const [addToItinVote, setAddToItinVote] = useState<{ voteId: string; label: string } | null>(null);
  const [addToItinDay, setAddToItinDay] = useState<number>(1);
  const [addToItinDays, setAddToItinDays] = useState<number>(7);
  const [addToItinSaving, setAddToItinSaving] = useState(false);
  const [addToItinDone, setAddToItinDone] = useState<string | null>(null);

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
    try {
      if (!isMockTrip) {
        // Fetch current itinerary, inject new activity, save
        const r = await fetch(`/api/trips/${params.id}`);
        const data = await r.json();
        const days: any[] = data?.itinerary?.days ?? [];
        const dayIdx = days.findIndex((d: any) => d.day === addToItinDay);
        const newActivity = {
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
        await fetch(`/api/trips/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days }),
        });
      }
      setAddToItinDone(addToItinVote.label);
      setTimeout(() => setAddToItinVote(null), 1800);
    } catch { /* ignore */ } finally {
      setAddToItinSaving(false);
    }
  };

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
        await fetch(`/api/trips/${params.id}/messages/${messageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ emoji }),
        });
      } catch { /* optimistic already shown */ }
    }
  };

  const [memberInvited, setMemberInvited] = useState(false);
  const [voteCreated, setVoteCreated] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [settledUp, setSettledUp] = useState(false);
  const [paidTransactions, setPaidTransactions] = useState<Set<number>>(new Set());
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
      setVoteError('Couldn’t save your photo. Try again.');
      setTimeout(() => setVoteError(null), 4000);
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
  const [inviteMethod, setInviteMethod] = useState<'email' | 'text' | 'link'>('email');
  const [inviteContact, setInviteContact] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Track which option current user voted for: voteId → optionId
  const [userVotes, setUserVotes] = useState<Record<string, string>>({});

  const handleCastVote = async (voteId: string, optionId: string) => {
    const prevOptionId = userVotes[voteId];
    if (prevOptionId === optionId) return; // already voted this option

    // Capture pre-update state for rollback
    const prevVotes = votes;
    const prevUserVotes = userVotes;

    // Optimistic update
    setUserVotes(prev => ({ ...prev, [voteId]: optionId }));
    setVotes(prev => prev.map(v => {
      if (v.id !== voteId) return v;
      return {
        ...v,
        options: v.options.map(o => {
          if (o.id === prevOptionId) return { ...o, votes: Math.max(0, o.votes - 1) };
          if (o.id === optionId) return { ...o, votes: o.votes + 1 };
          return o;
        }),
      };
    }));
    if (!isMockTrip) {
      try {
        const res = await fetch(`/api/trips/${params.id}/group-votes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voteId, optionId, prevOptionId: prevOptionId ?? null }),
        });
        if (!res.ok) throw new Error('Vote failed');
      } catch {
        // Rollback optimistic update on failure + surface the error
        setVotes(prevVotes);
        setUserVotes(prevUserVotes);
        setVoteError('Vote didn’t save. Try again.');
        setTimeout(() => setVoteError(null), 4000);
      }
    }
  };

  // Create Vote Modal
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [voteQuestion, setVoteQuestion] = useState('');
  const [voteOptions, setVoteOptions] = useState(['', '', '']);

  // Add Expense Modal
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpensePaidBy, setNewExpensePaidBy] = useState(isMockTrip ? 'Brandon' : '');
  const [newExpenseSplit, setNewExpenseSplit] = useState<'equal' | 'custom'>('equal');
  const [newExpenseCategory, setNewExpenseCategory] = useState<string>('dining');
  const [newExpenseSplitAmong, setNewExpenseSplitAmong] = useState<string[]>(groupMembers.map(m => m.name));
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [itemizedBreakdown, setItemizedBreakdown] = useState<Record<string, { items: string; amount: string }>>({});
  const [localExpenses, setLocalExpenses] = useState<Array<{id: string; name: string; amount: number; paidBy: string; splitType: string; category?: string; splitAmong?: string[]; customAmounts?: Record<string, number>; lineItems?: string[]; settled?: boolean}>>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Supabase Realtime subscription for chat messages + reaction updates
  useEffect(() => {
    if (isMockTrip) return;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseKey);

    // Refetch votes from the API — used as the realtime callback. Simpler and
    // more correct than trying to update local counts incrementally from
    // INSERT/DELETE payloads (group_votes/vote_responses changes can affect
    // multiple counts at once when toggling).
    const refetchVotes = async () => {
      try {
        const fresh = await fetch(`/api/trips/${params.id}/group-votes`).then(r => r.ok ? r.json() : null);
        if (fresh?.votes) setVotes(fresh.votes);
      } catch { /* non-critical */ }
    };

    const channel = supabase
      .channel(`group-channel-${params.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `trip_id=eq.${params.id}` },
        (payload) => {
          const msg = payload.new as any;
          // Skip own messages (already added optimistically)
          if (currentUserId && msg.sender_id === currentUserId) return;
          setChatMessages(prev => {
            if (prev.some((m: any) => m.id === msg.id)) return prev;
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
          const msg = payload.new as any;
          if (msg.reactions && typeof msg.reactions === 'object') {
            const normalized: Record<string, string[]> = {};
            for (const [emoji, val] of Object.entries(msg.reactions as Record<string, unknown>)) {
              normalized[emoji] = Array.isArray(val) ? (val as string[]) : [];
            }
            setReactions(prev => ({ ...prev, [msg.id]: normalized }));
          }
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
        await fetch(`/api/trips/${params.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
      } catch { /* message is already shown optimistically */ }
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
  const calculateExpenses = () => {
    const totalSpent = allExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    // owedByName: how much each person owes (their share of all expenses)
    const owedByName: Record<string, number> = {};
    // paidByName: how much each person has paid out
    const paidByName: Record<string, number> = {};

    groupMembers.forEach((m) => { owedByName[m.name] = 0; paidByName[m.name] = 0; });

    allExpenses.forEach((exp) => {
      paidByName[exp.paidBy] = (paidByName[exp.paidBy] || 0) + exp.amount;

      const participants: string[] = (exp as any).splitAmong?.length ? (exp as any).splitAmong : groupMembers.map(m => m.name);

      if ((exp as any).splitType === 'custom' && (exp as any).customAmounts) {
        // Use explicit per-person amounts
        Object.entries((exp as any).customAmounts).forEach(([name, amt]) => {
          owedByName[name] = (owedByName[name] || 0) + (amt as number);
        });
      } else {
        // Equal split among participants
        const perPerson = exp.amount / participants.length;
        participants.forEach((name) => {
          owedByName[name] = (owedByName[name] || 0) + perPerson;
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
        date: data.date || new Date().toLocaleDateString(),
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
      // Fallback mock so the UI doesn't break
      setScannedData({
        merchant: 'Receipt scanned',
        total: 0,
        date: new Date().toLocaleDateString(),
        items: ['Could not parse receipt — enter manually'],
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
      for (const track of ['shared', 'track_a', 'track_b']) {
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
      {voteError && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-rose-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
          <span className="text-sm font-semibold">{voteError}</span>
        </div>
      )}
      <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-script italic text-4xl font-semibold text-zinc-900 mb-2">
          {tripName}
        </h1>
        <p className="text-lg text-zinc-600">
          {groupMembers.length} {groupMembers.length === 1 ? 'person' : 'people'} on this trip
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-1 flex gap-1 mb-8 inline-flex flex-wrap">
        {(['overview', 'expenses', 'chat', 'votes'] as TabType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as TabType)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
              activeTab === tab
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 font-medium'
            }`}
          >
            {tab === 'overview' ? 'The Crew' : tab === 'expenses' ? 'Who Owes Who 💸' : tab === 'chat' ? 'Chat 💬' : 'Yay/Nay 🗳️'}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview' && (
          <div className="space-y-8">
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
                  const isOrganizer = currentUserId
                    ? groupMembers.find(m => m.id === currentUserId)?.role === 'organizer'
                    : false;
                  const isCoOrg = member.role === 'co_organizer';
                  const canPromote = hasCoOrganizer && isOrganizer && !isMe && member.role !== 'organizer';
                  return (
                    <div key={member.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col items-center text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                      <div className="relative mb-3 group/avatar">
                        <Avatar src={avatarSrc ?? undefined} name={member.name} size="lg" />
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
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
                            <span key={i} className="text-[10px] font-semibold px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full border border-sky-100">
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


        {activeTab === 'expenses' && (
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
                      <div key={idx} className="flex items-center justify-between px-5 py-4">
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
                                setPaidTransactions(prev => new Set(Array.from(prev).concat(idx)));
                                // Mark all expenses as settled
                                for (const exp of localExpenses.filter(e => !e.settled)) {
                                  try {
                                    await fetch(`/api/trips/${params.id}/expenses`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ expenseId: exp.id, settled: true }),
                                    });
                                  } catch { /* ignore */ }
                                }
                                setLocalExpenses(prev => prev.map(e => ({ ...e, settled: true })));
                                setSettledUp(true);
                                setTimeout(() => setSettledUp(false), 3000);
                              }}
                              disabled={paidTransactions.has(idx)}
                              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                                paidTransactions.has(idx)
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                              }`}
                            >
                              {paidTransactions.has(idx) ? '✓ Paid' : 'Mark Paid'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Expense list — only visible to paid tiers */}
            {hasExpenses && <div className="space-y-3">
              <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">All Expenses</h3>
              {allExpenses.length === 0 ? (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-10 text-center">
                  <Receipt className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
                  <p className="text-zinc-500 font-medium">No expenses yet</p>
                  <p className="text-sm text-zinc-400 mt-1">Add one to start tracking who paid what</p>
                  <button
                    onClick={() => setShowAddExpenseModal(true)}
                    className="mt-4 px-5 py-2 bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold rounded-full transition-colors"
                  >
                    + Add First Expense
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  {allExpenses.map((rawExp, idx) => {
                    const exp = rawExp as any;
                    const CATEGORY_ICONS: Record<string, string> = {
                      dining: '🍽️', transport: '🚗', accommodation: '🏨', activity: '🎯',
                      shopping: '🛍️', nightlife: '🍸', other: '📌',
                    };
                    const icon = CATEGORY_ICONS[exp.category ?? ''] ?? '💳';
                    const displayName = exp.name ?? exp.description ?? exp.title ?? 'Expense';
                    return (
                      <div key={exp.id ?? idx} className={`flex items-center gap-4 px-5 py-4 ${idx < allExpenses.length - 1 ? 'border-b border-zinc-50' : ''} ${exp.settled ? 'opacity-50' : ''}`}>
                        <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-lg flex-shrink-0">
                          {icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 truncate">{displayName}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">Paid by {exp.paidBy}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-zinc-900">${exp.amount.toFixed(2)}</p>
                          {exp.settled && <p className="text-[10px] text-emerald-600 font-semibold">Settled</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>}

            {/* Add Expense Modal */}
            {showAddExpenseModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowAddExpenseModal(false); setUploadedReceipt(null); setScannedData(null); }}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-5">Add Expense</h3>

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
                            className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 disabled:bg-zinc-300 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
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
                      <input
                        type="text"
                        placeholder="Who paid?"
                        value={newExpensePaidBy}
                        onChange={e => setNewExpensePaidBy(e.target.value)}
                        className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm"
                      />
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
                    {newExpenseSplit === 'custom' && groupMembers.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wide">Custom amounts</label>
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
                      </div>
                    )}
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

                        // Validate custom split sums to the total
                        if (newExpenseSplit === 'custom') {
                          const customTotal = Object.values(customAmounts)
                            .map(v => parseFloat(v))
                            .filter(v => !isNaN(v))
                            .reduce((a, b) => a + b, 0);
                          if (Math.abs(customTotal - amt) > 0.01) {
                            alert(`Custom split amounts ($${customTotal.toFixed(2)}) must add up to the total ($${amt.toFixed(2)}).`);
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

                        const newExp = {
                          id: `exp_opt_${Date.now()}`,
                          name: newExpenseName.trim(),
                          amount: amt,
                          paidBy: newExpensePaidBy.trim(),
                          splitType: newExpenseSplit,
                          category: newExpenseCategory,
                          splitAmong: groupMembers.map(m => m.name),
                          customAmounts: custom,
                          lineItems: scannedData?.items ?? [],
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

                        // Persist for real trips
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
                            if (res.ok) {
                              const data = await res.json();
                              // Replace optimistic with real ID
                              setLocalExpenses(prev => prev.map(e => e.id === newExp.id ? { ...e, id: data.expense.id } : e));
                            }
                          } catch { /* optimistic already shown */ }
                        }
                      }}
                      disabled={!newExpenseName.trim() || !newExpenseAmount || !newExpensePaidBy.trim()}
                      className="flex-1 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-lg font-semibold text-sm transition-colors"
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

        {activeTab === 'votes' && (
          <div className="space-y-6">
            {/* Two-column layout: Group Votes (left) + Activity Pulse (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

              {/* ── Left: Group Votes ─────────────────────────────────────── */}
              <div className="space-y-4">
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
                  <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 text-center">
                    <p className="text-sm text-zinc-400 mb-3">No votes yet — start one to get the crew aligned!</p>
                  </div>
                )}

                {openVotes.length > 0 && (
                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-400">Still Deciding</p>
                    {openVotes.map((vote) => {
                      const totalVotes = vote.options.reduce((sum, o) => sum + o.votes, 0);
                      return (
                        <div key={vote.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                          <h4 className="font-bold text-zinc-900 text-base mb-1">{vote.title}</h4>
                          {vote.closesAt && (
                            <p className="text-xs text-zinc-400 mb-4">Closes {new Date(vote.closesAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
                          )}
                          <div className="space-y-3">
                            {vote.options.map((option) => {
                              const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
                              const isVoted = userVotes[vote.id] === option.id;
                              return (
                                <div key={option.id}>
                                  <div className="flex items-center justify-between mb-1.5 gap-2">
                                    <button
                                      onClick={() => handleCastVote(vote.id, option.id)}
                                      className={`flex-1 text-left px-4 py-2 border rounded-xl transition-all text-sm font-medium ${
                                        isVoted
                                          ? 'bg-sky-800 border-sky-800 text-white'
                                          : 'border-zinc-200 hover:border-sky-400 text-zinc-900 hover:bg-sky-50'
                                      }`}
                                    >
                                      {isVoted && '✓ '}{option.label}
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
                            Open · tap an option to vote
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
                      const totalVotes = vote.options.reduce((sum, o) => sum + o.votes, 0);
                      const maxVotes = Math.max(...vote.options.map(o => o.votes));
                      return (
                        <div key={vote.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                          <h4 className="font-bold text-zinc-900 text-base mb-1">{vote.title}</h4>
                          <p className="text-xs text-zinc-400 mb-4">{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</p>
                          <div className="space-y-3">
                            {vote.options.map((option) => {
                              const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
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

              {/* ── Right: Activity Vote Pulse ────────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-script italic text-2xl font-semibold text-zinc-900">Activity Pulse</h3>
                  <span className="text-xs text-zinc-400 font-medium">{allVotedActivities.length} voted</span>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 bg-sky-800 text-white text-xs font-bold uppercase tracking-wide">
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
                          className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors items-center group"
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

            </div>{/* end grid */}

            {/* ── Discover Wishlist ─────────────────────────────────────────── */}
            {!isMockTrip && wishlistItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
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
                  {wishlistItems.map(item => {
                    const name = item.itemData.name ?? item.itemId;
                    const isAdded = wishlistAddedIds.has(item.itemId);
                    const isPickerOpen = wishlistDayPicker === item.itemId;
                    const dayCount = itineraryDaysData.length || 7;
                    return (
                      <div key={item.itemId} className="border border-zinc-100 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 p-3">
                          {/* Gradient swatch */}
                          <div className={`w-10 h-10 rounded-lg flex-shrink-0 bg-gradient-to-br ${item.itemData.imageGradient ?? 'from-sky-300 to-indigo-500'} flex items-center justify-center`}>
                            <span className="text-lg">
                              {item.itemData.category === 'dining' ? '🍽️' :
                               item.itemData.category === 'nature' ? '🏔️' :
                               item.itemData.category === 'sights' ? '🏛️' :
                               item.itemData.category === 'events' ? '🎭' :
                               item.itemData.category === 'sports' ? '⛹️' : '🎯'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 truncate">{name}</p>
                            <p className="text-[10px] text-zinc-400 mt-0.5">
                              {item.itemData.duration && `${item.itemData.duration} · `}
                              {item.itemData.priceRange}
                            </p>
                          </div>
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
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
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
                            Day {nay.dayNumber} · {nay.timeSlot.split(/–|—/)[0]?.trim() ?? ''}
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

            {showVoteModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowVoteModal(false)}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-6">Put It to a Vote</h3>

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
                              className="text-red-400 hover:text-red-600 text-sm"
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

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowVoteModal(false); setVoteQuestion(''); setVoteOptions(['', '', '']); }}
                      className="flex-1 px-4 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        const filledOptions = voteOptions.filter(o => o.trim());
                        if (!voteQuestion.trim() || filledOptions.length < 2) return;

                        // Optimistic local state
                        const optimisticVote: Vote = {
                          id: `vote_opt_${Date.now()}`,
                          title: voteQuestion.trim(),
                          status: 'open' as const,
                          closesAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
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
                              }),
                            });
                            if (!res.ok) throw new Error(`vote create failed: ${res.status}`);
                            // Refresh votes to get real IDs
                            const fresh = await fetch(`/api/trips/${params.id}/group-votes`).then(r => r.json());
                            if (fresh.votes) setVotes(fresh.votes);
                          } catch {
                            // Rollback: drop the optimistic vote and tell the user
                            setVotes(prev => prev.filter(v => v.id !== optimisticVote.id));
                            setVoteCreated(false);
                            setVoteError('Couldn’t save the vote. Try again.');
                            setTimeout(() => setVoteError(null), 4000);
                          }
                        }
                      }}
                      className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-medium text-sm transition-colors"
                    >
                      Put It Out There
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Add to Itinerary modal */}
            {addToItinVote && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAddToItinVote(null)}>
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
                      <div className="flex gap-3">
                        <button
                          onClick={() => setAddToItinVote(null)}
                          className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg font-medium text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >Cancel</button>
                        <button
                          onClick={confirmAddToItinerary}
                          disabled={addToItinSaving}
                          className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-lg font-semibold text-sm transition-colors"
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

        {activeTab === 'chat' && (
          <div className="flex flex-col h-screen max-h-[600px] bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 bg-parchment" onClick={() => setShowReactionPicker(null)}>
              {chatMessages.map((message) => {
                const msgReactions = reactions[message.id] || {};
                const activeReactions = Object.entries(msgReactions).filter(([, users]) => users.length > 0);
                return (
                  <div key={message.id} className={`mb-5 flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-xs ${message.isOwn ? 'order-2' : 'order-1'} relative group/msg`}>
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

            <div className="border-t border-zinc-100 p-6 bg-white">
              <div className="flex items-center gap-3">
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
                  className="flex-1 px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white font-semibold p-3 rounded-full transition-colors inline-flex items-center justify-center"
                  title="Send message"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-6">Invite to Trip</h3>

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
                    className="px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
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
                  {inviteMethod === 'email' ? '✓ Invite sent! They\'ll see it in their email or TripCoord dashboard.' : `✓ Invite sent via ${inviteMethod}!`}
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
                      // Email service not configured yet — fall back to link copy
                      const inviteLink = `${window.location.origin}/join/${params.id}`;
                      await navigator.clipboard.writeText(inviteLink).catch(() => {});
                      setInviteMethod('link');
                      setInviteError('Email isn\'t set up yet — invite link copied to clipboard! Paste it to your guest.');
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
                className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-sky-600 text-white rounded-lg font-medium text-sm transition-colors"
              >
                {isSending ? 'Sending...' : 'Send Invite'}
              </button>}
            </div>
          </div>
        </div>
      )}

      {/* Traveler limit upgrade modal */}
      {showTravelerUpgrade && (
        <UpgradeModal
          prompt={getUpgradePrompt('traveler_limit')}
          onClose={() => setShowTravelerUpgrade(false)}
        />
      )}
      </div>{/* /max-w-5xl */}
    </div>
  );
}
