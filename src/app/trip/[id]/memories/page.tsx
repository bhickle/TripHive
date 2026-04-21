'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import {
  Share2, Lock, Camera, Download, Heart, MessageCircle, X,
  Filter, Users, Calendar
} from 'lucide-react';
import { tripPhotos as mockTripPhotos, itineraryDays as mockItineraryDays, groupMembers as mockGroupMembers, MOCK_TRIP_IDS } from '@/data/mock';
import { Avatar } from '@/components/Avatar';
import { createBrowserClient } from '@supabase/ssr';

export default function MemoriesPage({ params }: { params: { id: string } }) {
  const isMockTrip = MOCK_TRIP_IDS.has(params.id);
  const [tripPhotos, setTripPhotos] = useState<any[]>(isMockTrip ? mockTripPhotos : []);
  const itineraryDays = isMockTrip ? mockItineraryDays : [];
  const groupMembers = isMockTrip ? mockGroupMembers : [];
  const [tripDestinationFromApi, setTripDestinationFromApi] = useState<string | null>(null);

  // Load photos and trip destination from Supabase for real trips
  useEffect(() => {
    if (isMockTrip) return;
    const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(params.id);
    if (!looksLikeUuid) return;

    Promise.allSettled([
      fetch(`/api/trips/${params.id}/photos`).then(r => r.ok ? r.json() : null),
      fetch(`/api/trips/${params.id}`).then(r => r.ok ? r.json() : null),
    ]).then(([photosRes, tripRes]) => {
      if (photosRes.status === 'fulfilled' && photosRes.value?.photos) {
        setTripPhotos(photosRes.value.photos.map((p: any) => ({
          id: p.id,
          url: p.url,
          activity: p.caption || 'Photo',
          uploadedBy: p.uploaderName || 'You',
          day: p.dayNumber || 1,
          timestamp: p.createdAt || new Date().toISOString(),
        })));
      }
      if (tripRes.status === 'fulfilled' && tripRes.value?.trip?.destination) {
        setTripDestinationFromApi(tripRes.value.trip.destination);
      }
    });
  }, [isMockTrip, params.id]);

  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
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

  const totalPhotos = tripPhotos.length;
  const totalDays = itineraryDays.length;
  const totalParticipants = groupMembers.length;
  const uniqueUploaders = Array.from(new Set(tripPhotos.map(p => p.uploadedBy)));

  return (
    <main className="min-h-screen bg-parchment">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-script italic font-semibold text-zinc-900 mb-2">The Pics</h1>
          <p className="text-slate-600">Your {tripDestination} adventure through photos</p>
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
            className={`rounded-lg p-6 hover:shadow-lg transition-all flex flex-col items-start justify-between ${
              albumShared
                ? 'bg-green-600 text-white'
                : 'bg-gradient-to-r from-sky-800 to-green-800 text-white'
            }`}
          >
            <Share2 className="w-8 h-8 mb-2" />
            <p className="text-sm font-semibold">{albumShared ? '✓ Shared!' : 'Share Album'}</p>
          </button>
        </div>

        {shareMode && (
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Share Album</h3>
              <button onClick={() => setShareMode(false)}>
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
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
                    <p className="font-medium text-slate-900">Private</p>
                    <p className="text-sm text-slate-500">Only group members can view</p>
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
                    <p className="font-medium text-slate-900">Public Link</p>
                    <p className="text-sm text-slate-500">Anyone with the link can view</p>
                  </div>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="radio"
                    checked={false}
                    onChange={() => {}}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-slate-900">Password Protected</p>
                    <p className="text-sm text-slate-500">Share with a password</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-2">Share Link</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={`${typeof window !== 'undefined' ? window.location.origin : ''}/trip/${params.id}/memories`}
                  readOnly
                  className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-sm text-slate-900"
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
              <p className="text-xs text-slate-500 mt-2">The album is only visible to group members who are signed in.</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-8 mb-8">
          <h3 className="text-xl font-display font-bold text-slate-900 mb-6">Trip Recap</h3>

          {isMockTrip ? (
            <>
              <div className="prose prose-sm max-w-none text-slate-700 mb-6 leading-relaxed">
                <p>
                  Reykjavik revealed itself slowly: first the airport's raw brutality, then the city's hushed charm
                  along the harbor. We stumbled through golden-hour light at Þingvellir, where the earth literally pulls
                  apart beneath your feet. The Geysir erupted on cue, sending plumes skyward while Sarah laughed and Alex
                  captured every frame.
                </p>
                <p className="mt-4">
                  Day three split us—the glacier called some, while others answered the black sand beaches. That evening,
                  under skies that refused to fully darken, we found ourselves at the Blue Lagoon's milky edge, warm water
                  against cold stone, the moment suspended between day and night. The Northern Lights remained elusive but
                  the memories burned just as bright.
                </p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-800 hover:bg-sky-200 rounded-lg font-medium transition-all">
                <Heart className="w-4 h-4" />
                Save Narrative
              </button>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✈️📸</div>
              <p className="text-lg font-semibold text-slate-800 mb-2">Your story is still being written.</p>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Upload photos as you go and at the end of your trip we'll craft an AI-generated recap narrative — a keepsake you can share with the whole crew.
              </p>
              {uploadedCount > 0 && (
                <p className="mt-4 text-sm font-medium text-sky-700">
                  {uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} loaded. Keep adding and we'll weave them into your recap.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
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
              <label className="block text-sm font-medium text-slate-900 mb-2">By Day</label>
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
              <label className="block text-sm font-medium text-slate-900 mb-2">By Photographer</label>
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

            const fileArray = Array.from(files);

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

            // Also push into tripPhotos so totalPhotos and uniqueUploaders recompute immediately
            const newPhotoEntries = blobEntries.map(e => ({
              id: e.id,
              url: e.blobUrl,
              activity: e.activity,
              uploadedBy: 'You',
              day: 1,
              timestamp: new Date().toISOString(),
            }));
            setTripPhotos(prev => [...prev, ...newPhotoEntries]);

            setUploadProgress(50);

            // Try Supabase upload in background (non-mock trips only)
            if (!isMockTrip) {
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
              const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
              if (supabaseUrl && supabaseKey) {
                const supabase = createBrowserClient(supabaseUrl, supabaseKey);
                for (let i = 0; i < fileArray.length; i++) {
                  const file = fileArray[i];
                  try {
                    const timestamp = Date.now() + i;
                    const path = `${params.id}/${timestamp}-${file.name}`;
                    const { error: uploadError, data } = await supabase.storage
                      .from('trip-photos')
                      .upload(path, file, { upsert: true });
                    if (!uploadError && data) {
                      const { data: urlData } = supabase.storage.from('trip-photos').getPublicUrl(path);
                      if (urlData?.publicUrl) {
                        // Swap local preview URL with the Supabase URL and revoke the blob URL
                        setUploadedPhotos(prev => {
                          const updated = [...prev];
                          const localIdx = updated.findIndex(p => p.name === file.name && p.url.startsWith('blob:'));
                          if (localIdx >= 0) {
                            URL.revokeObjectURL(updated[localIdx].url);
                            updated[localIdx] = { url: urlData.publicUrl, name: file.name };
                          }
                          return updated;
                        });
                        // Also swap in tripPhotos state
                        setTripPhotos(prev => prev.map(p =>
                          p.url.startsWith('blob:') && p.activity === file.name.replace(/\.[^.]+$/, '')
                            ? { ...p, url: urlData.publicUrl }
                            : p
                        ));
                        // Record in trip_photos table
                        await supabase.from('trip_photos').insert({
                          trip_id: params.id,
                          storage_path: path,
                          public_url: urlData.publicUrl,
                          uploader_name: 'You',
                          day_number: 1,
                        }).then(({ error }) => { if (error) console.warn('trip_photos insert:', error.message); });
                      }
                    }
                  } catch (err) {
                    console.warn('Background upload failed for', file.name, err);
                  }
                }
              }
            }

            setUploadProgress(100);
            setIsUploading(false);
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

          {uploadedPhotos.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Uploaded Photos</h3>
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

        {photosByDay.map(dayGroup => (
          <div key={dayGroup.day} className="mb-12">
            <div className="mb-6">
              <h2 className="text-2xl font-script italic font-semibold text-slate-900">
                Day {dayGroup.day} — {dayGroup.theme}
              </h2>
              <p className="text-slate-600 text-sm">
                {new Date(dayGroup.date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {dayGroup.photos.map((photo, index) => {
                const isWide = index % 5 === 0;
                const isTall = index % 7 === 0;

                return (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className={`relative overflow-hidden rounded-lg shadow-md hover:shadow-lg transition-all group cursor-pointer bg-slate-200 ${
                      isWide ? 'md:col-span-2' : ''
                    } ${isTall ? 'row-span-2' : 'aspect-square'}`}
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
                );
              })}
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
              <X className="w-6 h-6 text-slate-600" />
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
              <h3 className="text-2xl font-bold text-slate-900 mb-4">{selectedPhoto.activity}</h3>

              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                <Avatar
                  name={selectedPhoto.uploadedBy}
                  size="md"
                />
                <div>
                  <p className="font-medium text-slate-900">{selectedPhoto.uploadedBy}</p>
                  <p className="text-sm text-slate-500">
                    {new Date(selectedPhoto.timestamp).toLocaleDateString()} at{' '}
                    {new Date(selectedPhoto.timestamp).toLocaleTimeString()}
                  </p>
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
