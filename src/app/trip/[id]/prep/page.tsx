'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, FileText, Backpack, Briefcase, ExternalLink, ChevronDown, Plus, Globe, Loader2, Volume2, RefreshCw, Sparkles, Lock, Crown, Info, Gift, Trash2, Users } from 'lucide-react';
import { prepTasks as mockPrepTasks, packingItems as mockPackingItems, trips, MOCK_TRIP_IDS } from '@/data/mock';
import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { WeatherWidget } from '@/components/WeatherWidget';

// ─── Schengen Detection ───────────────────────────────────────────────────────
const SCHENGEN_KEYWORDS = [
  'austria', 'belgium', 'czech', 'denmark', 'estonia', 'finland', 'france',
  'germany', 'greece', 'hungary', 'iceland', 'italy', 'latvia', 'liechtenstein',
  'lithuania', 'luxembourg', 'malta', 'netherlands', 'norway', 'poland',
  'portugal', 'slovakia', 'slovenia', 'spain', 'sweden', 'switzerland',
  // Common cities that strongly imply Schengen
  'paris', 'rome', 'barcelona', 'amsterdam', 'berlin', 'madrid', 'lisbon',
  'vienna', 'prague', 'budapest', 'zurich', 'brussels', 'stockholm', 'oslo',
  'copenhagen', 'helsinki', 'reykjavik', 'athens', 'venice', 'florence',
  'milan', 'munich', 'hamburg', 'frankfurt', 'zurich', 'geneva', 'bern',
  'luxembourg city', 'valletta', 'riga', 'tallinn', 'vilnius', 'warsaw',
  'krakow', 'bratislava', 'ljubljana',
];
import { useEntitlements } from '@/hooks/useEntitlements';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrepTask { id: string; category: string; title: string; dueDate?: string; completed: boolean; urgent?: boolean; }
interface PackingItem { id: string; name: string; category: string; packed: boolean; affiliateUrl?: string; }
interface SouvenirItem { id: string; person: string; idea: string; purchased: boolean; }

interface TranslationPhrase {
  id: string;
  english: string;
  local: string;
  phonetic: string;
  tip?: string;
}

interface PhraseCategory {
  id: string;
  label: string;
  icon: string;
  phrases: TranslationPhrase[];
}

