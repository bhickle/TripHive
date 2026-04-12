import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/integration-vote
 *
 * Body: { integrationId: string, integrationName: string, action: 'vote' | 'unvote' | 'comment', comment?: string }
 *
 * Writes a row to an Airtable base whenever a user votes or leaves a comment.
 * Requires env vars:
 *   AIRTABLE_API_KEY   — Personal Access Token from airtable.com/create/tokens
 *   AIRTABLE_BASE_ID   — The base ID (starts with "app"), found in the API docs for your base
 *   AIRTABLE_TABLE_NAME — Name of the table to write to (default: "Integration Feedback")
 *
 * Table schema (create once in Airtable):
 *   Integration   — Single line text
 *   Type          — Single select  (Vote / Unvote / Comment)
 *   Comment       — Long text
 *   Timestamp     — Date (include time)
 *
 * If the env vars are absent the route returns 200 silently so the UI
 * never breaks in dev/demo mode.
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { integrationId, integrationName, action, comment } = body as {
      integrationId: string;
      integrationName: string;
      action: 'vote' | 'unvote' | 'comment';
      comment?: string;
    };

    if (!integrationId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const apiKey   = process.env.AIRTABLE_API_KEY;
    const baseId   = process.env.AIRTABLE_BASE_ID;
    const table    = process.env.AIRTABLE_TABLE_NAME ?? 'Integration Feedback';

    // Graceful no-op when Airtable isn't configured yet
    if (!apiKey || !baseId) {
      return NextResponse.json({ ok: true, persisted: false });
    }

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;

    const fields: Record<string, string> = {
      Integration: integrationName,
      Type: action === 'vote' ? 'Vote' : action === 'unvote' ? 'Unvote' : 'Comment',
      Timestamp: new Date().toISOString(),
    };
    if (comment) fields.Comment = comment;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[integration-vote] Airtable error:', err);
      // Still return 200 so the client UI doesn't break
      return NextResponse.json({ ok: true, persisted: false, airtableError: err });
    }

    return NextResponse.json({ ok: true, persisted: true });
  } catch (err) {
    console.error('[integration-vote] Unexpected error:', err);
    return NextResponse.json({ ok: true, persisted: false });
  }
}
