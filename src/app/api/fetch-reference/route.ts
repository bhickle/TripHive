import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

/**
 * POST /api/fetch-reference
 *
 * Given a list of saved reference URLs (Reddit threads, blog posts, TripAdvisor
 * pages, etc. that a user attached to an "On My Radar" wishlist item), fetch
 * each one and extract readable text. The Trip Builder folds the result into a
 * dedicated "reference material" slot in the generation prompt so the AI can
 * draw on the specific places / tips the user bookmarked.
 *
 * Best-effort by design: every failure mode (bad URL, blocked bot, timeout,
 * non-HTML, anti-scraping) resolves to empty content rather than an error, so
 * the Trip Builder always proceeds. No AI call here — no credit charge.
 *
 * SSRF guard + bot User-Agent mirror /api/og-preview.
 */

const FETCH_TIMEOUT_MS = 6000;
const PER_LINK_CHARS = 2000;
const TOTAL_CHARS = 4000;
const MAX_LINKS = 3;
const UA = 'Mozilla/5.0 (compatible; tripcoordBot/1.0; +https://tripcoord.ai)';

function isUnsafeHost(hostRaw: string): boolean {
  const host = hostRaw.toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^fc00:/.test(host) ||
    /^fd00:/.test(host)
  );
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pull the post body + top comment text out of Reddit's .json response shape:
// [ { data: { children: [{ data: {title, selftext} }] } },
//   { data: { children: [{ data: {body} }, ...] } } ]
function redditText(data: unknown): string {
  try {
    const arr = data as Array<{ data?: { children?: Array<{ data?: { title?: string; selftext?: string; body?: string } }> } }>;
    const post = arr?.[0]?.data?.children?.[0]?.data;
    const title = typeof post?.title === 'string' ? post.title : '';
    const selftext = typeof post?.selftext === 'string' ? post.selftext : '';
    const comments = (arr?.[1]?.data?.children ?? [])
      .map((c) => c?.data?.body)
      .filter((b): b is string => typeof b === 'string' && b.length > 0 && b !== '[deleted]' && b !== '[removed]')
      .slice(0, 8);
    let out = title ? `Title: ${title}\n\n` : '';
    if (selftext) out += `${selftext}\n\n`;
    if (comments.length) out += `Top comments:\n${comments.map((b) => `- ${b}`).join('\n')}`;
    return out.trim();
  } catch {
    return '';
  }
}

async function fetchOne(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  if (isUnsafeHost(parsed.hostname)) return '';

  const isReddit = /(^|\.)reddit\.com$/.test(parsed.hostname.toLowerCase());
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Reddit: the .json endpoint gives clean post + comment text. May be
    // rate-limited / 403'd for unauthenticated bots — fall through to HTML.
    if (isReddit) {
      try {
        const jsonUrl = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}.json`;
        const res = await fetch(jsonUrl, {
          signal: controller.signal,
          headers: { 'User-Agent': UA, Accept: 'application/json' },
        });
        if (res.ok) {
          const text = redditText(await res.json());
          if (text) return text.slice(0, PER_LINK_CHARS);
        }
      } catch {
        /* fall through to generic HTML fetch */
      }
    }

    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return '';
    if (!(res.headers.get('content-type') ?? '').includes('text/html')) return '';
    const html = (await res.text()).slice(0, 512 * 1024);
    return htmlToText(html).slice(0, PER_LINK_CHARS);
  } catch {
    return '';
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let urls: string[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.urls)) {
      urls = body.urls.filter((u: unknown): u is string => typeof u === 'string' && u.trim().length > 0);
    }
  } catch {
    /* malformed body → empty */
  }
  if (urls.length === 0) return NextResponse.json({ content: '' });

  const results = await Promise.all(
    urls.slice(0, MAX_LINKS).map(async (u) => {
      const text = await fetchOne(u);
      if (!text) return '';
      let host = '';
      try {
        host = new URL(u).hostname.replace(/^www\./, '');
      } catch {
        /* keep host empty */
      }
      return `From ${host || 'a saved link'}:\n${text}`;
    }),
  );

  const content = results.filter(Boolean).join('\n\n---\n\n').slice(0, TOTAL_CHARS);
  return NextResponse.json({ content });
}