interface PhrasebookData {
  language: string;
  languageCode: string;
  destination: string;
  categories: PhraseCategory[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PrepPage({ params }: { params: { id: string } }) {
  const isMockTrip = MOCK_TRIP_IDS.has(params.id);
  const { hasAIPacking, hasAIPhrasebook } = useEntitlements(params.id);
  const { user, isLoading: authLoading } = useAuth();

  // For real trips, prep tasks and packing items are loaded from Supabase
  const [prepTasks, setPrepTasks] = useState<PrepTask[]>(isMockTrip ? (mockPrepTasks as PrepTask[]) : []);
  const [packingItems, setPackingItems] = useState<PackingItem[]>(isMockTrip ? (mockPackingItems as PackingItem[]) : []);

  const [activeTab, setActiveTab] = useState<'documents' | 'packing' | 'logistics' | 'phrases'>('documents');
  const [completedTasks, setCompletedTasks] = useState(new Set(prepTasks.filter(t => t.completed).map((t: PrepTask) => t.id)));
  const [packedItems, setPackedItems] = useState(new Set(packingItems.filter(p => p.packed).map((p: PackingItem) => p.id)));
  const [expandedCategories, setExpandedCategories] = useState(new Set(['Clothing']));
  const [customDocTasks, setCustomDocTasks] = useState<Array<{id: string; title: string; completed: boolean}>>([]);
  const [customLogTasks, setCustomLogTasks] = useState<Array<{id: string; title: string; completed: boolean}>>([]);
  const [customPackItems, setCustomPackItems] = useState<Array<{id: string; name: string; category: string; packed: boolean; affiliateUrl?: string}>>([]);
  const [newDocItem, setNewDocItem] = useState('');
  const [newLogItem, setNewLogItem] = useState('');
  const [newPackItem, setNewPackItem] = useState('');
  const [newPackCategory, setNewPackCategory] = useState('');

  // Trip data load error state
  const [prepLoadError, setPrepLoadError] = useState(false);

  // Packing generation state (legacy — used for mock trips + overall progress)
  const [packingGenerating, setPackingGenerating] = useState(false);
  const [packingGenError, setPackingGenError] = useState<string | null>(null);
  const [packingLoaded, setPackingLoaded] = useState(false);

  // Pack This sub-tab state
  const [packSubTab, setPackSubTab] = useState<'group' | 'mine' | 'gifts'>('group');

  // Group Pack (shared, user_id = null)
  const [groupPackItems, setGroupPackItems] = useState<PackingItem[]>([]);
  const [groupPackedItems, setGroupPackedItems] = useState<Set<string>>(new Set());
  const [groupPackLoaded, setGroupPackLoaded] = useState(false);
  const [groupPackGenerating, setGroupPackGenerating] = useState(false);
  const [groupPackGenError, setGroupPackGenError] = useState<string | null>(null);
  const [newGroupPackItem, setNewGroupPackItem] = useState('');
  const [newGroupPackCategory, setNewGroupPackCategory] = useState('');

  // My Pack (private, user_id = userId)
  const [myPackItems, setMyPackItems] = useState<PackingItem[]>([]);
  const [myPackedItems, setMyPackedItems] = useState<Set<string>>(new Set());
  const [myPackLoaded, setMyPackLoaded] = useState(false);
  const [myPackGenerating, setMyPackGenerating] = useState(false);
  const [myPackGenError, setMyPackGenError] = useState<string | null>(null);
  const [newMyPackItem, setNewMyPackItem] = useState('');
  const [newMyPackCategory, setNewMyPackCategory] = useState('');

  // Souvenirs / Gifts
  const [souvenirItems, setSouvenirItems] = useState<SouvenirItem[]>([]);
  const [souvenirLoaded, setSouvenirLoaded] = useState(false);
  const [newSouvenirPerson, setNewSouvenirPerson] = useState('');
  const [newSouvenirIdea, setNewSouvenirIdea] = useState('');

  // Phrases tab state
  const [phrasebooks, setPhrasebooks] = useState<PhrasebookData[]>([]);
  const [activePhrasebook, setActivePhrasebook] = useState(0);
  const [phrasesLoading, setPhrasesLoading] = useState(false);
  const [phrasesError, setPhrasesError] = useState<string | null>(null);
  const [expandedPhraseCategories, setExpandedPhraseCategories] = useState<Set<string>>(new Set(['greetings']));
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const documentTasks = prepTasks.filter((t: PrepTask) => t.category === 'document');
  const logisticsTasks = prepTasks.filter((t: PrepTask) => t.category === 'logistics');

  // Load prep tasks and packing items from Supabase for real trips
  useEffect(() => {
    if (isMockTrip) return;
    if (authLoading) return; // Wait for auth session to resolve before fetching
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(params.id);
    if (!looksLikeUuid) return;

    Promise.allSettled([
      fetch(`/api/trips/${params.id}/prep`).then(r => r.ok ? r.json() : Promise.reject(new Error(`prep ${r.status}`))),
      fetch(`/api/trips/${params.id}/packing?scope=group`).then(r => r.ok ? r.json() : Promise.reject(new Error(`packing-group ${r.status}`))),
      fetch(`/api/trips/${params.id}/packing?scope=mine`).then(r => r.ok ? r.json() : Promise.reject(new Error(`packing-mine ${r.status}`))),
      fetch(`/api/trips/${params.id}/souvenirs`).then(r => r.ok ? r.json() : Promise.reject(new Error(`souvenirs ${r.status}`))),
      fetch(`/api/trips/${params.id}`).then(r => r.ok ? r.json() : Promise.reject(new Error(`trip ${r.status}`))),
    ]).then(([prepRes, groupPackingRes, myPackingRes, souvenirsRes, tripRes]) => {
      // If the critical trip fetch failed, surface an error rather than silently showing mock data
      if (tripRes.status === 'rejected') {
        console.error('[prep] Failed to load trip data:', tripRes.reason);
        setPrepLoadError(true);
      }
      if (prepRes.status === 'fulfilled' && prepRes.value?.tasks) {
        const tasks: PrepTask[] = prepRes.value.tasks.map((t: any) => ({
          id: t.id,
          category: t.category,
          title: t.title,
          dueDate: t.due_date,
          completed: t.completed,
          urgent: t.urgent,
        }));
        setPrepTasks(tasks);
        setCompletedTasks(new Set(tasks.filter(t => t.completed).map(t => t.id)));
      }
      // Group Pack items
      if (groupPackingRes.status === 'fulfilled' && groupPackingRes.value?.items) {
        const items: PackingItem[] = groupPackingRes.value.items.map((i: any) => ({
          id: i.id, name: i.name, category: i.category, packed: i.packed,
        }));
        setGroupPackItems(items);
        setGroupPackedItems(new Set(items.filter(i => i.packed).map(i => i.id)));
        // Also update legacy packingItems for overall progress
        setPackingItems(items);
        setPackedItems(new Set(items.filter(i => i.packed).map(i => i.id)));
      }
      setGroupPackLoaded(true);
      setPackingLoaded(true);
      // My Pack items
      if (myPackingRes.status === 'fulfilled' && myPackingRes.value?.items) {
        const items: PackingItem[] = myPackingRes.value.items.map((i: any) => ({
          id: i.id, name: i.name, category: i.category, packed: i.packed,
        }));
        setMyPackItems(items);
        setMyPackedItems(new Set(items.filter(i => i.packed).map(i => i.id)));
      }
      setMyPackLoaded(true);
      // Souvenirs
      if (souvenirsRes.status === 'fulfilled' && souvenirsRes.value?.items) {
        setSouvenirItems(souvenirsRes.value.items.map((i: any) => ({
          id: i.id, person: i.person, idea: i.idea, purchased: i.purchased,
        })));
      }
      setSouvenirLoaded(true);
      if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.destination) {
        const dest = tripRes.value.trip.destination;
        // Update state so all destination-dependent UI uses the correct trip destination
        setTripDestination(dest);
        // Populate dates for the weather forecast widget
        if (tripRes.value.trip.start_date) setTripStartDate(tripRes.value.trip.start_date);
        if (tripRes.value.trip.end_date) setTripEndDate(tripRes.value.trip.end_date);
        // Also store for the phrasebook and discover features
        try {
          localStorage.setItem('currentTripId', params.id);
          const existing = JSON.parse(localStorage.getItem('generatedTripMeta') || '{}');
          localStorage.setItem('generatedTripMeta', JSON.stringify({
            ...existing,
            destination: dest,
          }));
        } catch { /* ignore */ }
      }
    });
  }, [isMockTrip, params.id, authLoading, user]);

  // Trip destination as state (not a one-time IIFE) so it updates when the API returns data.
  // For real trips the initial value reads from localStorage only when the stored trip ID matches
  // (same guard the discover page uses), preventing bleed-over from a previously-generated trip.
  const [tripDestination, setTripDestination] = useState<string>(() => {
    if (isMockTrip) return trips[0]?.destination ?? 'Iceland';
    try {
      const storedId = localStorage.getItem('currentTripId');
      const stored = localStorage.getItem('generatedTripMeta');
      if (stored && (storedId === params.id || params.id.startsWith('upload_'))) {
        return JSON.parse(stored).destination || 'your destination';
      }
    } catch { /* ignore */ }
    return 'your destination';
  });

  // Trip dates — used by WeatherWidget to show the forecast window for the trip.
  // Mock trips use dates from mock data; real trips populate from API response below.
  const [tripStartDate, setTripStartDate] = useState<string | undefined>(
    isMockTrip ? trips[0]?.startDate : undefined
  );
  const [tripEndDate, setTripEndDate] = useState<string | undefined>(
    isMockTrip ? trips[0]?.endDate : undefined
  );

  // Schengen detection — recalculated whenever tripDestination updates
  const isSchengenDest = SCHENGEN_KEYWORDS.some(kw =>
    tripDestination.toLowerCase().includes(kw)
  );

  // Domestic US detection — suppress international travel tips (SIM, currency, Embassy)
  // and hide the Phrases tab (English-only destination)
  const US_STATE_ABBREVIATIONS = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
  ];
  const destLower = tripDestination.toLowerCase();
  const isDomesticUS = (
    destLower.includes('united states') ||
    destLower.includes(' usa') || destLower.endsWith('usa') ||
    destLower.includes('u.s.a') ||
    // Match "City, ST" pattern — e.g. "Pittsburgh, PA" or "New York, NY"
    US_STATE_ABBREVIATIONS.some(abbr =>
      new RegExp(`,\\s*${abbr}\\b`, 'i').test(tripDestination)
    )
  );

  // For multi-country trips (cruises, road trips), extract individual port/country names
  // so we can generate a phrasebook per distinct language region
  const parseDestinations = (dest: string): string[] => {
    // Split on common delimiters: "&", "and", ",", "/"
    const parts = dest.split(/[&,/]|\band\b/i).map(s => s.trim()).filter(Boolean);
    return parts.length > 1 ? parts : [dest];
  };

