import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB — matches the bucket's file_size_limit
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * POST /api/profile/avatar
 *
 * Multipart upload: field "file" carries the image.
 * Uploads the image to Supabase Storage (avatars bucket) and updates
 * profiles.avatar_url with the resulting public URL.
 *
 * Response: { url: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: 'Could not read upload.' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'Missing "file" field.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be 5MB or smaller.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Image must be JPEG, PNG, WebP, or GIF.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Storage layout: avatars/<userId>/avatar-<timestamp>.<ext>
  // Including userId in the path keeps a per-user folder; timestamp prevents
  // CDN cache from serving the previous image after an update.
  const ext = file.name.split('.').pop()?.toLowerCase() || file.type.split('/')[1] || 'jpg';
  const objectPath = `${userId}/avatar-${Date.now()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from('avatars')
    .upload(objectPath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    console.error('[profile/avatar] upload failed:', uploadErr);
    return NextResponse.json({ error: 'Upload failed.' }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from('avatars').getPublicUrl(objectPath);

  const { error: updateErr } = await admin
    .from('profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateErr) {
    console.error('[profile/avatar] profile update failed:', updateErr);
    return NextResponse.json({ error: 'Profile update failed.' }, { status: 500 });
  }

  return NextResponse.json({ url: publicUrl });
}
