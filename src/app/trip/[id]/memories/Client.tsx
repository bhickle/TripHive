'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Share2, Lock, Camera, Download, Heart, MessageCircle, X,
  Filter, MapPin, Calendar, Users, AlertCircle, Pencil, Trash2,
} from 'lucide-react';
import { tripPhotos as mockTripPhotos, itineraryDays as mockItineraryDays, groupMembers as mockGroupMembers, MOCK_TRIP_IDS } from '@/data/mock';
import { Avatar } from '@/components/Avatar';
// IMPORTANT: import the singleton from lib/supabase/client — never call
// createBrowserClient directly. Competing instances fight over the same
// auth Web Lock and routinely lose the session, which made uploads run
// as anonymous and silently fail RLS on the trip_photos insert.
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { ItineraryDay } from '@/lib/types';

// Photo shape used both by the local mock pool and the API response.
// Ordered to match the photo grid + lightbox render needs.
type MemoryPhoto = {
  id: string;
  url: string;
  activity: string;
  uploadedBy: string;
  // uploaderId is the FK reference to profiles. Filtering by id is the
  // source of truth — uploadedBy (name snapshot) can drift if a user
  // renames in Settings, and legacy rows might have stale strings.
  uploaderId?: string | null;
  day: number;
  timestamp: string;
  location?: string;
  // Like + comment counts arrive denormalized on the photo list response
  // so the grid can show counts without a per-photo round-trip. viewerLiked
  // tracks whether the current caller has hearted this photo.
  likeCount?: number;
  commentCount?: number;
  viewerLiked?: boolean;
};

type PhotoComment = {
  id: string;
  body: string;
  authorName: string;
  userId: string;
  createdAt: string;
  // updatedAt is set when the comment was edited; UI shows "(edited)"
  // beside the timestamp when present. Backwards-compat: API may omit
  // these fields for older clients/migrations, so both are optional.
  updatedAt?: string | null;
  edited?: boolean;
};