  const toggleDocTask = (taskId: string) => {
    const wasCompleted = completedTasks.has(taskId);
    const newCompleted = new Set(completedTasks);
    if (wasCompleted) newCompleted.delete(taskId); else newCompleted.add(taskId);
    setCompletedTasks(newCompleted);
    if (!isMockTrip) {
      fetch(`/api/trips/${params.id}/prep`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, completed: !wasCompleted }),
      }).catch(() => setCompletedTasks(completedTasks));
    }
  };

  const togglePackedItem = (itemId: string) => {
    const wasPacked = packedItems.has(itemId);
    const newPacked = new Set(packedItems);
    if (wasPacked) newPacked.delete(itemId); else newPacked.add(itemId);
    setPackedItems(newPacked);
    if (!isMockTrip) {
      fetch(`/api/trips/${params.id}/packing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, packed: !wasPacked }),
      }).catch(() => setPackedItems(packedItems));
    }
  };

  const addDocTask = (title: string) => {
    if (!title.trim()) return;
    if (isMockTrip) {
      setCustomDocTasks(prev => [...prev, { id: `custom_doc_${Date.now()}`, title: title.trim(), completed: false }]);
    } else {
      const tempId = `temp_${Date.now()}`;
      setPrepTasks(prev => [...prev, { id: tempId, category: 'document', title: title.trim(), completed: false }]);
      fetch(`/api/trips/${params.id}/prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), category: 'document' }),
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data?.task) setPrepTasks(prev => prev.map(t => t.id === tempId ? { id: data.task.id, category: data.task.category, title: data.task.title, completed: data.task.completed } : t));
      }).catch(() => setPrepTasks(prev => prev.filter(t => t.id !== tempId)));
    }
    setNewDocItem('');
  };

  const addLogTask = (title: string) => {
    if (!title.trim()) return;
    if (isMockTrip) {
      setCustomLogTasks(prev => [...prev, { id: `custom_log_${Date.now()}`, title: title.trim(), completed: false }]);
    } else {
      const tempId = `temp_${Date.now()}`;
      setPrepTasks(prev => [...prev, { id: tempId, category: 'logistics', title: title.trim(), completed: false }]);
      fetch(`/api/trips/${params.id}/prep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), category: 'logistics' }),
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data?.task) setPrepTasks(prev => prev.map(t => t.id === tempId ? { id: data.task.id, category: data.task.category, title: data.task.title, completed: data.task.completed } : t));
      }).catch(() => setPrepTasks(prev => prev.filter(t => t.id !== tempId)));
    }
    setNewLogItem('');
  };

  const addPackItem = (name: string, category: string) => {
    if (!name.trim()) return;
    if (isMockTrip) {
      setCustomPackItems(prev => [...prev, { id: `custom_pack_${Date.now()}`, name: name.trim(), category, packed: false }]);
    } else {
      const tempId = `temp_${Date.now()}`;
      setPackingItems(prev => [...prev, { id: tempId, name: name.trim(), category, packed: false }]);
      fetch(`/api/trips/${params.id}/packing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), category }),
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data?.item) setPackingItems(prev => prev.map(i => i.id === tempId ? { id: data.item.id, name: data.item.name, category: data.item.category, packed: data.item.packed } : i));
      }).catch(() => setPackingItems(prev => prev.filter(i => i.id !== tempId)));
    }
    setNewPackItem('');
  };

  const generatePackingList = async () => {
    setPackingGenerating(true);
    setPackingGenError(null);
    try {
      const res = await fetch('/api/generate-packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: params.id, destination: tripDestination }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.message || 'Generation failed');

      // Reload packing items from Supabase so we have real IDs
      const reloadRes = await fetch(`/api/trips/${params.id}/packing`);
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        const items: PackingItem[] = (reloadData.items ?? []).map((i: any) => ({
          id: i.id, name: i.name, category: i.category, packed: i.packed,
        }));
        setPackingItems(items);
        setPackedItems(new Set(items.filter(i => i.packed).map(i => i.id)));
        setExpandedCategories(new Set(['Clothing']));
      }
    } catch (err) {
      setPackingGenError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPackingGenerating(false);
    }
  };

  // ─── Group Pack handlers ───────────────────────────────────────────────────
  const addGroupPackItem = (name: string, category: string) => {
    if (!name.trim() || !category) return;
    const tempId = `temp_${Date.now()}`;
    setGroupPackItems(prev => [...prev, { id: tempId, name: name.trim(), category, packed: false }]);
    fetch(`/api/trips/${params.id}/packing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), category, scope: 'group' }),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.item) setGroupPackItems(prev => prev.map(i => i.id === tempId ? { id: data.item.id, name: data.item.name, category: data.item.category, packed: data.item.packed } : i));
    }).catch(() => setGroupPackItems(prev => prev.filter(i => i.id !== tempId)));
    setNewGroupPackItem('');
  };

  const toggleGroupPackedItem = (itemId: string) => {
    const wasPacked = groupPackedItems.has(itemId);
    const next = new Set(groupPackedItems);
    if (wasPacked) next.delete(itemId); else next.add(itemId);
    setGroupPackedItems(next);
    fetch(`/api/trips/${params.id}/packing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, packed: !wasPacked }),
    }).catch(() => setGroupPackedItems(groupPackedItems));
  };

  const deleteGroupPackItem = (itemId: string) => {
    const removed = groupPackItems.find(i => i.id === itemId);
    setGroupPackItems(prev => prev.filter(i => i.id !== itemId));
    fetch(`/api/trips/${params.id}/packing`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    }).catch(() => {
      if (removed) setGroupPackItems(prev => [...prev, removed]);
    });
  };

  const generateGroupPackingList = async () => {
    setGroupPackGenerating(true);
    setGroupPackGenError(null);
    try {
      const res = await fetch('/api/generate-packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: params.id, destination: tripDestination, scope: 'group' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.message || 'Generation failed');
      const reloadRes = await fetch(`/api/trips/${params.id}/packing?scope=group`);
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        const items: PackingItem[] = (reloadData.items ?? []).map((i: any) => ({ id: i.id, name: i.name, category: i.category, packed: i.packed }));
        setGroupPackItems(items);
        setGroupPackedItems(new Set(items.filter(i => i.packed).map(i => i.id)));
      }
    } catch (err) {
      setGroupPackGenError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setGroupPackGenerating(false);
    }
  };

  // ─── My Pack handlers ──────────────────────────────────────────────────────
  const addMyPackItem = (name: string, category: string) => {
    if (!name.trim() || !category) return;
    const tempId = `temp_${Date.now()}`;
    setMyPackItems(prev => [...prev, { id: tempId, name: name.trim(), category, packed: false }]);
    fetch(`/api/trips/${params.id}/packing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), category, scope: 'mine' }),
    }).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.item) setMyPackItems(prev => prev.map(i => i.id === tempId ? { id: data.item.id, name: data.item.name, category: data.item.category, packed: data.item.packed } : i));
    }).catch(() => setMyPackItems(prev => prev.filter(i => i.id !== tempId)));
    setNewMyPackItem('');
  };

  const toggleMyPackedItem = (itemId: string) => {
    const wasPacked = myPackedItems.has(itemId);
    const next = new Set(myPackedItems);
    if (wasPacked) next.delete(itemId); else next.add(itemId);
    setMyPackedItems(next);
    fetch(`/api/trips/${params.id}/packing`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, packed: !wasPacked }),
    }).catch(() => setMyPackedItems(myPackedItems));
  };

  const deleteMyPackItem = (itemId: string) => {
    const removed = myPackItems.find(i => i.id === itemId);
    setMyPackItems(prev => prev.filter(i => i.id !== itemId));
    fetch(`/api/trips/${params.id}/packing`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    }).catch(() => {
      if (removed) setMyPackItems(prev => [...prev, removed]);
    });
  };

  const generateMyPackingList = async () => {
    setMyPackGenerating(true);
    setMyPackGenError(null);
    try {
      const res = await fetch('/api/generate-packing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: params.id, destination: tripDestination, scope: 'personal' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.message || 'Generation failed');
      const reloadRes = await fetch(`/api/trips/${params.id}/packing?scope=mine`);
      if (reloadRes.ok) {
        const reloadData = await reloadRes.json();
        const items: PackingItem[] = (reloadData.items ?? []).map((i: any) => ({ id: i.id, name: i.name, category: i.category, packed: i.packed }));
        setMyPackItems(items);
        setMyPackedItems(new Set(items.filter(i => i.packed).map(i => i.id)));
      }
    } catch (err) {
      setMyPackGenError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setMyPackGenerating(false);
    }
  };

  // ─── Souvenir / Gift handlers ─────────────────────────────────────────────
  const addSouvenirItem = async () => {
    if (!newSouvenirPerson.trim()) return;
    const tempId = `temp_${Date.now()}`;
    const optimistic: SouvenirItem = { id: tempId, person: newSouvenirPerson.trim(), idea: newSouvenirIdea.trim(), purchased: false };
    setSouvenirItems(prev => [...prev, optimistic]);
    setNewSouvenirPerson('');
    setNewSouvenirIdea('');
    try {
      const res = await fetch(`/api/trips/${params.id}/souvenirs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person: optimistic.person, idea: optimistic.idea }),
      });
      const data = await res.json();
      if (data?.item) setSouvenirItems(prev => prev.map(i => i.id === tempId ? { id: data.item.id, person: data.item.person, idea: data.item.idea, purchased: data.item.purchased } : i));
    } catch { setSouvenirItems(prev => prev.filter(i => i.id !== tempId)); }
  };

  const toggleSouvenirPurchased = (itemId: string, purchased: boolean) => {
    setSouvenirItems(prev => prev.map(i => i.id === itemId ? { ...i, purchased: !purchased } : i));
    fetch(`/api/trips/${params.id}/souvenirs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, purchased: !purchased }),
    }).catch(() => setSouvenirItems(prev => prev.map(i => i.id === itemId ? { ...i, purchased } : i)));
  };

  const deleteSouvenirItem = (itemId: string) => {
    setSouvenirItems(prev => prev.filter(i => i.id !== itemId));
    fetch(`/api/trips/${params.id}/souvenirs`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    }).catch(() => {});
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) newExpanded.delete(category); else newExpanded.add(category);
    setExpandedCategories(newExpanded);
  };

  const togglePhraseCategory = (id: string) => {
    setExpandedPhraseCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCopyPhrase = (phrase: TranslationPhrase) => {
    navigator.clipboard.writeText(phrase.local).catch(() => {});
    setCopiedId(phrase.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const loadPhrasebook = async () => {
    setPhrasesLoading(true);
    setPhrasesError(null);
    try {
      const dests = parseDestinations(tripDestination);
      const isMulti = dests.length > 1;

      // Single request — API handles multi-country natively
      const res = await fetch('/api/generate-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: dests[0],
          destinations: isMulti ? dests : undefined,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.message || data.error);

      // API returns { languages: [...] } for multi-country, or single PhrasebookData
      let phrasebookList: PhrasebookData[] = [];
      if (Array.isArray(data.languages)) {
        phrasebookList = data.languages;
      } else if (data.language && data.categories) {
        phrasebookList = [data];
      }

      // Deduplicate by languageCode in case of overlap
      const seen = new Set<string>();
      const unique = phrasebookList.filter(pb => {
        const code = (pb.languageCode || pb.language || '').toLowerCase();
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
      });

      if (unique.length === 0) throw new Error('No phrasebooks generated');
      setPhrasebooks(unique);
      setActivePhrasebook(0);
      if (unique[0].categories?.length > 0) {
        setExpandedPhraseCategories(new Set([unique[0].categories[0].id]));
      }
    } catch (err) {
      setPhrasesError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setPhrasesLoading(false);
    }
  };

  // Overall progress
  const allDocTasks = [...documentTasks, ...customDocTasks];
  const allLogTasks = [...logisticsTasks, ...customLogTasks];
  const allPackItems = [...packingItems, ...customPackItems];

  const docCompleted = allDocTasks.filter(t => completedTasks.has(t.id) || (customDocTasks.some((ct: any) => ct.id === t.id) && customDocTasks.find((ct: any) => ct.id === t.id)?.completed)).length;
  const logCompleted = allLogTasks.filter(t => completedTasks.has(t.id) || (customLogTasks.some((ct: any) => ct.id === t.id) && customLogTasks.find((ct: any) => ct.id === t.id)?.completed)).length;
  const packCompleted = allPackItems.filter((i: any) => packedItems.has(i.id) || (customPackItems.some(cp => cp.id === i.id) && customPackItems.find(cp => cp.id === i.id)?.packed)).length;

  const totalCompleted = docCompleted + logCompleted + packCompleted;
  const totalItems = (allDocTasks.length || 1) + (allLogTasks.length || 1) + (allPackItems.length || 1);
  const overallProgress = Math.round((totalCompleted / totalItems) * 100);

  // ─── Checkmark SVG helper ──────────────────────────────────────────────────
  const CheckboxChecked = () => (
    <div className="w-6 h-6 bg-sky-800 rounded border-2 border-sky-600 flex items-center justify-center">
      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
  const CheckboxEmpty = () => <div className="w-6 h-6 rounded border-2 border-zinc-300" />;

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  const renderDocumentsTab = () => {
    const all = [...documentTasks, ...customDocTasks];
    const completed = all.filter(t => completedTasks.has(t.id) || customDocTasks.find((ct: any) => ct.id === t.id)?.completed).length;
    const total = all.length || 1;
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-script italic text-lg font-semibold text-zinc-900">Important Stuff</h3>
              <p className="text-sm text-zinc-600 mt-0.5">Passport, visas, travel papers — don't leave without these</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
              <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-900">{completed}/{total} completed</span>
              <span className="text-xs text-zinc-500">{total - completed} remaining</span>
            </div>
          </div>
        </div>

        {isMockTrip ? (
          <>
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sky-900 mb-1">Passport Validity</h3>
                  <p className="text-sm text-sky-800">Your passport expires on 2027-03-15. You have 11 months remaining — plenty of time for this trip!</p>
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-emerald-900 mb-1">Visa Status</h3>
                  <p className="text-sm text-emerald-700">No visa required for US citizens visiting Iceland (Schengen area). Your passport and ETIAS authorization will be sufficient.</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sky-900 mb-1">Visa & Entry Requirements</h3>
                  <p className="text-sm text-sky-800">Check visa requirements for <strong>{tripDestination}</strong> based on your passport. Visit <a href="https://travel.state.gov" target="_blank" rel="noopener noreferrer" className="underline">travel.state.gov</a> for US citizens or your country&apos;s foreign affairs website.</p>
                </div>
              </div>
            </div>
            {isSchengenDest && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-1">EU Entry/Exit System (EES) — Schengen Area</h3>
                    <p className="text-sm text-amber-800 mb-2">
                      The EU&apos;s new <strong>Entry/Exit System (EES)</strong> is being rolled out for non-EU visitors to the Schengen Area. First-time visitors must register biometric data (fingerprints + facial photo) at the border. This replaces manual passport stamping.
                    </p>
                    <ul className="text-sm text-amber-800 space-y-1">
                      <li>⏱ <strong>Allow extra time at border control</strong> — registration can add 15–30 min on your first Schengen entry.</li>
                      <li>📋 Check <a href="https://travel.ec.europa.eu/travel-safety/entry-exit-system-ees_en" target="_blank" rel="noopener noreferrer" className="underline font-medium">the official EES page</a> for the latest rollout status before you travel.</li>
                      <li>🔁 Applies to non-EU/Schengen passport holders (including US, UK, Australian citizens).</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
          <div className="flex gap-2">
            <input type="text" placeholder="Add a document or note..." value={newDocItem} onChange={(e) => setNewDocItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addDocTask(newDocItem); }}
              className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm" />
            <button onClick={() => addDocTask(newDocItem)}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-800 hover:bg-sky-900 text-white flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          {documentTasks.map((task: PrepTask, index: number) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 ${index !== documentTasks.length - 1 ? 'border-b border-zinc-100' : ''} ${completedTasks.has(task.id) ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => toggleDocTask(task.id)} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {completedTasks.has(task.id) ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <div className="flex-1">
                <p className={`font-medium ${completedTasks.has(task.id) ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
                {task.dueDate && <p className="text-xs text-zinc-500 mt-1">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
              </div>
              {task.urgent && !completedTasks.has(task.id) && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-800" />}
            </div>
          ))}
          {customDocTasks.map((task) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 border-t border-zinc-100 ${task.completed ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => setCustomDocTasks(prev => prev.map(t => t.id === task.id ? {...t, completed: !t.completed} : t))} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {task.completed ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <p className={`font-medium flex-1 ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
              <span className="text-xs px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">Custom</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPackingTab = () => {
    const PACK_CATEGORIES = ['Clothing', 'Accessories', 'Documents', 'Electronics', 'Toiletries', 'Medications', 'Gear'];

    // ── Reusable category list renderer ──────────────────────────────────────
    const renderPackList = (
      items: PackingItem[],
      packedSet: Set<string>,
      toggleFn: (id: string) => void,
      deleteFn: (id: string) => void,
    ) => {
      const usedCategories = PACK_CATEGORIES.filter(cat => items.some(i => i.category === cat));
      if (usedCategories.length === 0) return null;
      return (
        <div className="space-y-3">
          {usedCategories.map(category => {
            const catItems = items.filter(i => i.category === category);
            const catPacked = catItems.filter(i => packedSet.has(i.id)).length;
            const isExpanded = expandedCategories.has(category);
            return (
              <div key={category} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                <button onClick={() => toggleCategory(category)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-zinc-900">{category}</span>
                    <span className="text-xs font-medium px-2 py-1 bg-zinc-100 text-zinc-700 rounded-full">{catPacked}/{catItems.length}</span>
                  </div>
                  <div className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}><ChevronDown className="w-5 h-5 text-zinc-600" /></div>
                </button>
                {isExpanded && (
                  <div className="divide-y divide-zinc-100">
                    {catItems.map((item) => {
                      const isPacked = packedSet.has(item.id);
                      return (
                        <div key={item.id} className="flex items-center gap-4 px-6 py-4 hover:bg-zinc-50 transition-colors group">
                          <button onClick={() => toggleFn(item.id)} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                            {isPacked ? <CheckboxChecked /> : <CheckboxEmpty />}
                          </button>
                          <div className="flex-1">
                            <p className={`font-medium ${isPacked ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{item.name}</p>
                          </div>
                          {item.affiliateUrl && (
                            <a href={item.affiliateUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-800 hover:bg-sky-200 text-xs font-semibold rounded transition-all">
                              <ExternalLink className="w-3 h-3" /> Shop
                            </a>
                          )}
                          <button onClick={() => deleteFn(item.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 text-zinc-300 hover:text-rose-400 transition-all flex-shrink-0">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    };

    // ── AI generate card ──────────────────────────────────────────────────────
    const renderAICard = (
      scope: 'group' | 'personal',
      loaded: boolean,
      items: PackingItem[],
      generating: boolean,
      genError: string | null,
      onGenerate: () => void,
    ) => {
      if (isMockTrip || !loaded || items.length > 0) return null;
      const label = scope === 'group' ? 'group packing list' : 'personal packing list';
      const subLabel = scope === 'group'
        ? 'Shared gear, group electronics, documents, and trip essentials.'
        : 'Your personal clothing, toiletries, medications, and comfort items.';
      return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 text-center">
          <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-3">
            {scope === 'group' ? <Users className="w-6 h-6 text-sky-700" /> : <Backpack className="w-6 h-6 text-sky-700" />}
          </div>
          <h3 className="font-semibold text-zinc-900 mb-1">Let AI build your {label}</h3>
          <p className="text-sm text-zinc-500 mb-4">{subLabel}</p>
          {genError && <p className="text-xs text-rose-600 mb-3">{genError}</p>}
          {hasAIPacking ? (
            <button onClick={onGenerate} disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-xl font-semibold text-sm transition-colors">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate AI List</>}
            </button>
          ) : (
            <div className="inline-flex flex-col items-center gap-2">
              <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-100 text-zinc-400 rounded-xl font-semibold text-sm cursor-not-allowed">
                <Lock className="w-4 h-4" /> Generate AI List
              </div>
              <p className="text-xs text-zinc-500">
                <Crown className="w-3 h-3 inline text-amber-400 mr-1" />
                AI packing lists are a <Link href="/pricing" className="text-sky-700 font-semibold hover:underline">Nomad</Link> feature
              </p>
            </div>
          )}
        </div>
      );
    };

    // ── Regenerate button ─────────────────────────────────────────────────────
    const renderRegenBtn = (items: PackingItem[], generating: boolean, onGenerate: () => void) => {
      if (isMockTrip || items.length === 0) return null;
      return (
        <div className="flex justify-end">
          <button onClick={hasAIPacking ? onGenerate : undefined} disabled={generating || !hasAIPacking}
            title={hasAIPacking ? undefined : 'AI packing list is a Nomad feature'}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border border-zinc-200 rounded-lg transition-colors ${hasAIPacking ? 'text-zinc-500 hover:bg-zinc-50 disabled:opacity-50' : 'text-zinc-300 cursor-not-allowed'}`}>
            {generating ? <><Loader2 className="w-3 h-3 animate-spin" /> Regenerating…</> : <><RefreshCw className="w-3 h-3" /> Regenerate AI List</>}
          </button>
        </div>
      );
    };

    // ── Add item form ─────────────────────────────────────────────────────────
    const renderAddForm = (
      value: string, onValueChange: (v: string) => void,
      category: string, onCatChange: (v: string) => void,
      onAdd: () => void,
      placeholder: string,
    ) => (
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Add item</p>
        <div className="flex gap-2">
          <select value={category} onChange={(e) => onCatChange(e.target.value)}
            className="px-3 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700">
            <option value="" disabled>Category</option>
            {PACK_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <input type="text" placeholder={placeholder} value={value} onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
            className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm" />
          <button onClick={onAdd} disabled={!category || !value.trim()}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-800 hover:bg-sky-900 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    );

    // Combined packed count for header progress bar
    const totalGroupPacked = groupPackedItems.size;
    const totalGroupItems = groupPackItems.length;
    const totalMyPacked = myPackedItems.size;
    const totalMyItems = myPackItems.length;
    const totalGiftsBought = souvenirItems.filter(i => i.purchased).length;
    const totalGifts = souvenirItems.length;
    const totalPacked = totalGroupPacked + totalMyPacked + totalGiftsBought;
    const totalItems = (totalGroupItems || 0) + (totalMyItems || 0) + (totalGifts || 0);

    return (
      <div className="space-y-6">
        {/* ── Header card ── */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Backpack className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-script italic text-lg font-semibold text-zinc-900">Pack This</h3>
              <p className="text-sm text-zinc-600 mt-0.5">{isMockTrip ? 'AI-curated for Iceland in September' : `Packing list for ${tripDestination}`}</p>
            </div>
          </div>
          {totalItems > 0 && (
            <div className="space-y-2">
              <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
                <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${Math.round((totalPacked / totalItems) * 100)}%` }} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-zinc-900">{totalPacked}/{totalItems} packed</span>
                <span className="text-xs text-zinc-500">{totalItems - totalPacked} remaining</span>
              </div>
            </div>
          )}
        </div>

        <WeatherWidget destination={tripDestination} startDate={tripStartDate} endDate={tripEndDate} />

        {/* ── Sub-tab selector ── */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-1 inline-flex gap-1">
          {([
            { id: 'group', label: 'Group Pack', icon: Users, count: totalGroupItems, packed: totalGroupPacked },
            { id: 'mine', label: 'My Pack', icon: Backpack, count: totalMyItems, packed: totalMyPacked },
            { id: 'gifts', label: 'Gifts 🎁', icon: Gift, count: totalGifts, packed: totalGiftsBought },
          ] as const).map(tab => {
            const Icon = tab.icon;
            const isActive = packSubTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setPackSubTab(tab.id); setExpandedCategories(new Set(['Clothing'])); }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${isActive ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'}`}>
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                    {tab.packed}/{tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Group Pack sub-tab ── */}
        {packSubTab === 'group' && (
          <>
            <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-3">
              <p className="text-xs text-sky-700"><span className="font-semibold">Group Pack</span> — items everyone can see. Perfect for shared gear: portable speaker, first aid kit, group snacks, and travel docs.</p>
            </div>
            {renderAddForm(newGroupPackItem, setNewGroupPackItem, newGroupPackCategory, setNewGroupPackCategory, () => addGroupPackItem(newGroupPackItem, newGroupPackCategory), 'Add shared item…')}
            {renderAICard('group', groupPackLoaded, groupPackItems, groupPackGenerating, groupPackGenError, generateGroupPackingList)}
            {renderRegenBtn(groupPackItems, groupPackGenerating, generateGroupPackingList)}
            {isMockTrip
              ? renderPackList(packingItems, packedItems, togglePackedItem, () => {})
              : renderPackList(groupPackItems, groupPackedItems, toggleGroupPackedItem, deleteGroupPackItem)
            }
          </>
        )}

        {/* ── My Pack sub-tab ── */}
        {packSubTab === 'mine' && (
          <>
            <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
              <p className="text-xs text-violet-700"><span className="font-semibold">My Pack</span> — your private list. Only you can see this: personal clothing, toiletries, medications, and anything you don't want to share with the group.</p>
            </div>
            {user ? (
              <>
                {renderAddForm(newMyPackItem, setNewMyPackItem, newMyPackCategory, setNewMyPackCategory, () => addMyPackItem(newMyPackItem, newMyPackCategory), 'Add personal item…')}
                {renderAICard('personal', myPackLoaded, myPackItems, myPackGenerating, myPackGenError, generateMyPackingList)}
                {renderRegenBtn(myPackItems, myPackGenerating, generateMyPackingList)}
                {renderPackList(myPackItems, myPackedItems, toggleMyPackedItem, deleteMyPackItem)}
                {myPackLoaded && myPackItems.length === 0 && !myPackGenerating && (
                  <div className="text-center py-8 text-zinc-400 text-sm">No personal items yet.</div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 text-center">
                <Lock className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                <h3 className="font-semibold text-zinc-700 mb-1">Sign in to use My Pack</h3>
                <p className="text-sm text-zinc-400">Your personal packing list is private and saved to your account.</p>
              </div>
            )}
          </>
        )}

        {/* ── Gifts sub-tab ── */}
        {packSubTab === 'gifts' && (
          <>
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700"><span className="font-semibold">Gifts 🎁</span> — your private souvenir list. Track who you want to buy for and what to get them. Only you can see this.</p>
            </div>
            {user ? (
              <>
                {/* Add souvenir form */}
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Add to gift list</p>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Person (e.g. Mom)" value={newSouvenirPerson}
                      onChange={(e) => setNewSouvenirPerson(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addSouvenirItem(); }}
                      className="w-32 flex-shrink-0 px-3 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
                    <input type="text" placeholder="Gift idea (optional)" value={newSouvenirIdea}
                      onChange={(e) => setNewSouvenirIdea(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addSouvenirItem(); }}
                      className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
                    <button onClick={addSouvenirItem} disabled={!newSouvenirPerson.trim()}
                      className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Souvenir list */}
                {souvenirLoaded && souvenirItems.length === 0 ? (
                  <div className="text-center py-10 text-zinc-400 text-sm">
                    <Gift className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
                    No one on your gift list yet. Add names above!
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                    {souvenirItems.map((item, idx) => (
                      <div key={item.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 transition-colors group ${idx > 0 ? 'border-t border-zinc-100' : ''}`}>
                        <button onClick={() => toggleSouvenirPurchased(item.id, item.purchased)}
                          className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                          {item.purchased ? <CheckboxChecked /> : <CheckboxEmpty />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm ${item.purchased ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{item.person}</p>
                          {item.idea && <p className={`text-xs mt-0.5 truncate ${item.purchased ? 'text-zinc-300 line-through' : 'text-zinc-500'}`}>{item.idea}</p>}
                        </div>
                        {item.purchased && (
                          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold flex-shrink-0">Bought ✓</span>
                        )}
                        <button onClick={() => deleteSouvenirItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-50 text-zinc-300 hover:text-rose-400 transition-all flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 text-center">
                <Lock className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                <h3 className="font-semibold text-zinc-700 mb-1">Sign in to use Gifts</h3>
                <p className="text-sm text-zinc-400">Your souvenir list is private and saved to your account.</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderLogisticsTab = () => {
    const all = [...logisticsTasks, ...customLogTasks];
    const completed = all.filter(t => completedTasks.has(t.id) || customLogTasks.find((ct: any) => ct.id === t.id)?.completed).length;
    const total = all.length || 1;
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="font-script italic text-lg font-semibold text-zinc-900">Admin</h3>
              <p className="text-sm text-zinc-600 mt-0.5">Flights, transport, and the boring-but-necessary stuff</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
              <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${Math.round((completed / total) * 100)}%` }} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-zinc-900">{completed}/{total} completed</span>
              <span className="text-xs text-zinc-500">{total - completed} remaining</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
          <div className="flex gap-2">
            <input type="text" placeholder="Add a note or task..." value={newLogItem} onChange={(e) => setNewLogItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addLogTask(newLogItem); }}
              className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm" />
            <button onClick={() => addLogTask(newLogItem)}
              className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-800 hover:bg-sky-900 text-white flex items-center justify-center transition-colors">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          {logisticsTasks.map((task: PrepTask, index: number) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 ${index !== logisticsTasks.length - 1 ? 'border-b border-zinc-100' : ''} ${completedTasks.has(task.id) ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => toggleDocTask(task.id)} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {completedTasks.has(task.id) ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <div className="flex-1">
                <p className={`font-medium ${completedTasks.has(task.id) ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
                {task.dueDate && <p className="text-xs text-zinc-500 mt-1">Due: {new Date(task.dueDate).toLocaleDateString()}</p>}
              </div>
              {task.urgent && !completedTasks.has(task.id) && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-800" />}
            </div>
          ))}
          {customLogTasks.map((task) => (
            <div key={task.id} className={`flex items-center gap-4 px-6 py-4 border-t border-zinc-100 ${task.completed ? 'bg-zinc-50' : ''}`}>
              <button onClick={() => setCustomLogTasks(prev => prev.map(t => t.id === task.id ? {...t, completed: !t.completed} : t))} className="flex-shrink-0 focus:outline-none flex items-center justify-center w-6 h-6">
                {task.completed ? <CheckboxChecked /> : <CheckboxEmpty />}
              </button>
              <p className={`font-medium flex-1 ${task.completed ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{task.title}</p>
              <span className="text-xs px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">Custom</span>
            </div>
          ))}
        </div>

        {isMockTrip ? (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <Briefcase className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">SIM Card & Data Plan</h3>
                  <p className="text-sm text-blue-700">Iceland has excellent 4G coverage. Consider buying a local SIM at Keflavik Airport (cheaper than roaming). Providers: Nova, Siminn, Vodafone.</p>
                </div>
              </div>
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sky-900 mb-1">Currency Exchange: Icelandic Króna (ISK)</h3>
                  <p className="text-sm text-sky-800 mb-2">Current rate: 1 USD = ~134 ISK</p>
                  <p className="text-sm text-sky-800">Most establishments accept cards. Withdraw ISK at airport ATM or change money at banks.</p>
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-emerald-900 mb-1">Airport Transfer: Arranged</h3>
                  <p className="text-sm text-emerald-700">Rental car pickup at Keflavik Airport, 15 September 3:00 PM. Return car on 21 September before your flight.</p>
                </div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Emergency Information</h3>
                  <ul className="text-sm text-red-700 space-y-1 mt-2">
                    <li><span className="font-semibold">Emergency Number:</span> 112</li>
                    <li><span className="font-semibold">Nearest Hospital:</span> Landspítali University Hospital, Reykjavik</li>
                    <li><span className="font-semibold">US Embassy:</span> +354 595-2100, Reykjavik</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {!isDomesticUS && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <div className="flex gap-3">
                  <Briefcase className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-1">SIM Card & Data Plan</h3>
                    <p className="text-sm text-blue-700">Research local SIM options for {tripDestination} before you fly. Airport SIMs are convenient but often pricier — compare at a local carrier store on arrival if you have time.</p>
                  </div>
                </div>
              </div>
            )}
            {!isDomesticUS && (
              <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-sky-900 mb-1">Currency & Payments</h3>
                    <p className="text-sm text-sky-800">Check the local currency for {tripDestination} and whether cards are widely accepted. Notify your bank of travel dates to avoid card blocks. Airport ATMs are usually the safest withdrawal option.</p>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Emergency Information</h3>
                  <ul className="text-sm text-red-700 space-y-1 mt-2">
                    <li><span className="font-semibold">Emergency Number:</span> 911</li>
                    {!isDomesticUS && (
                      <li><span className="font-semibold">US Embassy:</span> Find the nearest embassy at <a href="https://www.usembassy.gov" target="_blank" rel="noopener noreferrer" className="underline">usembassy.gov</a></li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const phrasebook = phrasebooks[activePhrasebook] ?? null;

  const renderPhrasesTab = () => {
    // Nomad gate — show upgrade prompt for non-Nomad users
    if (!hasAIPhrasebook) {
      return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
          <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">AI Phrasebook is a Nomad feature</h3>
          <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
            Upgrade to Nomad to generate a destination-specific phrasebook with pronunciation guides for greetings, dining, transport, emergencies, and more.
          </p>
          <Link
            href="/pricing"
            className="px-6 py-3 bg-zinc-900 hover:bg-zinc-700 text-white rounded-xl font-semibold transition-colors inline-flex items-center gap-2 text-sm"
          >
            <Crown className="w-4 h-4 text-amber-400" />
            Upgrade to Nomad
          </Link>
        </div>
      );
    }

    // Empty / pre-load state
    if (phrasebooks.length === 0 && !phrasesLoading && !phrasesError) {
      const destNames = parseDestinations(tripDestination);
      const multi = destNames.length > 1;
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
                <Globe className="w-6 h-6 text-sky-700" />
              </div>
              <div className="flex-1">
                <h3 className="font-script italic text-lg font-semibold text-zinc-900">Phrase Guide</h3>
                <p className="text-sm text-zinc-600 mt-0.5">
                  AI-generated phrases for {tripDestination}{multi ? ' — one phrasebook per language' : ''}
                </p>
              </div>
            </div>
          </div>
          <div className="text-center py-12 bg-white rounded-2xl border border-zinc-100 shadow-sm">
            <Globe className="w-12 h-12 text-sky-200 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">
              {multi ? `Generate phrasebooks for ${destNames.length} destinations` : `Ready to brush up on the local language?`}
            </h3>
            <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
              {multi
                ? `We'll generate a separate phrasebook for each language region: ${destNames.join(', ')}.`
                : 'Generate a practical phrasebook with pronunciation guides — greetings, dining, transport, emergencies, and more.'}
            </p>
            <button
              onClick={loadPhrasebook}
              className="px-6 py-3 bg-sky-800 hover:bg-sky-900 text-white rounded-xl font-semibold transition-colors inline-flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              Generate {multi ? 'Phrasebooks' : 'Phrasebook'}
            </button>
            <p className="text-xs text-zinc-400 mt-3">Uses 1 AI credit from your account</p>
          </div>
        </div>
      );
    }

    // Loading state
    if (phrasesLoading) {
      return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
          <Loader2 className="w-10 h-10 text-sky-700 animate-spin mx-auto mb-4" />
          <p className="text-lg font-semibold text-zinc-900">Generating your phrasebook…</p>
          <p className="text-sm text-zinc-500 mt-1">AI is curating key phrases for {tripDestination}</p>
        </div>
      );
    }

    // Error state
    if (phrasesError) {
      return (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <p className="text-lg font-semibold text-zinc-900">Couldn't load phrases</p>
          <p className="text-sm text-zinc-500 mt-1">{phrasesError}</p>
          <button onClick={loadPhrasebook} className="mt-4 px-5 py-2.5 bg-sky-800 text-white rounded-lg text-sm font-medium hover:bg-sky-900 transition-colors">
            Try Again
          </button>
        </div>
      );
    }

    if (!phrasebook) return null;

    return (
      <div className="space-y-6">
        {/* Language tabs — shown when multiple languages available */}
        {phrasebooks.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {phrasebooks.map((pb, i) => (
              <button
                key={pb.languageCode}
                onClick={() => { setActivePhrasebook(i); setExpandedPhraseCategories(new Set([pb.categories[0]?.id])); }}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  activePhrasebook === i ? 'bg-sky-800 text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-sky-400'
                }`}
              >
                {pb.language}
              </button>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Globe className="w-6 h-6 text-sky-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-zinc-900">
                {phrasebook.language} Phrases
              </h3>
              <p className="text-sm text-zinc-600 mt-0.5">
                {phrasebook.categories.reduce((acc, c) => acc + c.phrases.length, 0)} phrases across {phrasebook.categories.length} categories for {phrasebook.destination}
              </p>
            </div>
            <button
              onClick={loadPhrasebook}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-zinc-200 rounded-lg text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Regenerate
            </button>
          </div>
        </div>

        <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4">
          <p className="text-sm text-sky-800">
            <span className="font-semibold">💡 How to use:</span> Tap any phrase to copy the local text, then paste into Google Translate or show your phone to a local.
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-3">
          {phrasebook.categories.map((cat) => {
            const isExpanded = expandedPhraseCategories.has(cat.id);
            return (
              <div key={cat.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => togglePhraseCategory(cat.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <span className="font-semibold text-zinc-900">{cat.label}</span>
                    <span className="text-xs font-medium px-2 py-1 bg-zinc-100 text-zinc-700 rounded-full">
                      {cat.phrases.length}
                    </span>
                  </div>
                  <div className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-5 h-5 text-zinc-600" />
                  </div>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-zinc-50">
                    {cat.phrases.map((phrase) => (
                      <button
                        key={phrase.id}
                        onClick={() => handleCopyPhrase(phrase)}
                        className="w-full text-left px-6 py-4 hover:bg-zinc-50 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">
                              {phrase.english}
                            </p>
                            <p className="text-base font-semibold text-zinc-900 leading-snug">
                              {phrase.local}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Volume2 className="w-3 h-3 text-sky-500 flex-shrink-0" />
                              <p className="text-sm text-sky-600 font-medium">{phrase.phonetic}</p>
                            </div>
                            {phrase.tip && (
                              <p className="text-xs text-zinc-400 mt-1.5 italic">{phrase.tip}</p>
                            )}
                          </div>
                          <div className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-all ${
                            copiedId === phrase.id
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-zinc-100 text-zinc-500 group-hover:bg-sky-100 group-hover:text-sky-700'
                          }`}>
                            {copiedId === phrase.id ? 'Copied!' : 'Tap to copy'}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Page shell ───────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-parchment p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-zinc-400 mb-3">Pre-Trip</p>
          <h1 className="font-script italic text-4xl font-semibold text-zinc-900 mb-2">Don't Forget</h1>
          <p className="text-zinc-600 mb-6">Everything ready before takeoff</p>
          <div className="w-full bg-zinc-200 rounded-full h-2.5 overflow-hidden">
            <div className="bg-sky-800 h-full transition-all duration-300" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>

        {/* Trip load error banner */}
        {prepLoadError && (
          <div className="mb-6 flex items-center justify-between px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm text-amber-800">⚠️ Couldn't load your trip data — showing defaults. Check your connection and try refreshing.</p>
            <button
              onClick={() => { setPrepLoadError(false); window.location.reload(); }}
              className="ml-4 text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-8 bg-white rounded-2xl border border-zinc-100 shadow-sm p-1 inline-flex gap-1 flex-wrap">
          {[
            { id: 'documents', label: 'Important Stuff', icon: FileText },
            { id: 'logistics', label: 'Admin', icon: Briefcase },
            { id: 'packing', label: 'Pack This', icon: Backpack },
            // Hide Phrases tab for domestic US trips — no foreign language needed
            ...(!isDomesticUS ? [{ id: 'phrases', label: 'Phrases', icon: Globe }] : []),
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                  isActive ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div>
          {activeTab === 'documents' && renderDocumentsTab()}
          {activeTab === 'logistics' && renderLogisticsTab()}
          {activeTab === 'packing' && renderPackingTab()}
          {activeTab === 'phrases' && renderPhrasesTab()}
        </div>
      </div>
    </main>
  );
}
