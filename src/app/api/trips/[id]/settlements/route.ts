import { NextResponse } from 'next/server';
import { requireTripAccess, hasTripFeatureAccess } from '@/lib/supabase/tripAccess';

/**
 * Recorded debtor->creditor payments for group expense settle-up.
 *
 * Replaces the old per-expense `settled` boolean for "Mark Paid". A suggested
 * payment is a NETTED figure across many expenses, so it can't be mapped back
 * to specific expense rows — marking the row(s) settled wiped unrelated debts
 * (the GROUP-1 audit bug). Instead we record the payment here; the client
 * computes net balances as (owed from expenses) − (recorded payments), so
 * "Mark Paid" clears only that one transaction.
 */

// GET — list recorded payments for the trip.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireTripAccess(params.id);
  if (!access.ok) return access.response;
  const { supabase } = access.ctx;

  const { data, error } = await supabase
    .from('expense_settlements')
    .select('id, from_name, to_name, amount, created_at')
    .eq('trip_id', params.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[settlements] GET error:', error);
    return NextResponse.json({ error: 'Failed to load settlements' }, { status: 500 });
  }

  return NextResponse.json({
    settlements: (data ?? []).map(s => ({
      id: s.id,
      fromName: s.from_name,
      toName: s.to_name,
      amount: Number(s.amount),
      createdAt: s.created_at,
    })),
  });
}

// POST — record a payment { fromName, toName, amount }.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const access = await requireTripAccess(params.id);
  if (!access.ok) return access.response;
  const { userId, supabase } = access.ctx;

  // Same gate as expenses — settle-up is part of the paid expenses feature.
  const featureCheck = await hasTripFeatureAccess(supabase, params.id, userId, 'canUseExpenses');
  if (!featureCheck.allowed) {
    return NextResponse.json(
      { error: 'FEATURE_LOCKED', message: 'Expense tracking is a paid feature.' },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { fromName, toName, amount } = body as { fromName?: string; toName?: string; amount?: unknown };

  if (!fromName?.trim() || !toName?.trim()) {
    return NextResponse.json({ error: 'fromName and toName are required' }, { status: 400 });
  }
  const amt = parseFloat(String(amount));
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('expense_settlements')
    .insert({
      trip_id: params.id,
      from_name: fromName.trim(),
      to_name: toName.trim(),
      amount: amt,
      created_by: userId,
    })
    .select('id, from_name, to_name, amount, created_at')
    .single();

  if (error) {
    console.error('[settlements] POST error:', error);
    return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 });
  }

  return NextResponse.json({
    settlement: {
      id: data.id,
      fromName: data.from_name,
      toName: data.to_name,
      amount: Number(data.amount),
      createdAt: data.created_at,
    },
  });
}

// DELETE — undo a recorded payment (?settlementId=...).
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const access = await requireTripAccess(params.id);
  if (!access.ok) return access.response;
  const { supabase } = access.ctx;

  const settlementId = new URL(req.url).searchParams.get('settlementId');
  if (!settlementId) {
    return NextResponse.json({ error: 'settlementId is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('expense_settlements')
    .delete()
    .eq('id', settlementId)
    .eq('trip_id', params.id);

  if (error) {
    console.error('[settlements] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to undo payment' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
