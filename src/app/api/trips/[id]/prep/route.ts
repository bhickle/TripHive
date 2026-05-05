import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

const GENERIC_PREP_TASKS = [
  { category: 'document', title: 'Check passport validity (6+ months required for most destinations)', urgent: false, display_order: 0 },
  { category: 'document', title: 'Confirm visa requirements for your destination', urgent: false, display_order: 1 },
  { category: 'document', title: 'Purchase travel insurance', urgent: true, display_order: 2 },
  { category: 'document', title: 'Save copies of passport & bookings to phone/cloud', urgent: false, display_order: 3 },
  { category: 'logistics', title: 'Notify your bank of travel dates', urgent: false, display_order: 4 },
  { category: 'logistics', title: 'Check roaming / arrange a local SIM', urgent: false, display_order: 5 },
  { category: 'logistics', title: 'Confirm accommodation check-in details', urgent: false, display_order: 6 },
  { category: 'logistics', title: 'Download offline maps for your destination', urgent: false, display_order: 7 },
];

/**
 * GET /api/trips/[id]/prep
 * Returns prep tasks for the trip. Seeds generic defaults on first access.
 *
 * POST /api/trips/[id]/prep
 * Adds a new prep task. Body: { category, title, dueDate? }
 *
 * PATCH /api/trips/[id]/prep
 * Toggles task completion. Body: { taskId, completed }
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

    const { data: existing } = await supabase
      .from('prep_tasks')
      .select('*')
      .eq('trip_id', params.id)
      .order('display_order', { ascending: true });

    // Seed generic tasks if none exist yet
    if (!existing || existing.length === 0) {
      const seeds = GENERIC_PREP_TASKS.map(t => ({ ...t, trip_id: params.id, completed: false }));
      const { data: seeded } = await supabase
        .from('prep_tasks')
        .insert(seeds)
        .select();
      return NextResponse.json({ tasks: seeded ?? seeds });
    }

    return NextResponse.json({ tasks: existing });
  } catch (err) {
    console.error('prep GET error:', err);
    return NextResponse.json({ tasks: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

    const body = await req.json();
    const { category, title, dueDate } = body;
    if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 });

    // Get max display_order
    const { data: last } = await supabase
      .from('prep_tasks')
      .select('display_order')
      .eq('trip_id', params.id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const { data: task, error } = await supabase
      .from('prep_tasks')
      .insert({
        trip_id: params.id,
        category: category ?? 'logistics',
        title: title.trim(),
        due_date: dueDate ?? null,
        completed: false,
        display_order: (last?.display_order ?? 0) + 1,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to add task' }, { status: 500 });
    return NextResponse.json({ task });
  } catch (err) {
    console.error('prep POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

    const { taskId, completed } = await req.json();
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    // Scope by trip_id so a member of trip A can't toggle tasks in trip B
    const { error } = await supabase
      .from('prep_tasks')
      .update({ completed: !!completed })
      .eq('id', taskId)
      .eq('trip_id', params.id);

    if (error) return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('prep PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
