// Shared trip date / relative-time helpers — single source so the dashboard,
// trips list, and notification surfaces don't drift (the audit found a
// floor-vs-round "time ago" mismatch and copy-pasted computeStatus).

/**
 * Trip status derived from its date range. Noon-pads YYYY-MM-DD so it doesn't
 * parse as UTC midnight (which is the previous day in any timezone west of
 * UTC, flipping 'active' a day early).
 */
export function computeStatus(startDate?: string, endDate?: string): 'planning' | 'active' | 'completed' {
  if (!startDate) return 'planning';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate + 'T12:00:00');
  start.setHours(0, 0, 0, 0);
  if (today < start) return 'planning';
  if (!endDate) return 'active';
  const end = new Date(endDate + 'T12:00:00');
  end.setHours(0, 0, 0, 0);
  return today <= end ? 'active' : 'completed';
}

/**
 * Whole days from local-today until `startDate` (YYYY-MM-DD), clamped >= 0.
 * Noon-anchored on BOTH sides so the partial current day doesn't round up
 * (the "17 days away" → "18" off-by-one fixed earlier lived in a local copy).
 */
export function daysUntil(startDate: string): number {
  const start = new Date(startDate + 'T12:00:00');
  const n = new Date();
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0);
  return Math.max(0, Math.round((start.getTime() - today.getTime()) / 86_400_000));
}

/**
 * "Time ago" for a timestamp — minute/hour/day buckets (rounded), falling back
 * to an explicit "Mon D" past 7 days. One implementation so the notification
 * panel and the standalone notifications page render the same string (they
 * used to disagree: "1m ago" vs "just now").
 */
export function relativeTime(iso: string): string {
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
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
