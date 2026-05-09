'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Share2, Lock, Camera, Download, Heart, MessageCircle, X,
  Filter, MapPin, Calendar, Users, AlertCircle,
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
  day: number;
  timestamp: string;
  location?: string;
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
          day?: number;
          dayNumber?: number;
          timestamp?: string;
          createdAt?: string;
        };
        const rows: PhotoApiRow[] = photosRes.value.photos;
        setTripPhotos(rows.map(p => ({
          id: p.id,
          url: p.url,
          activity: p.caption || p.activity || 'Photo',
          uploadedBy: p.uploaderName || p.uploadedBy || 'You',
          day: p.dayNumber || p.day || 1,
          timestamp: p.createdAt || p.timestamp || new Date().toISOString(),
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

  const tripDestination = isMockTrip ? 'Iceland' : (tripDestinationFromApi ?? 'your trip');
  const filteredPhotos = tripPhotos.filter(photo => {
    if (filterDay && photo.day !== filterDay) return false;
    if (filterPerson && photo.uploadedBy !== filterPerson) return false;
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
  const uniqueUploaders = Array.from(new Set(tripPhotos.map(p => p.uploadedBy)));

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

            // Use real user name if available, fallback to 'You'
            const uploaderName = (!currentUser.isLoading && currentUser.name && currentUser.name !== 'Traveler')
              ? currentUser.name
              : 'You';

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
                    await new Promise<void>(resolve => {
                      const img = new window.Image();
                      const finish = () => resolve();
                      img.onload = finish;
                      img.onerror = finish; // proceed anyway — at worst the user sees the original loader
                      img.src = urlData.publicUrl;
                    });

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
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-sky-800 to-green-800 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
          >
            <Camera className="w-5 h-5" />
            {isUploading ? `Uploading... ${uploadProgress}%` : uploadedCount > 0 ? `${uploadedCount} photo${uploadedCount !== 1 ? 's' : ''} added — upload more` : 'Upload Photos'}
          </button>

          {/* Day + location selectors. Both apply to the next batch of
              uploads — change them before clicking Upload again to bucket
              the next set differently. Defaults: Unsorted day, blank
              location. */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Which day?
              </label>
              <select
                value={photoDay}
                onChange={e => setPhotoDay(e.target.value)}
                disabled={isUploading}
                className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:bg-zinc-50"
              >
                <option value="">Unsorted</option>
                {itineraryDays.map(d => (
                  <option key={d.day} value={d.day}>
                    Day {d.day}{d.theme ? ` — ${d.theme}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                Location <span className="text-zinc-400 normal-case font-normal">(optional)</span>
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
                {uniqueUploaders.map(uploader => (
                  <option key={uploader} value={uploader}>
                    {uploader}
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
                    {new Date(selectedPhoto.timestamp).toLocaleDateString()} at{' '}
                    {new Date(selectedPhoto.timestamp).toLocaleTimeString()}
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
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all">
                  <Heart className="w-5 h-5" />
                  Like
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all">
                  <MessageCircle className="w-5 h-5" />
                  Comment
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all">
                  <Download className="w-5 h-5" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
