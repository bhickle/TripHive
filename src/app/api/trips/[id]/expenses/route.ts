import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]/expenses
 * Returns all expenses for a trip.
 *
 * POST /api/trips/[id]/expenses
 * Adds a new expense.
 * Body: { description, amount, paidByName, splitType, category, customAmounts?, lineItems? }
 *
 * PATCH /api/trips/[id]/expenses
 * Toggles settled status on an expense.
 * Body: { expenseId, settled }
 */

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

    // Cap at 500 expenses per trip. Real trips rarely exceed ~50 rows
    // but a runaway integration or test could push much higher; without
    // a cap the response can balloon and slow group-page paint.
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', params.id)
      .order('created_at', { ascending: true })
      .limit(500);

    if (error) return NextResponse.json({ expenses: [] });

    return NextResponse.json({
      expenses: (expenses ?? []).map(e => ({
        id: e.id,
        description: e.description,
        amount: e.amount,
        paidByName: e.paid_by_name,
        paidByUserId: e.paid_by_user_id,
        splitType: e.split_type ?? 'equal',
        category: e.category,
        customAmounts: e.custom_amounts ?? {},
        lineItems: e.line_items ?? [],
        settled: e.settled ?? false,
        createdAt: e.created_at,
      })),
    });
  } catch (err) {
    console.error('expenses GET error:', err);
    return NextResponse.json({ expenses: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const body = await req.json();
    const { description, amount, paidByName, splitType, category, customAmounts, lineItems } = body;

    if (!description?.trim() || !amount || !paidByName?.trim()) {
      return NextResponse.json({ error: 'description, amount, and paidByName are required' }, { status: 400 });
    }

    const { data: expense, error } = await supabase
      .from('expenses')
      .insert({
        trip_id: params.id,
        description: description.trim(),
        amount: parseFloat(amount),
        paid_by_name: paidByName.trim(),
        paid_by_user_id: userId,
        split_type: splitType ?? 'equal',
        category: category ?? null,
        custom_amounts: customAmounts ?? null,
        line_items: lineItems ?? null,
        settled: false,
      })
      .select()
      .single();

    if (error) {
      console.error('expense insert error:', error);
      return NextResponse.json({ error: 'Failed to add expense' }, { status: 500 });
    }

    return NextResponse.json({
      expense: {
        id: expense.id,
        description: expense.description,
        amount: expense.amount,
        paidByName: expense.paid_by_name,
        paidByUserId: expense.paid_by_user_id,
        splitType: expense.split_type ?? 'equal',
        category: expense.category,
        customAmounts: expense.custom_amounts ?? {},
        lineItems: expense.line_items ?? [],
        settled: expense.settled ?? false,
        createdAt: expense.created_at,
      },
    });
  } catch (err) {
    console.error('expenses POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

    const body = await req.json();
    const { expenseId, settled, lineItems } = body as {
      expenseId?: string;
      settled?: boolean;
      lineItems?: Array<{ description?: unknown; amount?: unknown }>;
    };
    if (!expenseId) return NextResponse.json({ error: 'expenseId required' }, { status: 400 });

    // Patch shape — only fields the client passed are updated. Settled is a
    // toggle (mark paid/unpaid). lineItems is the editable line-item list:
    // every item must have a non-empty description and a non-negative
    // numeric amount; we trim/coerce here so client-side typos can't
    // poison the JSONB blob.
    const update: { settled?: boolean; line_items?: Array<{ description: string; amount: number }>; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };
    if (typeof settled === 'boolean') {
      update.settled = settled;
    }
    if (Array.isArray(lineItems)) {
      const cleaned = lineItems
        .map(li => ({
          description: typeof li.description === 'string' ? li.description.trim() : '',
          amount: typeof li.amount === 'number' ? li.amount : parseFloat(String(li.amount ?? 0)),
        }))
        .filter(li => li.description.length > 0 && Number.isFinite(li.amount) && li.amount >= 0);
      update.line_items = cleaned;
    }

    const { error } = await supabase
      .from('expenses')
      .update(update)
      .eq('id', expenseId)
      .eq('trip_id', params.id);

    if (error) {
      return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('expenses PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
