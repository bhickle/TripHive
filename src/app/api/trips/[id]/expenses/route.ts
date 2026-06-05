import { NextResponse } from 'next/server';
import { requireTripAccess, hasTripFeatureAccess } from '@/lib/supabase/tripAccess';

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

    if (error) {
      // Previously returned `{ expenses: [] }` silently — same bug pattern
      // as messages GET (fixed earlier). User looked at an empty Who-Owes-
      // Who list and assumed there were no expenses, when actually the DB
      // read failed. Surface the error so the client can retry.
      console.error('[expenses GET] supabase error for trip', params.id, error);
      return NextResponse.json(
        { error: 'Failed to load expenses. Please retry.' },
        { status: 500 },
      );
    }

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
    // Same swallow pattern as the inline error case above — surface a 500
    // so the client retries instead of silently rendering an empty Who-
    // Owes-Who list.
    console.error('expenses GET error:', err);
    return NextResponse.json(
      { error: 'Failed to load expenses. Please retry.' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    // Tier gate: expenses is a paid feature (Trip Pass / Travel Pro).
    // Trip Pass overlay grants this to every member of a pass trip too.
    const featureCheck = await hasTripFeatureAccess(supabase, params.id, userId, 'canUseExpenses');
    if (!featureCheck.allowed) {
      return NextResponse.json(
        { error: 'FEATURE_LOCKED', message: 'Expense tracking is a paid feature. Upgrade to Travel Pro or buy a Trip Pass to unlock it.' },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { description, amount, paidByName, splitType, category, customAmounts, lineItems } = body;

    if (!description?.trim() || !paidByName?.trim()) {
      return NextResponse.json({ error: 'description and paidByName are required' }, { status: 400 });
    }

    // Amount must be a finite, positive number — a negative or NaN amount
    // would invert / poison the who-owes-whom math.
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    // Custom-split shares must sum to the total, or balances never net to
    // zero. The client checks this, but enforce it server-side so a direct
    // API call can't persist an inconsistent split.
    if (splitType === 'custom' && customAmounts && typeof customAmounts === 'object') {
      const shareSum = Object.values(customAmounts as Record<string, unknown>)
        .reduce((s: number, v) => s + (parseFloat(String(v)) || 0), 0);
      if (Math.abs(shareSum - amt) > 0.01) {
        return NextResponse.json(
          { error: 'Custom split shares must add up to the total amount.' },
          { status: 400 },
        );
      }
    }

    const { data: expense, error } = await supabase
      .from('expenses')
      .insert({
        trip_id: params.id,
        description: description.trim(),
        amount: amt,
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
    const { userId, supabase } = access.ctx;

    // Same tier gate as POST — paid feature only.
    const featureCheck = await hasTripFeatureAccess(supabase, params.id, userId, 'canUseExpenses');
    if (!featureCheck.allowed) {
      return NextResponse.json(
        { error: 'FEATURE_LOCKED', message: 'Expense tracking is a paid feature. Upgrade to Travel Pro or buy a Trip Pass to unlock it.' },
        { status: 403 },
      );
    }

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
    const update: {
      settled?: boolean;
      line_items?: Array<{ description: string; amount: number }>;
      amount?: number;
      updated_at: string;
    } = {
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
      // Recompute parent amount = sum(lineItems) whenever lineItems is
      // patched. Who-Owes-Who math uses the row's `amount`, not the line-
      // item sum — without this, editing a line item from $20→$50 would
      // leave the parent expense at the old total and silently under-bill
      // the splits. Round to cents to dodge float-fuzz from JS arithmetic.
      const sum = cleaned.reduce((s, li) => s + li.amount, 0);
      // Only overwrite the parent amount when the line items actually carry
      // amounts. Receipt-scanned expenses store line items with amount:0 and
      // the real total on the parent — a benign line-item edit must NOT
      // recompute the parent to $0 and silently wipe it from the splits. (GROUP-9)
      if (sum > 0) {
        update.amount = Math.round(sum * 100) / 100;
      }
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
