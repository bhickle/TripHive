import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

async function getAuthedUserId(): Promise<string | null> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function verifyTripAccess(supabase: ReturnType<typeof createAdminClient>, tripId: string, userId: string): Promise<boolean> {
  const { data: trip } = await supabase
    .from('trips')
    .select('organizer_id')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip) return false;
  if (trip.organizer_id === userId) return true;

  const { data: membership } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!membership;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthedUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();
    const hasAccess = await verifyTripAccess(supabase, params.id, userId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('trip_id', params.id)
      .order('created_at', { ascending: true });

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
    const userId = await getAuthedUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();
    const hasAccess = await verifyTripAccess(supabase, params.id, userId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
    const userId = await getAuthedUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();
    const hasAccess = await verifyTripAccess(supabase, params.id, userId);
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { expenseId, settled } = await req.json();
    if (!expenseId) return NextResponse.json({ error: 'expenseId required' }, { status: 400 });

    const { error } = await supabase
      .from('expenses')
      .update({ settled: !!settled, updated_at: new Date().toISOString() })
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
