'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Clock, Tag, AlertTriangle, ExternalLink, UserCheck, UserX } from 'lucide-react';
import { relativeTime } from '@/lib/tripDates';

interface Ticket {
  id: string;
  user_id: string | null;
  email: string;
  name: string | null;
  subject: string;
  body: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'normal' | 'high';
  user_tier: string | null;
  trip_id: string | null;
  admin_notes: string | null;
  assigned_to: string | null;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface AdminProfile {
  id: string;
  name: string | null;
  email: string | null;
}

const STATUS_LABELS: Record<Ticket['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_COLORS: Record<Ticket['status'], string> = {
  open: 'bg-rose-100 text-rose-700 border-rose-200',
  in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
};

function firstName(p: AdminProfile | undefined): string {
  if (!p) return 'Unknown';
  if (p.name && p.name.trim()) return p.name.split(' ')[0];
  if (p.email) return p.email.split('@')[0];
  return 'Unknown';
}


export function AdminSupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Ticket['status'] | 'all'>('open');
  const [mineOnly, setMineOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const adminById = useMemo(() => {
    const map = new Map<string, AdminProfile>();
    for (const a of admins) map.set(a.id, a);
    return map;
  }, [admins]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    const url = statusFilter === 'all'
      ? '/api/support/tickets'
      : `/api/support/tickets?status=${statusFilter}`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets ?? []);
        setAdmins(data.admins ?? []);
        setCallerId(data.callerId ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const updateTicket = async (
    id: string,
    patch: Partial<Pick<Ticket, 'status' | 'priority' | 'admin_notes' | 'assigned_to'>>,
  ) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/support/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) await loadTickets();
    } finally {
      setSaving(null);
    }
  };

  const visibleTickets = useMemo(() => (
    mineOnly && callerId
      ? tickets.filter(t => t.assigned_to === callerId)
      : tickets
  ), [tickets, mineOnly, callerId]);

  const counts = visibleTickets.reduce(
    (acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <main className="min-h-screen bg-parchment px-4 py-8 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-script italic font-semibold text-slate-900">Support tickets</h1>
          <button
            onClick={loadTickets}
            className="text-sm text-sky-700 hover:text-sky-900 font-medium"
          >
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {(['open', 'in_progress', 'resolved', 'closed', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                statusFilter === s
                  ? 'bg-sky-800 border-sky-800 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s]}
              {s !== 'all' && counts[s] != null && (
                <span className={`ml-1.5 ${statusFilter === s ? 'text-sky-200' : 'text-slate-400'}`}>
                  {counts[s]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <button
            onClick={() => setMineOnly(m => !m)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all inline-flex items-center gap-1.5 ${
              mineOnly
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" /> Assigned to me
          </button>
        </div>

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : visibleTickets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 p-12 text-center">
            <p className="text-slate-500">
              {mineOnly
                ? "Nothing's assigned to you in this filter. Try the team queue."
                : "No tickets match this filter. Quiet for now."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleTickets.map(t => {
              const isExpanded = expandedId === t.id;
              const created = new Date(t.created_at);
              const notesValue = editNotes[t.id] ?? t.admin_notes ?? '';
              const assignee = t.assigned_to ? adminById.get(t.assigned_to) : null;
              const updater = t.last_updated_by ? adminById.get(t.last_updated_by) : null;
              const assignedToMe = callerId !== null && t.assigned_to === callerId;
              const unassigned = t.assigned_to === null;
              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-2xl border shadow-sm transition-all ${
                    t.priority === 'high' && t.status === 'open'
                      ? 'border-amber-300 shadow-amber-100'
                      : assignedToMe
                        ? 'border-sky-200'
                        : 'border-zinc-100'
                  }`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    className="w-full text-left p-5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {t.priority === 'high' && (
                            <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="w-3 h-3" /> Priority
                            </span>
                          )}
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_COLORS[t.status]}`}>
                            {STATUS_LABELS[t.status]}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                            <Tag className="w-3 h-3" /> {t.category}
                          </span>
                          {t.user_tier && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              {t.user_tier}
                            </span>
                          )}
                          {/* Assignment badge */}
                          {unassigned ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border border-dashed border-slate-300 px-2 py-0.5 rounded-full">
                              Unclaimed
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                              assignedToMe
                                ? 'text-sky-700 bg-sky-50 border-sky-200'
                                : 'text-violet-700 bg-violet-50 border-violet-200'
                            }`}>
                              <UserCheck className="w-3 h-3" />
                              {assignedToMe ? 'You' : firstName(assignee ?? undefined)}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-900 truncate">{t.subject}</p>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {t.name ?? 'A user'} · {t.email}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400 flex-shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {created.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-5 space-y-4">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Message</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{t.body}</p>
                      </div>

                      {t.trip_id && (
                        <Link
                          href={`/trip/${t.trip_id}/itinerary`}
                          target="_blank"
                          className="inline-flex items-center gap-1 text-sm text-sky-700 hover:text-sky-900"
                        >
                          View trip <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}

                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                          Admin notes <span className="font-normal normal-case text-slate-400">(only admins see this)</span>
                        </p>
                        <textarea
                          value={notesValue}
                          onChange={e => setEditNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                          onBlur={() => {
                            if ((editNotes[t.id] ?? '') !== (t.admin_notes ?? '')) {
                              updateTicket(t.id, { admin_notes: editNotes[t.id] ?? '' });
                            }
                          }}
                          rows={3}
                          placeholder="Internal notes other admins can see"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                        />
                      </div>

                      {/* Assignment row */}
                      <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-lg">
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Owner:</span>
                        {assignee ? (
                          <span className="text-sm font-medium text-slate-700">
                            {firstName(assignee)}{assignedToMe ? ' (you)' : ''}
                          </span>
                        ) : (
                          <span className="text-sm italic text-slate-400">Unclaimed</span>
                        )}
                        <div className="ml-auto flex flex-wrap gap-2">
                          {unassigned && callerId && (
                            <button
                              onClick={() => updateTicket(t.id, { assigned_to: callerId })}
                              disabled={saving === t.id}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-sky-800 border-sky-800 text-white hover:bg-sky-900 disabled:opacity-50"
                            >
                              <UserCheck className="w-3.5 h-3.5 inline mr-1" /> Claim
                            </button>
                          )}
                          {!unassigned && !assignedToMe && callerId && (
                            <button
                              onClick={() => updateTicket(t.id, { assigned_to: callerId })}
                              disabled={saving === t.id}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                            >
                              Reassign to me
                            </button>
                          )}
                          {!unassigned && (
                            <button
                              onClick={() => updateTicket(t.id, { assigned_to: null })}
                              disabled={saving === t.id}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-50"
                            >
                              <UserX className="w-3.5 h-3.5 inline mr-1" /> Unassign
                            </button>
                          )}
                          {/* Assign to a specific other admin via select */}
                          {admins.length > 1 && (
                            <select
                              value={t.assigned_to ?? ''}
                              onChange={e => {
                                const val = e.target.value;
                                updateTicket(t.id, { assigned_to: val === '' ? null : val });
                              }}
                              disabled={saving === t.id}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-slate-200 text-slate-700 hover:border-slate-400 disabled:opacity-50"
                            >
                              <option value="">Assign to…</option>
                              {admins.map(a => (
                                <option key={a.id} value={a.id}>
                                  {firstName(a)}{a.id === callerId ? ' (you)' : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center justify-between">
                        <div className="flex flex-wrap gap-2">
                          {(['open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => updateTicket(t.id, { status: s })}
                              disabled={saving === t.id || t.status === s}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                t.status === s
                                  ? 'bg-slate-100 border-slate-300 text-slate-500 cursor-default'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                              }`}
                            >
                              {STATUS_LABELS[s]}
                            </button>
                          ))}
                          <button
                            onClick={() => updateTicket(t.id, { priority: t.priority === 'high' ? 'normal' : 'high' })}
                            disabled={saving === t.id}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-white border-slate-200 text-slate-700 hover:border-slate-400"
                          >
                            {t.priority === 'high' ? 'Demote to normal' : 'Mark priority'}
                          </button>
                        </div>
                        <a
                          href={`mailto:${t.email}?subject=Re: ${encodeURIComponent(t.subject)}`}
                          className="inline-flex items-center gap-1.5 text-sm text-sky-700 hover:text-sky-900 font-medium"
                        >
                          <Mail className="w-4 h-4" /> Reply by email
                        </a>
                      </div>

                      {/* Last touched footer */}
                      {updater && (
                        <p className="text-xs text-slate-400 italic">
                          Last touched by {firstName(updater)}
                          {t.last_updated_by === callerId ? ' (you)' : ''}
                          {' · '}
                          {relativeTime(t.updated_at)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
