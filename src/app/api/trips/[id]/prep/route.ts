import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

const GENERIC_PREP_TASKS = [
  { category: 'document', title: 'Check passport validity (6+ months required for most destinations)', urgent: false, display_order: 0 },
  { category: 'document', title: 'Confirm visa or entry authorization for your destination', urgent: false, display_order: 1 },
  { category: 'document', title: 'Purchase travel insurance', urgent: true, display_order: 2 },
  { category: 'document', title: 'Save copies of passport & bookings to phone/cloud', urgent: false, display_order: 3 },
  { category: 'document', title: 'Save flight confirmations / boarding passes', urgent: false, display_order: 4 },
  { category: 'document', title: 'Save hotel & lodging confirmations', urgent: false, display_order: 5 },
  { category: 'document', title: 'Pack driver\'s license or government ID', urgent: false, display_order: 6 },
  { category: 'logistics', title: 'Notify your bank of travel dates', urgent: false, display_order: 7 },
  { category: 'logistics', title: 'Check roaming / arrange a local SIM', urgent: false, display_order: 8 },
  { category: 'logistics', title: 'Download offline maps for your destination', urgent: false, display_order: 9 },
  { category: 'logistics', title: 'Confirm accommodation check-in details', urgent: false, display_order: 10 },
  { category: 'logistics', title: 'Set up out-of-office email / work coverage', urgent: false, display_order: 11 },
  { category: 'logistics', title: 'Arrange pet, plant, or mail care', urgent: false, display_order: 12 },
  { category: 'logistics', title: 'Refill prescriptions', urgent: false, display_order: 13 },
];

/**
 * GET /api/trips/[id]/prep
 * Returns prep tasks for the trip. Seeds generic defaults on first access.
 *
 * POST /api/trips/[id]/prep
 * Adds a new prep task. Body: { category, title, dueDate? }
 *
 * PATCH /api/trips/[id]/prep
 * Updates a task. Body: { taskId, completed?, title? } — at least one of completed/title.
 *
 * DELETE /api/trips/[id]/prep
 * Removes a task. Body: { taskId }
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

    // Seed generic tasks if none exist yet. If the seed insert fails the
    // user would see defaults that vanish on refresh — so log loudly and
    // return whatever did come back. seeded falls back to seeds only when
    // Supabase didn't return rows (it should always return them on insert
    // success); a real failure surfaces an error.
    if (!existing || existing.length === 0) {
      const seeds = GENERIC_PREP_TASKS.map(t => ({ ...t, trip_id: params.id, completed: false }));
      const { data: seeded, error: seedErr } = await supabase
        .from('prep_tasks')
        .insert(seeds)
        .select();
      if (seedErr) {
        console.error('prep_tasks seed insert failed:', seedErr);
        return NextResponse.json({ tasks: [] });
      }
      return NextResponse.json({ tasks: seeded ?? [] });
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

    const { taskId, completed, title } = await req.json();
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    const update: { completed?: boolean; title?: string } = {};
    if (typeof completed === 'boolean') update.completed = completed;
    if (typeof title === 'string') {
      const trimmed = title.trim();
      if (!trimmed) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
      update.title = trimmed;
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'completed or title required' }, { status: 400 });
    }

    // Scope by trip_id so a member of trip A can't toggle tasks in trip B
    const { error } = await supabase
      .from('prep_tasks')
      .update(update)
      .eq('id', taskId)
      .eq('trip_id', params.id);

    if (error) return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('prep PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

    const { taskId } = await req.json();
    if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 });

    // Scope by trip_id so a member of trip A can't delete tasks in trip B
    const { error } = await supabase
      .from('prep_tasks')
      .delete()
      .eq('id', taskId)
      .eq('trip_id', params.id);

    if (error) return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('prep DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
