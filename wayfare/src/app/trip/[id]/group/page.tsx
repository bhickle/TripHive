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
  const [votes, setVotes] = useState<Vote[]>(isMockTrip ? (mockGroupVotes as Vote[]) : []);
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
        // Fetch trip title, members, votes, messages in parallel
        const [tripRes, membersRes, votesRes, messagesRes] = await Promise.allSettled([
          fetch(`/api/trips/${params.id}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/members`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/group-votes`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/messages`).then(r => r.ok ? r.json() : null),
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
        }
      } catch { /* ignore */ } finally {
        setDataLoading(false);
      }
    };

    loadAll();
  }, [isMockTrip, params.id, currentUserId]);

  const { canAddTraveler, getUpgradePrompt, hasCoOrganizer } = useEntitlements(params.id);
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
  // Emoji reactions: keyed by messageId → emoji → count
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '✈️'];

  const toggleReaction = (messageId: string, emoji: string) => {
    setReactions(prev => {
      const msgReactions = prev[messageId] || {};
      const current = msgReactions[emoji] || 0;
      return {
        ...prev,
        [messageId]: { ...msgReactions, [emoji]: current > 0 ? current - 1 : current + 1 },
      };
    });
    setShowReactionPicker(null);
  };

  const [memberInvited, setMemberInvited] = useState(false);
  const [voteCreated, setVoteCreated] = useState(false);
  const [settledUp, setSettledUp] = useState(false);
  const [paidTransactions, setPaidTransactions] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Member profile photo uploads (keyed by member id → data URL)
  const [memberAvatars, setMemberAvatars] = useState<Record<string, string>>({});
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Track which member card triggered the file picker
  const pendingAvatarMemberId = useRef<string>('');

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const memberId = pendingAvatarMemberId.current || (currentUserId ?? 'user_1');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setMemberAvatars(prev => ({ ...prev, [memberId]: dataUrl }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
        await fetch(`/api/trips/${params.id}/group-votes`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voteId, optionId, prevOptionId: prevOptionId ?? null }),
        });
      } catch { /* optimistic already shown */ }
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
  const [localExpenses, setLocalExpenses] = useState<Array<{id: string; name: string; amount: number; paidBy: string; splitType: string}>>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load expenses from Supabase for non-mock trips
  useEffect(() => {
    if (isMockTrip) return;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) return;

    const supabase = createBrowserClient(supabaseUrl, supabaseKey);

    supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', params.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load expenses:', error);
          return;
        }
        if (data && data.length > 0) {
          // Map Supabase expenses to local state format
          const mappedExpenses = data.map((exp: any) => ({
            id: exp.id || `exp_${Date.now()}_${Math.random()}`,
            name: exp.description || exp.category || 'Expense',
            amount: exp.amount || 0,
            paidBy: exp.paid_by_name || 'Unknown',
            splitType: exp.split_type || 'equal',
            category: exp.category,
            splitAmong: exp.split_among || [],
            customAmounts: exp.custom_amounts || {},
            lineItems: exp.line_items || [],
          }));
          setLocalExpenses(mappedExpenses);
        }
      });
  }, [params.id, isMockTrip]);

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
    <div className="min-h-screen bg-parchment p-6">
      <div className="mb-8">
        <h1 className="font-script italic text-4xl font-semibold text-zinc-900 mb-2">
          {tripName}
        </h1>
        <p className="text-lg text-zinc-600">
          {groupMembers.length} {groupMembers.length === 1 ? 'person' : 'people'} on this trip
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-1 flex gap-1 mb-8 inline-flex">
        {['overview', 'expenses', 'chat', 'votes'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as TabType)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
              activeTab === tab
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 font-medium'
            }`}
          >
            {tab === 'overview' ? 'The Crew' : tab === 'expenses' ? 'Who Owes Who' : tab === 'chat' ? 'Chat 💬' : 'Yay/Nay 🗳️'}
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

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                <p className="text-zinc-600 text-sm mb-1">Messages Sent</p>
                <p className="font-script italic text-2xl font-semibold text-zinc-900">{chatMessages.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                <p className="text-zinc-600 text-sm mb-1">Expenses</p>
                <p className="font-script italic text-2xl font-semibold text-zinc-900">{expenses.length + localExpenses.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                <p className="text-zinc-600 text-sm mb-1">Votes</p>
                <p className="font-script italic text-2xl font-semibold text-zinc-900">{votes.length}</p>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-8">
            {/* Expense Summary Bar */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-zinc-600 mb-2">Total Spent</p>
                  <p className="text-3xl font-bold text-sky-700">${expenseData.totalSpent.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-zinc-600 mb-2">Per Person Average</p>
                  <p className="text-3xl font-bold text-zinc-900">${(expenseData.totalSpent / groupMembers.length).toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Add Expense / Receipt buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddExpenseModal(true)}
                className="flex-1 bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-3 rounded-full inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Split Something
              </button>
              <button
                onClick={() => document.getElementById('receipt-file-input')?.click()}
                className="flex items-center gap-2 px-5 py-3 rounded-full border-2 border-sky-800 text-sky-800 hover:bg-sky-50 font-semibold text-sm transition-colors"
                title="Scan a receipt"
              >
                <Receipt className="w-4 h-4" />
                Scan Receipt
              </button>
            </div>

            {/* Expense List */}
            <div>
              <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-4">The Tab</h3>
              <div className="space-y-3">
                {expenses.map((expense) => {
                  const paidByMember = groupMembers.find(m => m.name === expense.paidBy);
                  return (
                    <div key={expense.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                      <div className="flex items-start gap-4">
                        <Avatar src={paidByMember?.avatarUrl ?? undefined} name={expense.paidBy} size="sm" />
                        <div className="flex-1">
                          <p className="font-bold text-zinc-900">{expense.description}</p>
                          <p className="text-sm text-zinc-600 mt-1">{expense.paidBy} paid</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-sky-700">${expense.amount.toFixed(2)}</p>
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full mt-2 inline-block ${
                            expense.splitType === 'equal'
                              ? 'bg-zinc-100 text-zinc-700'
                              : 'bg-zinc-100 text-zinc-700'
                          }`}>
                            {expense.splitType === 'equal' ? 'Equal split' : 'Itemized'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {localExpenses.map((exp) => (
                  <div key={exp.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-zinc-900">{exp.name}</h4>
                        <p className="text-sm text-zinc-600 mt-1">{exp.paidBy} paid</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-sky-700">${exp.amount.toFixed(2)}</p>
                        <span className="text-xs font-semibold px-3 py-1 rounded-full mt-2 inline-block bg-zinc-100 text-zinc-700">{exp.splitType === 'equal' ? 'Equal split' : 'Itemized'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hidden file input for receipt scanning */}
            <input
              ref={fileInputRef}
              id="receipt-file-input"
              type="file"
              accept="image/*,.pdf"
              onChange={handleReceiptFileSelect}
              className="hidden"
            />

            {uploadedReceipt && (
              <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-sky-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{uploadedReceipt.name}</p>
                  <p className="text-xs text-zinc-500">Ready to scan</p>
                </div>
                <button
                  onClick={() => setUploadedReceipt(null)}
                  className="text-zinc-400 hover:text-zinc-600 text-sm px-2"
                >✕</button>
              </div>
            )}

            {uploadedReceipt && !scannedData && (
                <button
                  onClick={handleScanReceipt}
                  disabled={isScanning}
                  className="btn-primary w-full mt-4 gap-2"
                >
                  {isScanning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <ScanLine className="w-4 h-4" />
                      AI Scan Receipt
                    </>
                  )}
                </button>
              )}

              {scannedData && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
                  <h4 className="font-semibold text-slate-900 mb-3">Scanned Data</h4>
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Merchant:</span>
                      <span className="font-medium text-slate-900">{scannedData.merchant}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Total:</span>
                      <span className="font-bold text-sky-700">${scannedData.total.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-slate-600">Date:</span>
                      <span className="text-sm text-slate-900">{scannedData.date}</span>
                    </div>
                    <div className="mt-3">
                      <p className="text-sm text-slate-600 mb-2">Items:</p>
                      <div className="flex flex-wrap gap-2">
                        {scannedData.items.map((item, idx) => (
                          <span key={idx} className="badge bg-sky-100 text-sky-800 text-xs">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (scannedData) {
                        setNewExpenseName(scannedData.merchant);
                        setNewExpenseAmount(scannedData.total.toString());
                        setShowAddExpenseModal(true);
                      }
                    }}
                    className="btn-primary w-full"
                  >
                    Add as Expense
                  </button>
                </div>
              )}

            {showAddExpenseModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddExpenseModal(false)}>
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-6">Split Something</h3>

                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                    {/* Description */}
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 mb-2">Description</label>
                      <input
                        type="text"
                        placeholder="e.g., Dinner at Grillið"
                        value={newExpenseName}
                        onChange={(e) => setNewExpenseName(e.target.value)}
                        className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                      />
                    </div>

                    {/* Amount + Category row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-semibold text-zinc-700 mb-2">Amount ($)</label>
                        <input
                          type="number"
                          placeholder="0.00"
                          value={newExpenseAmount}
                          onChange={(e) => setNewExpenseAmount(e.target.value)}
                          className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-zinc-700 mb-2">Category</label>
                        <select
                          value={newExpenseCategory}
                          onChange={(e) => setNewExpenseCategory(e.target.value)}
                          className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm"
                        >
                          <option value="dining">🍽 Dining</option>
                          <option value="accommodation">🏨 Hotel</option>
                          <option value="transport">🚗 Transport</option>
                          <option value="experiences">🎟 Experiences</option>
                          <option value="other">📦 Other</option>
                        </select>
                      </div>
                    </div>

                    {/* Paid By */}
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 mb-2">Paid By</label>
                      <select
                        value={newExpensePaidBy}
                        onChange={(e) => setNewExpensePaidBy(e.target.value)}
                        className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                      >
                        {groupMembers.map(m => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Split Among */}
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 mb-2">Split Among</label>
                      <div className="flex flex-wrap gap-2">
                        {groupMembers.map(m => {
                          const selected = newExpenseSplitAmong.includes(m.name);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setNewExpenseSplitAmong(prev =>
                                selected ? prev.filter(n => n !== m.name) : [...prev, m.name]
                              )}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                selected ? 'bg-sky-800 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                              }`}
                            >
                              {m.name.split(' ')[0]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Split Method */}
                    <div>
                      <label className="block text-sm font-semibold text-zinc-700 mb-2">How to split</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setNewExpenseSplit('equal')}
                          className={`flex-1 py-2 rounded-lg font-medium text-sm ${newExpenseSplit === 'equal' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
                        >
                          Equal
                        </button>
                        <button
                          onClick={() => setNewExpenseSplit('custom')}
                          className={`flex-1 py-2 rounded-lg font-medium text-sm ${newExpenseSplit === 'custom' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
                        >
                          Custom amounts
                        </button>
                      </div>
                    </div>

                    {/* Equal split preview */}
                    {newExpenseSplit === 'equal' && newExpenseAmount && newExpenseSplitAmong.length > 0 && (
                      <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 text-sm text-sky-800">
                        ${(parseFloat(newExpenseAmount) / newExpenseSplitAmong.length).toFixed(2)} per person
                        &nbsp;({newExpenseSplitAmong.length} people)
                      </div>
                    )}

                    {/* Custom amounts */}
                    {newExpenseSplit === 'custom' && (
                      <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 space-y-2">
                        {newExpenseSplitAmong.map(name => (
                          <div key={name} className="flex items-center gap-3">
                            <span className="text-sm font-medium text-zinc-700 w-24 truncate">{name.split(' ')[0]}</span>
                            <input
                              type="number"
                              placeholder="$0.00"
                              value={customAmounts[name] || ''}
                              onChange={(e) => setCustomAmounts(prev => ({ ...prev, [name]: e.target.value }))}
                              className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
                            />
                          </div>
                        ))}
                        {(() => {
                          const customTotal = Object.entries(customAmounts)
                            .filter(([n]) => newExpenseSplitAmong.includes(n))
                            .reduce((s, [, v]) => s + (parseFloat(v) || 0), 0);
                          const total = parseFloat(newExpenseAmount) || 0;
                          const diff = total - customTotal;
                          return total > 0 ? (
                            <div className={`mt-2 pt-2 border-t border-zinc-200 flex justify-between text-xs font-medium ${Math.abs(diff) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
                              <span>Total assigned: ${customTotal.toFixed(2)}</span>
                              {Math.abs(diff) > 0.01 && <span>{diff > 0 ? `$${diff.toFixed(2)} left` : `$${Math.abs(diff).toFixed(2)} over`}</span>}
                              {Math.abs(diff) <= 0.01 && <span>✓ Balanced</span>}
                            </div>
                          ) : null;
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setShowAddExpenseModal(false)}
                      className="flex-1 px-4 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (newExpenseName && newExpenseAmount) {
                          const amt = parseFloat(newExpenseAmount);
                          const among = newExpenseSplitAmong.length ? newExpenseSplitAmong : groupMembers.map(m => m.name);
                          const newExp = {
                            id: `exp_local_${Date.now()}`,
                            name: newExpenseName,
                            amount: amt,
                            paidBy: newExpensePaidBy,
                            splitType: newExpenseSplit,
                            category: newExpenseCategory,
                            splitAmong: among,
                            customAmounts: newExpenseSplit === 'custom'
                              ? Object.fromEntries(Object.entries(customAmounts).filter(([n]) => among.includes(n)).map(([n, v]) => [n, parseFloat(v) || 0]))
                              : undefined,
                          };

                          // Add to local state first
                          setLocalExpenses(prev => [...prev, newExp]);

                          // Save to Supabase for non-mock trips
                          if (!isMockTrip) {
                            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

                            if (supabaseUrl && supabaseKey) {
                              try {
                                const supabase = createBrowserClient(supabaseUrl, supabaseKey);
                                await supabase.from('expenses').insert({
                                  trip_id: params.id,
                                  paid_by_name: newExpensePaidBy,
                                  amount: amt,
                                  description: newExpenseName,
                                  category: newExpenseCategory,
                                  split_type: newExpenseSplit,
                                  split_among: among,
                                  custom_amounts: newExp.customAmounts || {},
                                  line_items: [],
                                });
                              } catch (e) {
                                console.error('Failed to save expense to Supabase:', e);
                              }
                            }
                          }

                          setShowAddExpenseModal(false);
                          setNewExpenseName('');
                          setNewExpenseAmount('');
                          setNewExpenseCategory('dining');
                          setNewExpenseSplitAmong(groupMembers.map(m => m.name));
                          setNewExpenseSplit('equal');
                          setCustomAmounts({});
                        }
                      }}
                      className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-medium text-sm transition-colors"
                    >
                      Lock It In
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Settlement Breakdown */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-bold text-zinc-900">Who Owes Who</h2>
                <span className="text-xs text-zinc-400 font-medium">{calculateSettlements().length} transaction{calculateSettlements().length !== 1 ? 's' : ''} to settle</span>
              </div>

              {/* Per-person balance summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                {groupMembers.map(m => {
                  const paid = expenseData.paidByName[m.name] || 0;
                  const owed = expenseData.owedByName[m.name] || 0;
                  const balance = paid - owed;
                  const isPositive = balance > 0.01;
                  const isNegative = balance < -0.01;
                  return (
                    <div key={m.id} className={`p-3 rounded-xl border text-center ${isPositive ? 'bg-emerald-50 border-emerald-200' : isNegative ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                      <p className="text-xs font-medium text-zinc-600 truncate mb-1">{m.name.split(' ')[0]}</p>
                      <p className={`text-sm font-bold ${isPositive ? 'text-emerald-700' : isNegative ? 'text-rose-700' : 'text-zinc-500'}`}>
                        {isPositive ? '+' : ''}{balance.toFixed(2)}
                      </p>
                      <p className={`text-xs mt-0.5 ${isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-600' : 'text-zinc-400'}`}>
                        {isPositive ? 'gets back' : isNegative ? 'owes' : 'even'}
                      </p>
                    </div>
                  );
                })}
              </div>

              {calculateSettlements().length > 0 ? (
                <div className="space-y-2 mb-5">
                  {calculateSettlements().map((t, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-xs font-bold text-rose-700 flex-shrink-0">
                          {t.from.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-900 truncate">{t.from.split(' ')[0]} → {t.to.split(' ')[0]}</p>
                          <p className="text-xs text-zinc-500">via Venmo, cash, or bank transfer</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <p className="font-bold text-sky-700">${t.amount.toFixed(2)}</p>
                        {paidTransactions.has(idx) ? (
                          <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                            ✓ Paid
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setPaidTransactions(prev => new Set(Array.from(prev).concat(idx)));
                              setSettledUp(true);
                              setTimeout(() => setSettledUp(false), 2500);
                            }}
                            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-full transition-colors"
                          >
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl mb-5 text-center">
                  <p className="text-sm font-semibold text-emerald-700">🎉 All square — nothing owed!</p>
                </div>
              )}

              {settledUp && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-sm font-medium text-emerald-700 mb-3">
                  ✓ Marked as paid — follow up with them to confirm! 💸
                </div>
              )}
            </div>
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
                            if (res.ok) {
                              // Refresh votes to get real IDs
                              const fresh = await fetch(`/api/trips/${params.id}/group-votes`).then(r => r.json());
                              if (fresh.votes) setVotes(fresh.votes);
                            }
                          } catch { /* optimistic already shown */ }
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
                const activeReactions = Object.entries(msgReactions).filter(([, count]) => count > 0);
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
                          {QUICK_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(message.id, emoji)}
                              className="text-base hover:scale-125 transition-transform w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-100"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Active reactions */}
                      {activeReactions.length > 0 && (
                        <div className={`flex gap-1 mt-1 flex-wrap ${message.isOwn ? 'justify-end' : 'justify-start'}`}>
                          {activeReactions.map(([emoji, count]) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(message.id, emoji)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-zinc-200 rounded-full text-xs hover:bg-zinc-50 shadow-sm"
                            >
                              <span>{emoji}</span>
                              <span className="text-zinc-600 font-medium">{count}</span>
                            </button>
                          ))}
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
                  Invite sent via {inviteMethod}!
                </p>
              </div>
            ) : null}

            {inviteError ? (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-center mb-4">
                <p className="text-sm font-semibold text-rose-700">
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
    </div>
  );
}
