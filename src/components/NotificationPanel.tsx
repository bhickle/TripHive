'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bell, X, Check, CheckCheck, MapPin, MessageSquare,
  DollarSign, ThumbsUp, UserPlus, Sparkles, Route, AlertCircle,
  Calendar,
} from 'lucide-react';

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

export interface Notification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  tripId?: string;
  tripName?: string;
  time: string;
  read: boolean;
  avatar?: string; // initials
  avatarColor?: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    type: 'vote',
    title: 'New votes on Blue Lagoon',
    message: 'Sarah and 2 others voted for Blue Lagoon on Day 3.',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: '8 min ago',
    read: false,
    avatar: 'SC',
    avatarColor: 'bg-violet-500',
  },
  {
    id: 'n2',
    type: 'chat',
    title: 'Marcus in Group Chat',
    message: '"Should we book the Northern Lights tour now? Spots are filling up fast!"',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: '22 min ago',
    read: false,
    avatar: 'MJ',
    avatarColor: 'bg-sky-600',
  },
  {
    id: 'n3',
    type: 'expense',
    title: 'Expense added',
    message: 'Emily Park added Whale Watching Tickets ($340) — split equally 5 ways.',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: '1 hr ago',
    read: false,
    avatar: 'EP',
    avatarColor: 'bg-emerald-500',
  },
  {
    id: 'n4',
    type: 'transport',
    title: 'Transport leg added',
    message: 'A bus transfer from Reykjavik to Seljalandsfoss was added to Day 3.',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: '2 hr ago',
    read: false,
    avatar: 'TH',
    avatarColor: 'bg-amber-500',
  },
  {
    id: 'n5',
    type: 'itinerary',
    title: 'Itinerary updated',
    message: 'Sarah Chen added "Hot Spring Visit" to Day 3 of Iceland Adventure.',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: '3 hr ago',
    read: true,
    avatar: 'SC',
    avatarColor: 'bg-violet-500',
  },
  {
    id: 'n6',
    type: 'ai',
    title: 'AI suggestion ready',
    message: 'Your personalized Day 4 itinerary was generated based on your group\'s votes.',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: '4 hr ago',
    read: true,
    avatar: undefined,
    avatarColor: undefined,
  },
  {
    id: 'n7',
    type: 'member',
    title: 'Tyler joined the trip',
    message: 'Tyler Hansen accepted your invite and joined Iceland Adventure.',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: 'Yesterday',
    read: true,
    avatar: 'TH',
    avatarColor: 'bg-rose-500',
  },
  {
    id: 'n8',
    type: 'reminder',
    title: '3 days until departure',
    message: 'Your trip to Iceland starts on May 12. Time to check your prep list!',
    tripId: 'trip_1',
    tripName: 'Iceland Adventure',
    time: 'Yesterday',
    read: true,
    avatar: undefined,
    avatarColor: undefined,
  },
];

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
}: {
  notif: Notification;
  onRead: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer ${
        !notif.read ? 'bg-sky-50/40' : ''
      }`}
      onClick={() => onRead(notif.id)}
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
  const [notifications, setNotifications] = useState<Notification[]>(MOCK_NOTIFICATIONS);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

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
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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
              <div className="py-12 text-center">
                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No notifications yet</p>
              </div>
            ) : (
              <>
                {unread.length > 0 && (
                  <div>
                    <div className="px-4 py-2 bg-slate-50">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">New</p>
                    </div>
                    {unread.map((n) => (
                      <NotifItem key={n.id} notif={n} onRead={markRead} />
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
                      <NotifItem key={n.id} notif={n} onRead={markRead} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400 text-center">
              Notifications are per-trip. Real-time updates coming soon.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
