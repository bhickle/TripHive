'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, Clock, Tag, AlertTriangle, ExternalLink } from 'lucide-react';

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
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
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

export function AdminSupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<Ticket['status'] | 'all'>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

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
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const updateTicket = async (
    id: string,
    patch: Partial<Pick<Ticket, 'status' | 'priority' | 'admin_notes'>>,
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

  const counts = tickets.reduce(
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

        <div className="flex flex-wrap gap-2 mb-6">
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

        {loading ? (
          <p className="text-slate-500">Loading…</p>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-zinc-100 p-12 text-center">
            <p className="text-slate-500">No tickets match this filter. Quiet for now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map(t => {
              const isExpanded = expandedId === t.id;
              const created = new Date(t.created_at);
              const notesValue = editNotes[t.id] ?? t.admin_notes ?? '';
              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-2xl border shadow-sm transition-all ${
                    t.priority === 'high' && t.status === 'open'
                      ? 'border-amber-300 shadow-amber-100'
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
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Admin notes</p>
                        <textarea
                          value={notesValue}
                          onChange={e => setEditNotes(prev => ({ ...prev, [t.id]: e.target.value }))}
                          onBlur={() => {
                            if ((editNotes[t.id] ?? '') !== (t.admin_notes ?? '')) {
                              updateTicket(t.id, { admin_notes: editNotes[t.id] ?? '' });
                            }
                          }}
                          rows={3}
                          placeholder="Notes only you can see"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                        />
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
