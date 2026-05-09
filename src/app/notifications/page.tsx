'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Bell, ArrowLeft, Loader2 } from 'lucide-react';

// Server returns rows from the `notifications` table — see /api/notifications/route.ts
interface NotificationRow {
  id: string;
  type: 'activity' | 'chat' | 'expense' | 'vote' | 'member' | 'ai' | 'prep' | 'trip_invite';
  trip_id: string | null;
  trip_name: string | null;
  inviter_name: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

const TYPE_META: Record<NotificationRow['type'], { label: string; color: string; icon: string }> = {
  activity:    { label: 'Activity',     color: 'bg-sky-100 text-sky-700',           icon: '📍' },
  chat:        { label: 'Chat',         color: 'bg-violet-100 text-violet-700',     icon: '💬' },
  expense:     { label: 'Expense',      color: 'bg-emerald-100 text-emerald-700',   icon: '💸' },
  vote:        { label: 'Vote',         color: 'bg-amber-100 text-amber-700',       icon: '🗳️' },
  member:      { label: 'Group',        color: 'bg-rose-100 text-rose-700',         icon: '👥' },
  ai:          { label: 'AI',           color: 'bg-indigo-100 text-indigo-700',     icon: '✦' },
  prep:        { label: 'Prep',         color: 'bg-orange-100 text-orange-700',     icon: '📋' },
  trip_invite: { label: 'Invite',       color: 'bg-teal-100 text-teal-700',         icon: '✉️' },
};

function timeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Math.round((now - then) / 1000));
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  // Explicit locale + options so dates read the same across en-US, en-GB,
  // etc. Bare .toLocaleDateString() rendered "5/9/2026" or "09/05/2026"
  // depending on locale — confusing for international users.
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Map a notification to the right destination tab. Chat / vote notifications
// deep-link to the group page with the right tab pre-selected (the group
// page already honors ?tab=chat | votes per the existing notification bell).
function destinationFor(n: NotificationRow): string | null {
  if (!n.trip_id) return null;
  switch (n.type) {
    case 'chat':        return `/trip/${n.trip_id}/group?tab=chat`;
    case 'vote':        return `/trip/${n.trip_id}/group?tab=votes`;
    case 'expense':     return `/trip/${n.trip_id}/group?tab=expenses`;
    case 'member':      return `/trip/${n.trip_id}/group`;
    case 'trip_invite': return `/join/${n.trip_id}`;
    case 'activity':
    case 'ai':
    case 'prep':
    default:            return `/trip/${n.trip_id}/itinerary`;
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  // Redirect to login if auth resolves with no user
  useEffect(() => {
    if (!currentUser.isLoading && !currentUser.id && !currentUser.isDemo) {
      router.replace('/auth/login');
    }
  }, [currentUser.isLoading, currentUser.id, currentUser.isDemo, router]);

  const loadNotifications = useCallback(async () => {
    if (currentUser.isLoading || !currentUser.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      const data = await res.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch (err) {
      console.error('Notifications fetch error:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [currentUser.isLoading, currentUser.id]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = async (id: string) => {
    // Optimistic update — capture pre-state for rollback so a failed POST
    // doesn't leave the row stuck as "read" client-side while it's still
    // unread on the server.
    const prev = notifications;
    setNotifications(prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`mark-read failed: ${res.status}`);
    } catch (err) {
      console.error('Mark-read error:', err);
      setNotifications(prev);
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0 || markingAllRead) return;
    setMarkingAllRead(true);
    const prev = notifications;
    setNotifications(prev.map(n => ({ ...n, read: true })));
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) throw new Error(`mark-all failed: ${res.status}`);
    } catch (err) {
      console.error('Mark-all-read error:', err);
      setNotifications(prev);
    } finally {
      setMarkingAllRead(false);
    }
  };

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar
        activePage="dashboard"
        user={{
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          subscriptionTier: currentUser.subscriptionTier,
        }}
      />

      <main className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Back link */}
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>

          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-script italic font-semibold text-zinc-900 mb-1">Notifications</h1>
              <p className="text-sm text-zinc-500">
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                disabled={markingAllRead}
                className="text-sm font-semibold text-sky-700 hover:text-sky-900 disabled:opacity-50 transition-colors"
              >
                {markingAllRead ? 'Marking…' : 'Mark all read'}
              </button>
            )}
          </div>

          {/* List */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
            {loading && (
              <div className="px-6 py-12 text-center">
                <Loader2 className="w-6 h-6 text-zinc-400 mx-auto mb-2 animate-spin" />
                <p className="text-sm text-zinc-400">Loading notifications…</p>
              </div>
            )}

            {!loading && loadError && (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-rose-600 mb-2">Couldn&apos;t load notifications.</p>
                <button
                  onClick={loadNotifications}
                  className="text-sm font-semibold text-sky-700 hover:text-sky-900"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !loadError && notifications.length === 0 && (
              <div className="px-6 py-16 text-center">
                <Bell className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-base font-medium text-zinc-700 mb-1">No notifications yet</p>
                <p className="text-sm text-zinc-400">
                  Trip activity, votes, expenses, and invites will show up here.
                </p>
              </div>
            )}

            {!loading && !loadError && notifications.length > 0 && (
              <div className="divide-y divide-zinc-100">
                {notifications.map((notif) => {
                  const meta = TYPE_META[notif.type] ?? { label: notif.type, color: 'bg-zinc-100 text-zinc-600', icon: '🔔' };
                  const dest = destinationFor(notif);
                  const Wrapper: React.ElementType = dest ? Link : 'div';
                  const wrapperProps = dest
                    ? { href: dest, onClick: () => { if (!notif.read) markRead(notif.id); } }
                    : { onClick: () => { if (!notif.read) markRead(notif.id); } };
                  return (
                    <Wrapper
                      key={notif.id}
                      {...wrapperProps}
                      className={`block w-full text-left px-5 py-4 hover:bg-parchment-dark transition-colors ${!notif.read ? 'bg-sky-50/30' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0 mt-0.5">{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${meta.color}`}>
                              {meta.label}
                            </span>
                            {!notif.read && (
                              <span className="w-2 h-2 bg-sky-800 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          <p className={`text-sm ${!notif.read ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700'}`}>
                            {notif.message}
                          </p>
                          <p className="text-[11px] text-zinc-400 mt-1">
                            {notif.trip_name ? `${notif.trip_name} · ` : ''}{timeAgo(notif.created_at)}
                          </p>
                        </div>
                      </div>
                    </Wrapper>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
