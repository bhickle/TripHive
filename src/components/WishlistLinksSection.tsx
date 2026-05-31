'use client';

import React, { useState } from 'react';
import { ExternalLink, Plus, Loader2, X, LinkIcon } from 'lucide-react';
import type { WishlistLink } from '@/lib/types';

interface Props {
  itemId: string;
  links: WishlistLink[];
  /**
   * Caller is responsible for updating the parent state's `links` array
   * after a successful add/remove. Receives the new full array.
   */
  onLinksChange: (next: WishlistLink[]) => void;
  /**
   * When false, hides the add-link input (e.g. demo trips that don't
   * persist links). Render-only mode still shows existing links.
   */
  canEdit?: boolean;
}

/**
 * Per-wishlist-item link section: paste a URL, server-side OG-scrape
 * via /api/og-preview, persist via /api/wishlist PATCH, render rich
 * preview cards. Zero AI cost — the value is the link metadata fetch.
 */
export function WishlistLinksSection({ itemId, links, onLinksChange, canEdit = true }: Props) {
  const [inputUrl, setInputUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  const handleAdd = async () => {
    const url = inputUrl.trim();
    if (!url) return;
    let normalized: string;
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      normalized = u.href;
    } catch {
      setError('That doesn\'t look like a valid URL.');
      return;
    }
    if (links.some(l => l.url === normalized)) {
      setError('You\'ve already saved that link.');
      return;
    }
    setFetching(true);
    setError(null);
    try {
      // 1. Fetch OG metadata
      const ogRes = await fetch('/api/og-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
      });
      const ogData = ogRes.ok ? await ogRes.json().catch(() => null) : null;
      const preview: WishlistLink = {
        url: normalized,
        title: ogData?.preview?.title ?? null,
        description: ogData?.preview?.description ?? null,
        image: ogData?.preview?.image ?? null,
        siteName: ogData?.preview?.siteName ?? null,
        fetchedAt: new Date().toISOString(),
      };

      // 2. Persist
      const saveRes = await fetch('/api/wishlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action: 'add', link: preview }),
      });
      if (!saveRes.ok) {
        setError('Couldn\'t save the link. Try again.');
        return;
      }
      const saved = await saveRes.json().catch(() => null);
      const nextLinks: WishlistLink[] = saved?.links ?? [preview, ...links];
      onLinksChange(nextLinks);
      setInputUrl('');
    } catch {
      setError('Couldn\'t reach the link service. Try again in a moment.');
    } finally {
      setFetching(false);
    }
  };

  const handleRemove = async (url: string) => {
    if (removingUrl) return;
    const prev = links;
    setRemovingUrl(url);
    // Optimistic
    onLinksChange(links.filter(l => l.url !== url));
    try {
      const res = await fetch('/api/wishlist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action: 'remove', url }),
      });
      if (!res.ok) {
        onLinksChange(prev);
      }
    } catch {
      onLinksChange(prev);
    } finally {
      setRemovingUrl(null);
    }
  };

  return (
    <div className="space-y-2">
      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map(link => {
            let host = '';
            try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { /* keep blank */ }
            return (
              <li key={link.url} className="group/link relative flex items-center gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 rounded-lg pl-2 pr-7 py-1.5 transition-colors">
                {link.image ? (
                  // Native img — OG images come from arbitrary hosts that aren't
                  // in next.config remotePatterns, so we skip Next/Image here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={link.image} alt="" className="w-9 h-9 rounded object-cover bg-zinc-200 flex-shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded bg-zinc-200 flex items-center justify-center flex-shrink-0">
                    <LinkIcon className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                )}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0"
                  onClick={e => e.stopPropagation()}
                >
                  <p className="text-xs font-semibold text-zinc-900 truncate">
                    {link.title ?? link.url}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {link.siteName ?? host}
                  </p>
                </a>
                <ExternalLink className="w-3 h-3 text-zinc-300 flex-shrink-0" />
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemove(link.url); }}
                    disabled={removingUrl === link.url}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full opacity-0 group-hover/link:opacity-100 hover:bg-rose-50 text-zinc-300 hover:text-rose-500 flex items-center justify-center transition-all"
                    aria-label="Remove link"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <>
          <div className="flex gap-1.5">
            <input
              type="url"
              placeholder="Paste a blog or article link…"
              value={inputUrl}
              onChange={e => { setInputUrl(e.target.value); if (error) setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
              disabled={fetching}
              onClick={e => e.stopPropagation()}
              className="flex-1 px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent disabled:bg-zinc-50"
            />
            <button
              onClick={(e) => { e.stopPropagation(); handleAdd(); }}
              disabled={fetching || !inputUrl.trim()}
              className="flex-shrink-0 px-2.5 py-1.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-full transition-colors"
              aria-label="Add link"
            >
              {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 mt-1 leading-snug">
            Tip: blog &amp; article links read best when we build your trip. Reddit, Instagram &amp; TripAdvisor links still save here, but often can&apos;t be read.
          </p>
          {error && <p className="text-[10px] text-rose-600">{error}</p>}
        </>
      )}
    </div>
  );
}
