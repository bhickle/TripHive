'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell, X, CheckCheck, MapPin, MessageSquare,
  DollarSign, ThumbsUp, UserPlus, Sparkles, Route,
  Calendar,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifType =
  | 'itinerary'
  | 'chat'
  | 'expense'
  | 'vote'
  | 'member'
  | 'ai'
  | 'transport'
  | 'reminder';

// ─── DB row → display shape mapping ───────────────────────────────────────────

interface ApiNotificationRow {
  id: string;
  type: string;
  trip_id: string | null;
  trip_name: string | null;
  inviter_name: string | null;
  message: string | null;
  read: boolean;
  created_at: string;
}

function dbTypeToUi(t: string): NotifType {
  switch (t) {
    case 'trip_invite':  return 'member';
    case 'new_message':  return 'chat';
    case 'new_vote':     return 'vote';
    default:             return 'reminder';
  }
}

function buildTitle(row: ApiNotificationRow): string {
  const who = row.inviter_name ?? 'Someone';
  const trip = row.trip_name ?? 'a trip';
  switch (row.type) {
    case 'trip_invite': return `${who} invited you to ${trip}`;
    case 'new_message': return `New message from ${who}`;
    case 'new_vote':    return `${who} started a vote`;
    default:            return who;
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function rowToNotification(row: ApiNotificationRow): Notification {
  return {
    id: row.id,
    type: dbTypeToUi(row.type),
    dbType: row.type,
    title: buildTitle(row),
    message: row.message ?? '',
    tripId: row.trip_id ?? undefined,
    tripName: row.trip_name ?? undefined,
    time: relativeTime(row.created_at),
    read: row.read,
  };
}

/**
 * Where should clicking this notification take the user?
 * Returns null if there's no relevant destination.
 */
function destinationUrl(notif: Notification): string | null {
  if (!notif.tripId) return null;
  switch (notif.dbType) {
    // trip_invite → same URL the email/SMS link uses, so guests get the same
    // intro/preferences flow whether they came in via email or the bell.
    case 'trip_invite': return `/join/${notif.tripId}`;
    case 'new_message': return `/trip/${notif.tripId}/group?tab=chat`;
    case 'new_vote':    return `/trip/${notif.tripId}/group?tab=votes`;
    default:            return `/trip/${notif.tripId}/itinerary`;
  }
}

export interface Notification {
  id: string;
  type: NotifType;
  /** Raw DB type — used to pick the destination URL on click. */
  dbType?: string;
  title: string;
  message: string;
  tripId?: string;
  tripName?: string;
  time: string;
  read: boolean;
  avatar?: string; // initials
  avatarColor?: string;
}


// ─── Icon factory ─────────────────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotifType }) {
  const base = 'w-4 h-4';
  switch (type) {
    case 'itinerary': return <MapPin className={`${base} text-sky-600`} />;
    case 'chat': return <MessageSquare className={`${base} text-violet-600`} />;
    case 'expense': return <DollarSign className={`${base} text-emerald-600`} />;
    case 'vote': return <ThumbsUp className={`${base} text-amber-600`} />;
    case 'member': return <UserPlus className={`${base} text-rose-600`} />;
    case 'ai': return <Sparkles className={`${base} text-sky-600`} />;
    case 'transport': return <Route className={`${base} text-indigo-600`} />;
    case 'reminder': return <Calendar className={`${base} text-orange-600`} />;
    default: return <Bell className={`${base} text-slate-500`} />;
  }
}

function notifTypeBg(type: NotifType) {
  switch (type) {
    case 'itinerary': return 'bg-sky-50';
    case 'chat': return 'bg-violet-50';
    case 'expense': return 'bg-emerald-50';
    case 'vote': return 'bg-amber-50';
    case 'member': return 'bg-rose-50';
    case 'ai': return 'bg-sky-50';
    case 'transport': return 'bg-indigo-50';
    case 'reminder': return 'bg-orange-50';
    default: return 'bg-slate-50';
  }
}

// ─── Notification Item ────────────────────────────────────────────────────────

function NotifItem({
  notif,
  onRead,
  onNavigate,
}: {
  notif: Notification;
  onRead: (id: string) => void;
  onNavigate: (url: string) => void;
}) {
  const handleClick = () => {
    onRead(notif.id);
    const url = destinationUrl(notif);
    if (url) onNavigate(url);
  };
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer ${
        !notif.read ? 'bg-sky-50/40' : ''
      }`}
      onClick={handleClick}
    >
      {/* Avatar or icon */}
      <div className="flex-shrink-0 mt-0.5">
        {notif.avatar ? (
          <div className={`w-9 h-9 rounded-full ${notif.avatarColor ?? 'bg-slate-400'} flex items-center justify-center text-white text-xs font-bold`}>
            {notif.avatar}
          </div>
        ) : (
          <div className={`w-9 h-9 rounded-full ${notifTypeBg(notif.type)} flex items-center justify-center`}>
            <NotifIcon type={notif.type} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className={`text-sm font-semibold truncate ${!notif.read ? 'text-slate-900' : 'text-slate-700'}`}>
            {notif.title}
          </p>
          {!notif.read && (
            <span className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{notif.message}</p>
        <div className="flex items-center gap-2 mt-1.5">
          {notif.tripName && (
            <span className="text-xs text-slate-400 truncate">{notif.tripName}</span>
          )}
          <span className="text-xs text-slate-300">&middot;</span>
          <span className="text-xs text-slate-400 flex-shrink-0">{notif.time}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Bell Button (exported for use in TopBar) ─────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const navigate = useCallback((url: string) => {
    setOpen(false);
    router.push(url);
  }, [router]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Initial fetch from /api/notifications
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const { notifications: rows } = await res.json() as { notifications: ApiNotificationRow[] };
      setNotifications((rows ?? []).map(rowToNotification));
    } catch {
      /* unauthenticated or network error — leave list empty */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime subscription so new notifications appear instantly without a refresh.
  // Falls back gracefully if Supabase is unreachable — refresh() still pulls on mount.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const channel = supabase
          .channel(`notifications:${user.id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
            (payload) => {
              const row = payload.new as ApiNotificationRow;
              setNotifications(prev => {
                if (prev.some(n => n.id === row.id)) return prev;
                return [rowToNotification(row), ...prev];
              });
            },
          )
          .subscribe();

        cleanup = () => { supabase.removeChannel(channel); };
      } catch {
        /* swallow — realtime is best-effort */
      }
    })();

    return () => { cancelled = true; cleanup?.(); };
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => { /* non-critical */ });
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => { /* non-critical */ });
  };

  // Group: unread first, then by trip
  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
          open ? 'bg-sky-50 text-sky-700' : 'hover:bg-zinc-100 text-zinc-600'
        }`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 min-w-[1.1rem] rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center leading-none px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 text-xs font-bold rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  All read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="py-12 text-center px-6">
                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600 mb-1">No notifications yet</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Activity from your trips — group chat messages, expense splits, itinerary changes, and more — will appear here.
                </p>
              </div>
            ) : (
              <>
                {unread.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-50">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New</p>
                    </div>
                    {unread.map((n) => (
                      <NotifItem key={n.id} notif={n} onRead={markRead} onNavigate={navigate} />
                    ))}
                  </div>
                )}
                {read.length > 0 && (
                  <div>
                    {unread.length > 0 && (
                      <div className="px-4 py-2 bg-slate-50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Earlier</p>
                      </div>
                    )}
                    {read.map((n) => (
                      <NotifItem key={n.id} notif={n} onRead={markRead} onNavigate={navigate} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400 text-center">
              Notifications are per-trip.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