export default function MemoriesPage({ params }: { params: { id: string } }) {
  const currentUser = useCurrentUser();
  const isMockTrip = MOCK_TRIP_IDS.has(params.id);
  const [tripPhotos, setTripPhotos] = useState<MemoryPhoto[]>(isMockTrip ? (mockTripPhotos as MemoryPhoto[]) : []);
  // itineraryDays drives the day-by-day photo grouping. Real trips load
  // them from /api/trips/[id] (itinerary.days). Without this, real-trip
  // photos never appear because photosByDay is built from itineraryDays.
  const [itineraryDays, setItineraryDays] = useState<ItineraryDay[]>(isMockTrip ? mockItineraryDays : []);
  const [groupMembers, setGroupMembers] = useState<Array<{ id: string; name: string }>>(
    isMockTrip ? mockGroupMembers : []
  );
  const [tripDestinationFromApi, setTripDestinationFromApi] = useState<string | null>(null);

  const [photosLoadError, setPhotosLoadError] = useState(false);
  // Initial-fetch loading state. True until photos + trip + members all
  // resolve (or fail). Used to show a skeleton grid instead of the empty
  // "no photos" state during the first few hundred ms.
  const [photosLoading, setPhotosLoading] = useState(!isMockTrip);

  // Load photos, itinerary, and members from Supabase for real trips
  useEffect(() => {
    if (isMockTrip) return;
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(params.id);
    if (!looksLikeUuid) {
      setPhotosLoading(false);
      return;
    }

    setPhotosLoadError(false);
    Promise.allSettled([
      fetch(`/api/trips/${params.id}/photos`).then(r => r.ok ? r.json() : { __failed: true }),
      fetch(`/api/trips/${params.id}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/trips/${params.id}/members`).then(r => r.ok ? r.json() : null),
    ]).then(([photosRes, tripRes, membersRes]) => {
      if (photosRes.status === 'fulfilled' && photosRes.value?.photos) {
        // Inbound shape from /api/trips/[id]/photos. The endpoint returns
        // url + day + activity + uploadedBy + timestamp; older payloads
        // used caption/uploaderName/dayNumber/createdAt — keep the
        // fallbacks until the API is fully migrated.
        type PhotoApiRow = {
          id: string;
          url: string;
          activity?: string;
          caption?: string;
          uploadedBy?: string;
          uploaderName?: string;
          uploaderId?: string | null;
          day?: number;
          dayNumber?: number;
          timestamp?: string;
          createdAt?: string;
          likeCount?: number;
          commentCount?: number;
          viewerLiked?: boolean;
        };
        const rows: PhotoApiRow[] = photosRes.value.photos;
        setTripPhotos(rows.map(p => ({
          id: p.id,
          url: p.url,
          activity: p.caption || p.activity || 'Photo',
          uploadedBy: p.uploaderName || p.uploadedBy || 'Unknown',
          uploaderId: p.uploaderId ?? null,
          day: p.dayNumber || p.day || 1,
          timestamp: p.createdAt || p.timestamp || new Date().toISOString(),
          likeCount: p.likeCount ?? 0,
          commentCount: p.commentCount ?? 0,
          viewerLiked: !!p.viewerLiked,
        })));
      } else if (photosRes.status === 'rejected' || (photosRes.status === 'fulfilled' && photosRes.value?.__failed)) {
        // Photo fetch failed — surface so the empty grid isn't ambiguous.
        setPhotosLoadError(true);
      }
      if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.destination) {
        setTripDestinationFromApi(tripRes.value.trip.destination);
      }
      if (tripRes.status === 'fulfilled' && Array.isArray(tripRes.value?.itinerary?.days)) {
        setItineraryDays(tripRes.value.itinerary.days);
      }
      if (membersRes.status === 'fulfilled' && Array.isArray(membersRes.value?.members)) {
        const members: { id: string; name: string }[] = membersRes.value.members.map(
          (m: { id: string; name: string }) => ({ id: m.id, name: m.name })
        );
        setGroupMembers(members);
      }
      setPhotosLoading(false);
    });
  }, [isMockTrip, params.id]);

  const [selectedPhoto, setSelectedPhoto] = useState<MemoryPhoto | null>(null);
  // Comments for the currently-open photo modal. Loaded fresh each time
  // the modal opens so we don't keep stale comments around when the user
  // jumps between photos.
  const [photoComments, setPhotoComments] = useState<PhotoComment[]>([]);
  const [photoCommentsLoading, setPhotoCommentsLoading] = useState(false);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // Editing state for the user's own comments. editingCommentId tracks
  // which comment is being edited (null = none); editingDraft holds the
  // in-progress text. Only one comment can be edited at a time.
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  // commentPendingDelete holds the comment a user is being asked to
  // confirm deletion of. Replaces the previous browser confirm() call —
  // jarring vs an in-app modal styled to match the rest of the app.
  const [commentPendingDelete, setCommentPendingDelete] = useState<PhotoComment | null>(null);
  const [deletingComment, setDeletingComment] = useState(false);
  const [filterDay, setFilterDay] = useState<number | null>(null);
  const [filterPerson, setFilterPerson] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [albumShared, setAlbumShared] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadedPhotos, setUploadedPhotos] = useState<Array<{ url: string; name: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [photoLocation, setPhotoLocation] = useState('');
  // Day to tag uploaded photos with. Empty string means "Unsorted" — the
  // photo lands in the All Photos / More Photos bucket instead of being
  // bound to a specific day. Defaults to '' so users have to pick rather
  // than having every photo silently land on Day 1.
  const [photoDay, setPhotoDay] = useState<string>('');
  // Tracks photos that failed to persist to Supabase Storage (or to the
  // trip_photos table). They're still visible locally as blob URLs but will
  // disappear on refresh — surface this to the user instead of swallowing.
  const [uploadFailedCount, setUploadFailedCount] = useState(0);
  // First failed-insert error message captured during the run, so the
  // banner can show "Couldn't save: <reason>" instead of just a count.
  const [uploadErrorDetail, setUploadErrorDetail] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Like + comment handlers (real backend, see /api/.../photos/[photoId]/...) ──
  // Like is a fire-and-forget toggle with optimistic UI; failure rolls
  // back to the prior viewerLiked state. Comments load lazily when the
  // modal opens and post optimistically.
  const togglePhotoLike = async (photo: MemoryPhoto) => {
    if (isMockTrip) return; // mock photos don't have a backing row
    if (likeBusy) return;
    setLikeBusy(true);

    const wasLiked = !!photo.viewerLiked;
    const nextLiked = !wasLiked;
    const delta = nextLiked ? 1 : -1;

    // Optimistic — update both the grid row and the open modal.
    setTripPhotos(prev => prev.map(p =>
      p.id === photo.id
        ? { ...p, viewerLiked: nextLiked, likeCount: Math.max(0, (p.likeCount ?? 0) + delta) }
        : p,
    ));
    setSelectedPhoto(prev => prev && prev.id === photo.id
      ? { ...prev, viewerLiked: nextLiked, likeCount: Math.max(0, (prev.likeCount ?? 0) + delta) }
      : prev,
    );

    try {
      const res = await fetch(`/api/trips/${params.id}/photos/${photo.id}/like`, {
        method: nextLiked ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error(`like ${res.status}`);
      const out = await res.json();
      // Reconcile against the canonical server count — guards against
      // optimistic drift if multiple users are liking the same photo at
      // once. The server is the source of truth for the number.
      setTripPhotos(prev => prev.map(p =>
        p.id === photo.id ? { ...p, viewerLiked: !!out.liked, likeCount: out.count ?? 0 } : p,
      ));
      setSelectedPhoto(prev => prev && prev.id === photo.id
        ? { ...prev, viewerLiked: !!out.liked, likeCount: out.count ?? 0 }
        : prev,
      );
    } catch (err) {
      console.error('[memories] like toggle failed:', err);
      // Roll back to the pre-toggle state on failure.
      setTripPhotos(prev => prev.map(p =>
        p.id === photo.id
          ? { ...p, viewerLiked: wasLiked, likeCount: Math.max(0, (p.likeCount ?? 0) - delta) }
          : p,
      ));
      setSelectedPhoto(prev => prev && prev.id === photo.id
        ? { ...prev, viewerLiked: wasLiked, likeCount: Math.max(0, (prev.likeCount ?? 0) - delta) }
        : prev,
      );
    } finally {
      setLikeBusy(false);
    }
  };

  // When the photo modal opens, fetch the full comment thread.
  useEffect(() => {
    if (!selectedPhoto || isMockTrip) {
      setPhotoComments([]);
      return;
    }
    let cancelled = false;
    setPhotoCommentsLoading(true);
    fetch(`/api/trips/${params.id}/photos/${selectedPhoto.id}/comments`)
      .then(r => r.ok ? r.json() : { comments: [] })
      .then(data => {
        if (cancelled) return;
        setPhotoComments(Array.isArray(data?.comments) ? data.comments : []);
      })
      .catch(() => { if (!cancelled) setPhotoComments([]); })
      .finally(() => { if (!cancelled) setPhotoCommentsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedPhoto, params.id, isMockTrip]);

  const submitPhotoComment = async () => {
    if (!selectedPhoto || isMockTrip) return;
    const trimmed = newCommentBody.trim();
    if (!trimmed || postingComment) return;
    if (trimmed.length > 500) return;
    setPostingComment(true);
    // Optimistic insert with a temp id so the row appears immediately
    // and gets reconciled against the saved row on success.
    const tempId = `temp_${Date.now()}`;
    const optimistic: PhotoComment = {
      id: tempId,
      body: trimmed,
      authorName: currentUser?.name ?? 'You',
      userId: currentUser?.id ?? 'me',
      createdAt: new Date().toISOString(),
    };
    setPhotoComments(prev => [...prev, optimistic]);
    setNewCommentBody('');
    // Bump the comment count on the photo card so the grid reflects the
    // new state without waiting for the next /photos refetch.
    setTripPhotos(prev => prev.map(p =>
      p.id === selectedPhoto.id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p,
    ));
    setSelectedPhoto(prev => prev && prev.id === selectedPhoto.id
      ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 }
      : prev,
    );
    try {
      const res = await fetch(`/api/trips/${params.id}/photos/${selectedPhoto.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) throw new Error(`comment ${res.status}`);
      const out = await res.json();
      if (out?.comment) {
        setPhotoComments(prev => prev.map(c => c.id === tempId ? out.comment : c));
      }
    } catch (err) {
      console.error('[memories] comment post failed:', err);
      // Roll back the optimistic row + count.
      setPhotoComments(prev => prev.filter(c => c.id !== tempId));
      setNewCommentBody(trimmed);
      setTripPhotos(prev => prev.map(p =>
        p.id === selectedPhoto.id ? { ...p, commentCount: Math.max(0, (p.commentCount ?? 0) - 1) } : p,
      ));
      setSelectedPhoto(prev => prev && prev.id === selectedPhoto.id
        ? { ...prev, commentCount: Math.max(0, (prev.commentCount ?? 0) - 1) }
        : prev,
      );
    } finally {
      setPostingComment(false);
    }
  };

  // Realtime: while a photo modal is open, subscribe to that photo's
  // comments + likes so cross-user changes (someone else commenting,
  // liking, editing, deleting) propagate live without refresh. We
  // intentionally only subscribe for the open photo to avoid maintaining
  // N concurrent channels for the whole gallery; on modal close the
  // useEffect cleanup tears it down.
  useEffect(() => {
    if (!selectedPhoto || isMockTrip) return;
    const photoId = selectedPhoto.id;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`photo:${photoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photo_comments', filter: `photo_id=eq.${photoId}` },
        (payload) => {
          const row = payload.new as { id: string; body: string; author_name: string | null; user_id: string; created_at: string; updated_at: string | null };
          if (!row?.id) return;
          setPhotoComments(prev => {
            // Skip if we already have this id (covers the optimistic-then-
            // server-confirm case where our own POST already replaced
            // the temp id).
            if (prev.some(c => c.id === row.id)) return prev;
            return [...prev, {
              id: row.id,
              body: row.body,
              authorName: row.author_name ?? 'Unknown',
              userId: row.user_id,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              edited: !!row.updated_at,
            }];
          });
          setTripPhotos(prev => prev.map(p =>
            p.id === photoId ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p,
          ));
          setSelectedPhoto(prev => prev && prev.id === photoId
            ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 }
            : prev,
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'photo_comments', filter: `photo_id=eq.${photoId}` },
        (payload) => {
          const row = payload.new as { id: string; body: string; updated_at: string | null };
          setPhotoComments(prev => prev.map(c => c.id === row.id
            ? { ...c, body: row.body, updatedAt: row.updated_at, edited: !!row.updated_at }
            : c,
          ));
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photo_comments', filter: `photo_id=eq.${photoId}` },
        (payload) => {
          const row = payload.old as { id: string };
          setPhotoComments(prev => {
            if (!prev.some(c => c.id === row.id)) return prev;
            return prev.filter(c => c.id !== row.id);
          });
          setTripPhotos(prev => prev.map(p =>
            p.id === photoId ? { ...p, commentCount: Math.max(0, (p.commentCount ?? 0) - 1) } : p,
          ));
          setSelectedPhoto(prev => prev && prev.id === photoId
            ? { ...prev, commentCount: Math.max(0, (prev.commentCount ?? 0) - 1) }
            : prev,
          );
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photo_likes', filter: `photo_id=eq.${photoId}` },
        () => {
          // Targeted /stats fetch instead of the full /photos list — for
          // a 100-photo album that's a 100x reduction in payload per
          // like change. Three small COUNT queries, no payload of photo
          // rows.
          fetch(`/api/trips/${params.id}/photos/${photoId}/stats`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (!data || typeof data.likeCount !== 'number') return;
              setTripPhotos(prev => prev.map(p =>
                p.id === photoId
                  ? { ...p, likeCount: data.likeCount, viewerLiked: !!data.viewerLiked }
                  : p,
              ));
              setSelectedPhoto(prev => prev && prev.id === photoId
                ? { ...prev, likeCount: data.likeCount, viewerLiked: !!data.viewerLiked }
                : prev,
              );
            })
            .catch(() => { /* swallow — realtime is best-effort */ });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedPhoto, params.id, isMockTrip]);

  const startEditComment = (c: PhotoComment) => {
    setEditingCommentId(c.id);
    setEditingDraft(c.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingDraft('');
  };

  const submitEditComment = async () => {
    if (!selectedPhoto || !editingCommentId) return;
    const trimmed = editingDraft.trim();
    if (!trimmed || editBusy) return;
    if (trimmed.length > 500) return;

    const original = photoComments.find(c => c.id === editingCommentId);
    if (!original || original.body === trimmed) {
      // No-op: same text → just close the editor
      cancelEditComment();
      return;
    }

    setEditBusy(true);
    // Optimistic in-place update
    setPhotoComments(prev => prev.map(c => c.id === editingCommentId
      ? { ...c, body: trimmed, updatedAt: new Date().toISOString(), edited: true }
      : c,
    ));
    setEditingCommentId(null);
    setEditingDraft('');
    try {
      const res = await fetch(`/api/trips/${params.id}/photos/${selectedPhoto.id}/comments/${original.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) throw new Error(`edit ${res.status}`);
      const out = await res.json();
      if (out?.comment) {
        setPhotoComments(prev => prev.map(c => c.id === out.comment.id ? out.comment : c));
      }
    } catch (err) {
      console.error('[memories] comment edit failed:', err);
      // Roll back to the original body on failure.
      setPhotoComments(prev => prev.map(c => c.id === original.id ? original : c));
    } finally {
      setEditBusy(false);
    }
  };

  // Two-step delete: clicking trash sets commentPendingDelete; the modal
  // calls confirmDeletePhotoComment when the user confirms. The
  // in-progress flag gates the button so a double-click can't fire
  // duplicate DELETEs.
  const requestDeletePhotoComment = (c: PhotoComment) => {
    if (!selectedPhoto || isMockTrip) return;
    setCommentPendingDelete(c);
  };

  const confirmDeletePhotoComment = async () => {
    const c = commentPendingDelete;
    if (!selectedPhoto || isMockTrip || !c) return;
    setDeletingComment(true);
    // Optimistic remove + count decrement.
    const prevComments = photoComments;
    setPhotoComments(prev => prev.filter(x => x.id !== c.id));
    setTripPhotos(prev => prev.map(p =>
      p.id === selectedPhoto.id ? { ...p, commentCount: Math.max(0, (p.commentCount ?? 0) - 1) } : p,
    ));
    setSelectedPhoto(prev => prev && prev.id === selectedPhoto.id
      ? { ...prev, commentCount: Math.max(0, (prev.commentCount ?? 0) - 1) }
      : prev,
    );
    try {
      const res = await fetch(`/api/trips/${params.id}/photos/${selectedPhoto.id}/comments/${c.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`delete ${res.status}`);
      setCommentPendingDelete(null);
    } catch (err) {
      console.error('[memories] comment delete failed:', err);
      // Roll back on failure; surface so the user knows it didn't take.
      setPhotoComments(prevComments);
      setTripPhotos(prev => prev.map(p =>
        p.id === selectedPhoto.id ? { ...p, commentCount: (p.commentCount ?? 0) + 1 } : p,
      ));
      setSelectedPhoto(prev => prev && prev.id === selectedPhoto.id
        ? { ...prev, commentCount: (prev.commentCount ?? 0) + 1 }
        : prev,
      );
    } finally {
      setDeletingComment(false);
    }
  };

  const tripDestination = isMockTrip ? 'Iceland' : (tripDestinationFromApi ?? 'your trip');
  // filterPerson holds either a uuid (preferred — real trip member id) or
  // a literal display string (legacy + mock trips that don't have
  // uploader_id). The id-form is the source of truth and avoids the
  // "Mallory" vs "You" mismatch where the same person showed up under
  // two different names depending on whether they had a profile name
  // saved at upload time.
  const filterIsUuid = !!filterPerson && /^[0-9a-f-]{36}$/i.test(filterPerson);
  const filteredPhotos = tripPhotos.filter(photo => {
    if (filterDay && photo.day !== filterDay) return false;
    if (filterPerson) {
      if (filterIsUuid) {
        if (photo.uploaderId !== filterPerson) return false;
      } else if (photo.uploadedBy !== filterPerson) return false;
    }
    return true;
  });

  const photosByDay = itineraryDays.map(day => ({
    day: day.day,
    date: day.date,
    theme: day.theme,
    photos: filteredPhotos.filter(p => p.day === day.day),
  })).filter(d => d.photos.length > 0);

  // Photos that don't match any itinerary day (e.g. uploaded with a day
  // number that's been deleted, or a trip with no itinerary at all). Without
  // this fallback, real-trip photos with default day=1 against an empty
  // itineraryDays array would render nothing.
  const ungroupedPhotos = filteredPhotos.filter(
    p => !itineraryDays.some(d => d.day === p.day)
  );

  const totalPhotos = tripPhotos.length;
  const totalDays = itineraryDays.length;
  const totalParticipants = groupMembers.length;
  // Build the photographer dropdown from unique uploaders. When a photo
  // carries a real uploader_id (uuid), we group it under that id and
  // show the live name from groupMembers — so renaming in Settings
  // flows through, and "Mallory" + "You" don't show up as two entries
  // for the same person. Photos without an id fall back to their
  // snapshotted name.
  const uniqueUploaders = (() => {
    const memberById = new Map(groupMembers.map(m => [m.id, m.name]));
    const byId: Map<string, { value: string; label: string }> = new Map();
    const looseNames = new Set<string>();
    for (const p of tripPhotos) {
      if (p.uploaderId) {
        if (!byId.has(p.uploaderId)) {
          byId.set(p.uploaderId, {
            value: p.uploaderId,
            label: memberById.get(p.uploaderId) ?? p.uploadedBy ?? 'Unknown',
          });
        }
      } else if (p.uploadedBy) {
        looseNames.add(p.uploadedBy);
      }
    }
    return [
      ...Array.from(byId.values()),
      ...Array.from(looseNames).map(name => ({ value: name, label: name })),
    ];
  })();

  return (
    <main className="min-h-screen bg-parchment">
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-script italic font-semibold text-zinc-900 mb-2">The Pics</h1>
          <p className="text-zinc-600">
            {tripDestination === 'your trip'
              ? 'Adventure captured in photos'
              : `Your ${tripDestination} adventure through photos`}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-ocean-50 to-ocean-100 rounded-lg p-6 border border-sky-200">
            <Camera className="w-8 h-8 text-sky-700 mb-2" />
            <p className="text-xs font-semibold text-sky-900 uppercase">Total Photos</p>
            <p className="text-3xl font-bold text-sky-800 mt-1">{totalPhotos}</p>
          </div>

          <div className="bg-gradient-to-br from-earth-50 to-earth-100 rounded-lg p-6 border border-stone-200">
            <Calendar className="w-8 h-8 text-stone-700 mb-2" />
            <p className="text-xs font-semibold text-stone-900 uppercase">Days</p>
            <p className="text-3xl font-bold text-stone-700 mt-1">{totalDays}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
            <Users className="w-8 h-8 text-purple-600 mb-2" />
            <p className="text-xs font-semibold text-purple-900 uppercase">Contributors</p>
            <p className="text-3xl font-bold text-purple-700 mt-1">{uniqueUploaders.length}</p>
          </div>

          <button
            onClick={() => {
              setShareMode(!shareMode);
              if (shareMode) {
                setAlbumShared(true);
                setTimeout(() => setAlbumShared(false), 3000);
              }
            }}
            className={`rounded-lg p-6 hover:shadow-lg transition-all flex flex-col items-start justify-between border ${
              albumShared
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-gradient-to-br from-sky-50 to-sky-100 border-sky-200 text-sky-800'
            }`}
          >
            <Share2 className="w-8 h-8 mb-2" />
            <p className="text-sm font-semibold">{albumShared ? '✓ Shared!' : 'Share Album'}</p>
          </button>
        </div>

        {shareMode && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-script italic text-lg font-semibold text-zinc-900">Share Album</h3>
              <button onClick={() => setShareMode(false)}>
                <X className="w-5 h-5 text-zinc-400 hover:text-zinc-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="radio"
                    checked={!isPublic}
                    onChange={() => setIsPublic(false)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-zinc-900">Private</p>
                    <p className="text-sm text-zinc-500">Only group members can view</p>
                  </div>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="radio"
                    checked={isPublic}
                    onChange={() => setIsPublic(true)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-zinc-900">Public Link</p>
                    <p className="text-sm text-zinc-500">Anyone with the link can view</p>
                  </div>
                </label>
              </div>

            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-zinc-600 mb-2">Share Link</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/trip/${params.id}/memories`}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-sm text-zinc-900"
                />
                <button
                  onClick={() => {
                    const origin = typeof window !== 'undefined' ? window.location.origin : '';
                    navigator.clipboard.writeText(`${origin}/trip/${params.id}/memories`);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  className={`px-4 py-2 rounded font-medium transition-all ${
                    linkCopied
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-sky-800 text-white hover:bg-sky-900'
                  }`}
                >
                  {linkCopied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">The album is only visible to group members who are signed in.</p>
            </div>
          </div>
        )}

        {/* Hidden file input — triggered by Upload Photos button */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            setIsUploading(true);
            setUploadProgress(0);
            setUploadFailedCount(0);
            setUploadErrorDetail(null);

            const fileArray = Array.from(files);
            // Count storage / DB failures so we can show a banner at the end
            // instead of silently dropping photos that only exist as blob URLs
            // and will vanish on refresh.
            let failedCount = 0;

            // Create blob URLs once per file and reuse across both state slices
            const blobEntries = fileArray.map((file, i) => ({
              id: `local_${Date.now()}_${i}`,
              blobUrl: URL.createObjectURL(file),
              name: file.name,
              activity: file.name.replace(/\.[^.]+$/, ''),
            }));

            // Show local preview immediately so the user sees their photos right away
            const localPreviews = blobEntries.map(e => ({ url: e.blobUrl, name: e.name }));
            setUploadedPhotos(prev => [...prev, ...localPreviews]);
            setUploadedCount(prev => prev + fileArray.length);

            // Resolve the uploader's display name. Falls back to email
            // local-part rather than the literal "You" — the previous
            // fallback meant photos showed "You" for everyone in the
            // group, and the photographer filter listed "You" as a
            // person. uploaded_by carries the real user_id either way,
            // and the GET endpoint uses that as the authoritative
            // attribution; this string is just a snapshot for legacy
            // rows and offline display.
            const uploaderName = (!currentUser.isLoading && currentUser.name && currentUser.name !== 'Traveler')
              ? currentUser.name
              : (currentUser.email?.split('@')[0] ?? 'A traveler');

            // Capture the selected day at the start of this batch so a
            // later state change doesn't reassign mid-upload. Empty string
            // → null (unsorted bucket).
            const dayNumber = photoDay ? parseInt(photoDay, 10) : null;

            // Also push into tripPhotos so totalPhotos and uniqueUploaders recompute immediately
            const newPhotoEntries = blobEntries.map(e => ({
              id: e.id,
              url: e.blobUrl,
              activity: photoLocation.trim() || e.activity,
              uploadedBy: uploaderName,
              day: dayNumber ?? 0,
              timestamp: new Date().toISOString(),
              location: photoLocation.trim() || undefined,
            }));
            setTripPhotos(prev => [...prev, ...newPhotoEntries]);

            // Try Supabase upload in background (non-mock trips only).
            // Uses the app-wide singleton so the auth session is shared with
            // every other call — without this, RLS rejects the insert.
            if (!isMockTrip) {
              const supabase = createSupabaseBrowserClient();
              {
                for (let i = 0; i < fileArray.length; i++) {
                  const file = fileArray[i];
                  // Simulate smooth per-file progress with a ticker so the bar
                  // visibly advances even for large single-file uploads where the
                  // Supabase client doesn't expose upload progress events.
                  const fileStart = Math.round((i / fileArray.length) * 100);
                  const fileEnd = Math.round(((i + 1) / fileArray.length) * 100);
                  setUploadProgress(fileStart);
                  // Ticker: advance from fileStart to ~90% of the file's share while waiting
                  const fileRange = fileEnd - fileStart;
                  const tickTarget = fileStart + Math.round(fileRange * 0.88);
                  const ticker = setInterval(() => {
                    setUploadProgress(prev => {
                      if (prev >= tickTarget) { clearInterval(ticker); return prev; }
                      return Math.min(prev + 1, tickTarget);
                    });
                  }, 60);
                  try {
                    const timestamp = Date.now() + i;
                    const path = `${params.id}/${timestamp}-${file.name}`;
                    const { error: uploadError, data } = await supabase.storage
                      .from('trip-photos')
                      .upload(path, file, { upsert: true });
                    clearInterval(ticker);
                    if (uploadError || !data) {
                      console.error('[memories] storage upload failed:', file.name, uploadError);
                      if (!uploadErrorDetail) setUploadErrorDetail(uploadError?.message ?? 'Storage upload failed');
                      failedCount++;
                      setUploadProgress(fileEnd);
                      continue;
                    }
                    const { data: urlData } = supabase.storage.from('trip-photos').getPublicUrl(path);
                    if (!urlData?.publicUrl) {
                      console.error('[memories] no public URL for', file.name);
                      if (!uploadErrorDetail) setUploadErrorDetail('Upload succeeded but the photo has no public URL.');
                      failedCount++;
                      setUploadProgress(fileEnd);
                      continue;
                    }

                    // Insert the trip_photos row BEFORE swapping the blob URL.
                    // If the insert fails (RLS, schema, missing trip_id, etc.)
                    // we delete the storage object to avoid orphan files and
                    // surface the actual error to the user — the previous
                    // console.warn-and-continue pattern silently dropped
                    // every upload to the empty trip_photos table.
                    const { error: insertError } = await supabase.from('trip_photos').insert({
                      trip_id: params.id,
                      storage_path: path,
                      public_url: urlData.publicUrl,
                      uploader_name: uploaderName,
                      uploaded_by: currentUser.id ?? null,
                      day_number: dayNumber,
                      caption: photoLocation.trim() || null,
                    });
                    if (insertError) {
                      console.error('[memories] trip_photos insert failed:', insertError);
                      if (!uploadErrorDetail) setUploadErrorDetail(`${insertError.message}${insertError.code ? ` (${insertError.code})` : ''}`);
                      failedCount++;
                      // Best-effort orphan cleanup. If this fails too, log it
                      // — we don't want to mask the real (insert) error.
                      const { error: cleanupErr } = await supabase.storage.from('trip-photos').remove([path]);
                      if (cleanupErr) console.error('[memories] storage cleanup also failed:', path, cleanupErr);
                      setUploadProgress(fileEnd);
                      continue;
                    }

                    // Insert succeeded — pre-load the Supabase URL before
                    // swapping it into state. Without this, the <img> src
                    // change forced a reload and the parent's bg-slate-200
                    // briefly showed through, which read as "the photo
                    // shrunk for a second" to users on slower connections.
                    //
                    // Wrapped in a 5s timeout race because img.onload/onerror
                    // can silently never fire on rare browser/cache states —
                    // when that happened, this await hung forever and the
                    // upload progress bar froze at the 88% tickTarget.
                    await Promise.race<void>([
                      new Promise<void>(resolve => {
                        const img = new window.Image();
                        const finish = () => resolve();
                        img.onload = finish;
                        img.onerror = finish;
                        img.src = urlData.publicUrl;
                      }),
                      new Promise<void>(resolve => setTimeout(resolve, 5000)),
                    ]);

                    // Now swap the blob URL for the Supabase URL, in both state slices.
                    setUploadedPhotos(prev => {
                      const updated = [...prev];
                      const localIdx = updated.findIndex(p => p.name === file.name && p.url.startsWith('blob:'));
                      if (localIdx >= 0) {
                        URL.revokeObjectURL(updated[localIdx].url);
                        updated[localIdx] = { url: urlData.publicUrl, name: file.name };
                      }
                      return updated;
                    });
                    setTripPhotos(prev => prev.map(p =>
                      p.url.startsWith('blob:') && p.activity === (photoLocation.trim() || file.name.replace(/\.[^.]+$/, ''))
                        ? { ...p, url: urlData.publicUrl }
                        : p
                    ));
                    setUploadProgress(fileEnd);
                  } catch (err) {
                    clearInterval(ticker);
                    console.error('[memories] upload threw:', file.name, err);
                    if (!uploadErrorDetail) setUploadErrorDetail(err instanceof Error ? err.message : 'Unexpected upload error');
                    failedCount++;
                    setUploadProgress(fileEnd);
                  }
                }
              }
            }

            setUploadProgress(100);
            setIsUploading(false);
            if (failedCount > 0) setUploadFailedCount(failedCount);
            e.target.value = '';
          }}
        />
        <div className="mb-8">
          {/* Day + location selectors render ABOVE the upload button and are
              both required. Without this gate, photos missing day/location
              defaulted to Day 1 and labeled "Photo" — surfacing as untagged
              entries in the gallery. Forcing selection up-front guarantees
              every uploaded photo has both fields set. */}
          <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Which day? <span className="text-rose-500 normal-case font-normal">*</span>
              </label>
              <select
                value={photoDay}
                onChange={e => setPhotoDay(e.target.value)}
                disabled={isUploading}
                className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:bg-zinc-50"
              >
                <option value="" disabled>Select a day…</option>
                {itineraryDays.map(d => (
                  <option key={d.day} value={d.day}>
                    Day {d.day}{d.theme ? ` — ${d.theme}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Location <span className="text-rose-500 normal-case font-normal">*</span>
              </label>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-zinc-400 shrink-0" />
                <input
                  type="text"
                  placeholder="e.g. Blue Lagoon"
                  value={photoLocation}
                  onChange={e => setPhotoLocation(e.target.value)}
                  disabled={isUploading}
                  className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 bg-white disabled:bg-zinc-50"
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={isUploading || !photoDay || !photoLocation.trim()}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-sky-800 to-green-800 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={!photoDay || !photoLocation.trim() ? 'Pick a day and add a location first' : undefined}
          >
            <Camera className="w-5 h-5" />
            {isUploading
              ? `Uploading... ${uploadProgress}%`
              : !photoDay || !photoLocation.trim()
                ? 'Pick a day & location first'
                : uploadedCount > 0
                  ? `${uploadedCount} photo${uploadedCount !== 1 ? 's' : ''} added — upload more`
                  : 'Upload Photos'}
          </button>

          {/* Inline upload-state banners. These used to live in the Trip
              Recap section at the bottom of the page; that section was
              removed (the AI-recap feature it implied isn't built), so the
              banners are now adjacent to the upload action that creates
              them. Surfaces failures + load errors right where the user
              is looking after they hit the button. */}
          {uploadFailedCount > 0 && (
            <div className="mt-4 flex items-start gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
              <div className="text-xs text-rose-700 space-y-1">
                <p>
                  {uploadFailedCount} photo{uploadFailedCount !== 1 ? 's' : ''} couldn&apos;t finish uploading. {uploadFailedCount !== 1 ? 'They\'re' : 'It\'s'} visible here for now but will be lost on refresh — please try again.
                </p>
                {uploadErrorDetail && (
                  <p className="text-rose-800 font-medium">Reason: {uploadErrorDetail}</p>
                )}
              </div>
            </div>
          )}
          {photosLoadError && (
            <div className="mt-4 flex items-start justify-between gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs text-amber-900">
                We couldn&apos;t load your saved photos. New uploads will still work.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-xs font-medium text-amber-900 underline hover:text-amber-700 whitespace-nowrap"
              >
                Retry
              </button>
            </div>
          )}

          {uploadedPhotos.length > 0 && (
            <div className="mt-6">
              <h3 className="font-script italic text-lg font-semibold text-zinc-900 mb-4">Uploaded Photos</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {uploadedPhotos.map((photo, idx) => (
                  <div key={idx} className="relative overflow-hidden rounded-lg shadow-md bg-slate-200 aspect-square">
                    {/* Use native img to support both blob: preview URLs and Supabase public URLs */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-script italic text-lg font-semibold text-zinc-900 flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filter Photos
            </h3>
            {(filterDay || filterPerson) && (
              <button
                onClick={() => {
                  setFilterDay(null);
                  setFilterPerson(null);
                }}
                className="text-sm text-sky-700 hover:text-sky-800 font-medium"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-900 mb-2">By Day</label>
              <select
                value={filterDay || ''}
                onChange={(e) => setFilterDay(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
              >
                <option value="">All Days</option>
                {itineraryDays.map(day => (
                  <option key={day.day} value={day.day}>
                    Day {day.day} — {day.theme}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-900 mb-2">By Photographer</label>
              <select
                value={filterPerson || ''}
                onChange={(e) => setFilterPerson(e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
              >
                <option value="">All Contributors</option>
                {uniqueUploaders.map(u => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading skeleton — shown only on first load for real trips */}
        {photosLoading && tripPhotos.length === 0 && (
          <div className="mb-12">
            <div className="mb-6 space-y-2">
              <div className="h-6 w-56 bg-zinc-200 rounded animate-pulse" />
              <div className="h-3 w-32 bg-zinc-100 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <div key={i} className="aspect-square rounded-lg bg-zinc-200 animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {/* Empty state — done loading, no photos uploaded yet */}
        {!photosLoading && !photosLoadError && tripPhotos.length === 0 && !isMockTrip && (
          <div className="text-center py-16 bg-white rounded-2xl border border-zinc-100">
            <Camera className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-2">No photos yet</h3>
            <p className="text-zinc-600 text-sm">Upload some above to start your trip album.</p>
          </div>
        )}

        {/* Photos that don't fall under any itinerary day — surface them
            in their own bucket so they aren't silently dropped. */}
        {ungroupedPhotos.length > 0 && (
          <div className="mb-12">
            <div className="mb-6">
              <h2 className="text-2xl font-script italic font-semibold text-zinc-900">
                {photosByDay.length > 0 ? 'More Photos' : 'All Photos'}
              </h2>
              <p className="text-zinc-600 text-sm">
                {ungroupedPhotos.length} photo{ungroupedPhotos.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {ungroupedPhotos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-all group cursor-pointer bg-slate-200 aspect-square"
                >
                  <Image
                    src={photo.url}
                    alt={photo.activity}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white opacity-0 group-hover:opacity-100 transition-all">
                    <p className="text-sm font-semibold">{photo.activity}</p>
                    <p className="text-xs text-gray-200">by {photo.uploadedBy}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {photosByDay.map(dayGroup => (
          <div key={dayGroup.day} className="mb-12">
            <div className="mb-6">
              <h2 className="text-2xl font-script italic font-semibold text-zinc-900">
                Day {dayGroup.day} — {dayGroup.theme}
              </h2>
              <p className="text-zinc-600 text-sm">
                {new Date(dayGroup.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {dayGroup.photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="relative overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-all group cursor-pointer bg-slate-200 aspect-square"
                >
                  <Image
                    src={photo.url}
                    alt={photo.activity}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all" />
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white opacity-0 group-hover:opacity-100 transition-all">
                    <p className="text-sm font-semibold">{photo.activity}</p>
                    <p className="text-xs text-gray-200">by {photo.uploadedBy}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

      </div>

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-10 p-2 bg-white rounded-lg shadow-md hover:bg-slate-50"
            >
              <X className="w-6 h-6 text-zinc-600" />
            </button>

            <div className="relative w-full aspect-video bg-slate-200">
              <Image
                src={selectedPhoto.url}
                alt={selectedPhoto.activity}
                fill
                className="object-cover"
              />
            </div>

            <div className="p-6">
              <h3 className="text-2xl font-bold text-zinc-900 mb-4">{selectedPhoto.activity}</h3>

              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-200">
                <Avatar
                  name={selectedPhoto.uploadedBy}
                  size="md"
                />
                <div className="flex-1">
                  <p className="font-medium text-zinc-900">{selectedPhoto.uploadedBy}</p>
                  <p className="text-sm text-zinc-500">
                    {new Date(selectedPhoto.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at{' '}
                    {new Date(selectedPhoto.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                  {(selectedPhoto.location || selectedPhoto.activity) && selectedPhoto.activity !== 'Photo' && (
                    <p className="text-sm text-zinc-600 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                      {selectedPhoto.location || selectedPhoto.activity}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => togglePhotoLike(selectedPhoto)}
                  disabled={likeBusy || isMockTrip}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all ${
                    selectedPhoto.viewerLiked
                      ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                      : 'border border-slate-300 text-zinc-700 hover:bg-slate-50'
                  } disabled:opacity-50`}
                  title={isMockTrip ? 'Likes are not available on demo photos' : undefined}
                >
                  <Heart className={`w-5 h-5 ${selectedPhoto.viewerLiked ? 'fill-current' : ''}`} />
                  {selectedPhoto.viewerLiked ? 'Liked' : 'Like'}
                  {(selectedPhoto.likeCount ?? 0) > 0 && (
                    <span className="text-zinc-400 font-normal">· {selectedPhoto.likeCount}</span>
                  )}
                </button>
                <a
                  href={selectedPhoto.url}
                  download={`tripcoord-${selectedPhoto.id ?? 'photo'}.jpg`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all text-zinc-700"
                >
                  <Download className="w-5 h-5" />
                  Download
                </a>
              </div>

              {/* Inline comment thread. Lives inside the modal scroll
                  container (max-h-[90vh] overflow-y-auto on the parent),
                  so a long thread scrolls naturally without a nested
                  scrollbar. Mock trips skip rendering since there's no
                  backend row to attach comments to. */}
              {!isMockTrip && (
                <div className="mt-6 pt-5 border-t border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-4 h-4 text-zinc-500" />
                    <p className="text-sm font-semibold text-zinc-700">
                      Comments
                      {(selectedPhoto.commentCount ?? 0) > 0 && (
                        <span className="text-zinc-400 font-normal"> · {selectedPhoto.commentCount}</span>
                      )}
                    </p>
                  </div>
                  {photoCommentsLoading ? (
                    <p className="text-xs text-zinc-400 italic mb-3">Loading…</p>
                  ) : photoComments.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic mb-3">No comments yet — be the first.</p>
                  ) : (
                    <div className="space-y-3 mb-3">
                      {photoComments.map(c => {
                        const isOwn = !!currentUser?.id && c.userId === currentUser.id;
                        const isEditing = editingCommentId === c.id;
                        return (
                          <div key={c.id} className="flex items-start gap-3 group">
                            <Avatar name={c.authorName} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-zinc-800 truncate">{c.authorName}</p>
                                <p className="text-[11px] text-zinc-400">
                                  {new Date(c.createdAt).toLocaleString()}
                                  {c.edited && <span className="ml-1 italic">(edited)</span>}
                                </p>
                              </div>
                              {isEditing ? (
                                <form
                                  onSubmit={e => { e.preventDefault(); submitEditComment(); }}
                                  className="mt-1 flex flex-col gap-2"
                                >
                                  <textarea
                                    value={editingDraft}
                                    onChange={e => setEditingDraft(e.target.value)}
                                    maxLength={500}
                                    autoFocus
                                    rows={2}
                                    disabled={editBusy}
                                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:bg-zinc-50 resize-none"
                                  />
                                  {editingDraft.length > 400 && (
                                    <p className={`text-[11px] text-right ${editingDraft.length >= 500 ? 'text-rose-600 font-semibold' : 'text-zinc-400'}`}>
                                      {editingDraft.length}/500
                                    </p>
                                  )}
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      type="button"
                                      onClick={cancelEditComment}
                                      disabled={editBusy}
                                      className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="submit"
                                      disabled={editBusy || !editingDraft.trim()}
                                      className="px-3 py-1.5 text-xs font-semibold bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white rounded-lg transition-colors"
                                    >
                                      {editBusy ? 'Saving…' : 'Save'}
                                    </button>
                                  </div>
                                </form>
                              ) : (
                                <p className="text-sm text-zinc-700 break-words whitespace-pre-wrap">{c.body}</p>
                              )}
                            </div>
                            {isOwn && !isEditing && (
                              // Always-visible on touch widths (sm:hidden
                              // would invert this), revealed on hover at
                              // sm+ where pointer-fine devices can use the
                              // group-hover pattern. focus-within keeps it
                              // visible during keyboard nav.
                              <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                  onClick={() => startEditComment(c)}
                                  title="Edit comment"
                                  aria-label="Edit comment"
                                  className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => requestDeletePhotoComment(c)}
                                  title="Delete comment"
                                  aria-label="Delete comment"
                                  className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <form
                    onSubmit={e => { e.preventDefault(); submitPhotoComment(); }}
                    className="flex flex-col gap-1"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newCommentBody}
                        onChange={e => setNewCommentBody(e.target.value)}
                        placeholder="Add a comment…"
                        maxLength={500}
                        disabled={postingComment}
                        className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:bg-zinc-50"
                      />
                      <button
                        type="submit"
                        disabled={!newCommentBody.trim() || postingComment}
                        className="px-4 py-2 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {postingComment ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                    {/* Character counter only when the user is at/near the
                        500 limit — avoids visual clutter on every blank
                        compose box. */}
                    {newCommentBody.length > 400 && (
                      <p className={`text-[11px] text-right ${newCommentBody.length >= 500 ? 'text-rose-600 font-semibold' : 'text-zinc-400'}`}>
                        {newCommentBody.length}/500
                      </p>
                    )}
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comment delete confirmation. Replaces the previous browser
          confirm() — same intent (gate destructive action) but rendered
          inline so it picks up the rest of the app's typography +
          spacing rather than a system dialog that breaks visual flow. */}
      {commentPendingDelete && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => { if (!deletingComment) setCommentPendingDelete(null); }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Delete this comment?</h3>
            <p className="text-sm text-zinc-600 mb-5">
              Your comment will be removed for everyone on the trip. This can&apos;t be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCommentPendingDelete(null)}
                disabled={deletingComment}
                className="px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePhotoComment}
                disabled={deletingComment}
                className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 disabled:bg-zinc-300 text-white rounded-lg transition-colors"
              >
                {deletingComment ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
