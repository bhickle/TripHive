'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Upload, FileText, Loader2, CheckCircle2,
  PlusCircle, ChevronRight, AlertCircle,
  Sparkles, Anchor, Ship, Trash2,
} from 'lucide-react';

type Step = 'upload' | 'trip-choice' | 'processing' | 'cruise-check' | 'done' | 'error';
type TripChoice = 'new' | 'existing';

// Destination → Unsplash cover image lookup
const COVER_IMAGES: Record<string, string> = {
  caribbean:  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
  miami:      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
  cruise:     'https://images.unsplash.com/photo-1548574505-5e239809ee19?w=800',
  bahamas:    'https://images.unsplash.com/photo-1548574505-5e239809ee19?w=800',
  turks:      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
  bimini:     'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
  mexico:     'https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800',
  cancun:     'https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800',
  hawaii:     'https://images.unsplash.com/photo-1542259009477-d625272157b7?w=800',
  paris:      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
  tokyo:      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
  bali:       'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800',
  iceland:    'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800',
  italy:      'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=800',
  spain:      'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=800',
  greece:     'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800',
  thailand:   'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
  portugal:   'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
  morocco:    'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800',
  default:    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800',
};

function getCoverImageForDestination(destination: string): string {
  const lower = destination.toLowerCase();
  for (const [key, url] of Object.entries(COVER_IMAGES)) {
    if (key !== 'default' && lower.includes(key)) return url;
  }
  return COVER_IMAGES.default;
}

// Suppress unused-function warning until this is used elsewhere
void getCoverImageForDestination;

interface ParsedMeta {
  destination?: string;
  startDate?: string;
  endDate?: string;
  tripLength?: number;
}

interface UploadItineraryModalProps {
  onClose: () => void;
}

interface LoadedFile {
  id: string;
  name: string;
  text?: string;       // plain-text files
  pdfBase64?: string;  // PDFs
  size: number;
}

interface RealTrip {
  id: string;
  title: string;
  destination: string;
  start_date?: string;
  end_date?: string;
}

const LOADING_MESSAGES = [
  'Reading your itinerary…',
  'Identifying destinations and dates…',
  'Structuring activities by day…',
  'Mapping venues and timing…',
  'Applying the finishing touches…',
];

export function UploadItineraryModal({ onClose }: UploadItineraryModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [tripChoice, setTripChoice] = useState<TripChoice>('new');
  const [selectedTripId, setSelectedTripId] = useState('');
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedMeta, setParsedMeta] = useState<ParsedMeta | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [savedTripId, setSavedTripId] = useState<string | null>(null);
  const [isCruise, setIsCruise] = useState<boolean | null>(null);
  const [cruiseLine, setCruiseLine] = useState('');

  // Real trips loaded from Supabase
  const [realTrips, setRealTrips] = useState<RealTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);

  // ── Load real trips when user picks "Existing Trip" ───────────────────────
  useEffect(() => {
    if (tripChoice !== 'existing') return;
    setTripsLoading(true);
    fetch('/api/trips')
      .then(r => r.ok ? r.json() : { trips: [] })
      .then(data => {
        const trips: RealTrip[] = (data.trips ?? []).map((t: any) => ({
          id: t.id,
          title: t.title,
          destination: t.destination,
          start_date: t.start_date,
          end_date: t.end_date,
        }));
        setRealTrips(trips);
        if (trips.length > 0 && !selectedTripId) {
          setSelectedTripId(trips[0].id);
        }
      })
      .catch(() => setRealTrips([]))
      .finally(() => setTripsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripChoice]);

  // ── File reading ──────────────────────────────────────────────────────────

  const readFile = useCallback((file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const id = `file_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    if (isPdf) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const base64 = result.split(',')[1];
        setLoadedFiles(prev => [...prev, { id, name: file.name, pdfBase64: base64, size: file.size }]);
      };
      reader.onerror = () => setErrorMsg('Could not read PDF. Try opening it and copying the text instead.');
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setLoadedFiles(prev => [...prev, { id, name: file.name, text: text || '', size: file.size }]);
      };
      reader.onerror = () => setErrorMsg('Could not read file. Try pasting the text instead.');
      reader.readAsText(file);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(readFile);
    // Reset so the same file can be re-added if needed
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(readFile);
  }, [readFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const removeFile = (id: string) => setLoadedFiles(prev => prev.filter(f => f.id !== id));

  // ── Helpers ───────────────────────────────────────────────────────────────

  // True when there's something to parse
  const hasContent = loadedFiles.length > 0 || pasteText.trim().length > 0;

  // Build the body for /api/parse-itinerary
  // If there's exactly one PDF (and optionally text), send it as a document.
  // If there are only text files, concatenate them.
  // Multiple PDFs: concatenate only the text portion; send first PDF as document.
  function buildParseBody(): { pdfBase64?: string; fileName?: string; text?: string } {
    const pdfFiles = loadedFiles.filter(f => f.pdfBase64);
    const textFiles = loadedFiles.filter(f => f.text !== undefined);

    const allText = [
      ...textFiles.map(f => `--- ${f.name} ---\n${f.text}`),
      ...(pasteText.trim() ? [`--- Pasted text ---\n${pasteText.trim()}`] : []),
    ].join('\n\n');

    if (pdfFiles.length > 0) {
      // Use first PDF as native document; append any text files as supplemental context
      return {
        pdfBase64: pdfFiles[0].pdfBase64,
        fileName: pdfFiles[0].name,
        ...(allText ? { text: allText } : {}),
      };
    }

    return { text: allText };
  }

  // ── AI parsing ────────────────────────────────────────────────────────────

  const handleProcess = async () => {
    if (!hasContent) return;
    setStep('processing');
    setErrorMsg('');

    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 1800);

    try {
      const body = buildParseBody();

      const res = await fetch('/api/parse-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      clearInterval(interval);
      const data = await res.json();

      if (!res.ok || data.error) {
        if (data.error === 'NO_API_KEY') {
          setErrorMsg('No AI API key configured. Add your Anthropic API key to .env.local to enable parsing.');
        } else {
          setErrorMsg(data.message || 'Failed to parse the itinerary. Please try again.');
        }
        setStep('error');
        return;
      }

      localStorage.setItem('generatedItinerary', JSON.stringify(data.itinerary));
      const meta: ParsedMeta = data.meta || {};
      setParsedMeta(meta);

      const destination = meta.destination || 'Uploaded Trip';

      if (tripChoice === 'new') {
        const tripMetaForStorage = {
          destination,
          startDate: meta.startDate || '',
          endDate: meta.endDate || '',
          budget: 5000,
          budgetBreakdown: { flights: 1500, hotel: 1200, food: 800, experiences: 900, transport: 600 },
          fromUpload: true,
        };
        localStorage.setItem('generatedTripMeta', JSON.stringify(tripMetaForStorage));

        let finalTripId = `upload_${Date.now()}`;
        try {
          const saveRes = await fetch('/api/trips/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tripMeta: {
                destination,
                title: destination,
                startDate: meta.startDate || '',
                endDate: meta.endDate || '',
                groupType: 'friends',
                groupSize: 1,
                budget: 5000,
                budgetBreakdown: { flights: 1500, hotel: 1200, food: 800, experiences: 900, transport: 600 },
                bookedHotels: [],
                bookedFlight: null,
                preferences: { fromUpload: true },
              },
              itinerary: data.itinerary,
            }),
          });
          if (saveRes.ok) {
            const { tripId } = await saveRes.json();
            finalTripId = tripId;
            setSavedTripId(tripId);
            localStorage.setItem('currentTripId', tripId);

            // Kick off AI packing list generation in the background (non-blocking)
            fetch('/api/generate-packing', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tripId, destination, startDate: meta.startDate, endDate: meta.endDate }),
            }).catch(() => { /* non-fatal */ });
          }
        } catch {
          // Silently fall back to localStorage-only if Supabase save fails
        }
      } else {
        // Existing trip — write localStorage then PATCH Supabase with the new itinerary
        const trip = realTrips.find(t => t.id === selectedTripId);
        const tripDestination = trip?.destination || destination;
        localStorage.setItem('generatedTripMeta', JSON.stringify({
          destination: tripDestination,
          startDate: trip?.start_date || meta.startDate || '',
          endDate: trip?.end_date || meta.endDate || '',
          budget: 5000,
          budgetBreakdown: { flights: 1500, hotel: 1200, food: 800, experiences: 900, transport: 600 },
          fromUpload: true,
        }));
        localStorage.setItem('currentTripId', selectedTripId);
        setSavedTripId(selectedTripId);

        // Persist the newly-parsed itinerary into Supabase, replacing the old one
        try {
          await fetch(`/api/trips/${selectedTripId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days: data.itinerary }),
          });
        } catch {
          // Non-fatal — localStorage fallback is still set
        }

        // Regenerate packing list for the updated itinerary (fire-and-forget)
        fetch('/api/generate-packing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripId: selectedTripId,
            destination: tripDestination,
            startDate: trip?.start_date || meta.startDate,
            endDate: trip?.end_date || meta.endDate,
          }),
        }).catch(() => { /* non-fatal */ });
      }

      setStep('cruise-check');
    } catch (err) {
      clearInterval(interval);
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStep('error');
    }
  };

  // ── Cruise confirmation ───────────────────────────────────────────────────

  const handleCruiseConfirm = (isACruise: boolean) => {
    setIsCruise(isACruise);
    if (!isACruise) {
      updateMetaWithCruise(false, '');
      setStep('done');
    }
  };

  const handleCruiseLineConfirm = () => {
    updateMetaWithCruise(true, cruiseLine.trim());
    setStep('done');
  };

  const updateMetaWithCruise = (isACruise: boolean, line: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem('generatedTripMeta') || '{}');
      localStorage.setItem('generatedTripMeta', JSON.stringify({ ...existing, isCruise: isACruise, cruiseLine: line }));
    } catch { /* non-fatal */ }

    if (savedTripId && /^[0-9a-f-]{36}$/i.test(savedTripId)) {
      fetch(`/api/trips/${savedTripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metaPatch: { isCruise: isACruise, cruiseLine: line } }),
      }).catch(() => { /* non-fatal */ });
    }
  };

  const handleNavigate = () => {
    const tripId = savedTripId ?? (tripChoice === 'existing' ? selectedTripId : `upload_${Date.now()}`);
    router.push(`/trip/${tripId}/itinerary`);
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-7 pt-7 pb-5 border-b border-zinc-100">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-sky-800 rounded-xl flex items-center justify-center flex-shrink-0">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900">Upload Itinerary</h2>
          </div>
          <p className="text-sm text-zinc-500 pl-12">Import an existing itinerary and let AI structure it for you.</p>
          <button
            onClick={onClose}
            className="absolute top-6 right-6 w-8 h-8 rounded-full bg-zinc-100 hover:bg-zinc-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="px-7 py-6">

          {/* ── Step: Upload ── */}
          {(step === 'upload' || step === 'error') && (
            <div className="space-y-5">

              {/* File drop zone */}
              {!showPasteArea && (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-sky-400 bg-sky-50'
                      : loadedFiles.length > 0
                        ? 'border-emerald-300 bg-emerald-50/40'
                        : 'border-zinc-200 hover:border-sky-300 hover:bg-sky-50/40'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.csv,.text"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center">
                      <FileText className="w-6 h-6 text-zinc-400" />
                    </div>
                    <p className="font-semibold text-zinc-700">Drop your itinerary files here</p>
                    <p className="text-xs text-zinc-400">or click to browse · PDF, .txt, or .md · multiple files OK</p>
                  </div>
                </div>
              )}

              {/* Loaded files list */}
              {loadedFiles.length > 0 && (
                <div className="space-y-2">
                  {loadedFiles.map(file => (
                    <div key={file.id} className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-emerald-800 truncate">{file.name}</p>
                        <p className="text-xs text-emerald-600">
                          {file.pdfBase64 ? 'PDF' : `${(file.text ?? '').length.toLocaleString()} characters`}
                        </p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); removeFile(file.id); }}
                        className="w-6 h-6 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3 h-3 text-emerald-700" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
                    className="w-full text-xs text-sky-600 hover:text-sky-800 font-medium py-1 transition-colors"
                  >
                    + Add another file
                  </button>
                </div>
              )}

              {/* Divider */}
              {loadedFiles.length === 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-zinc-100" />
                  <button
                    onClick={() => setShowPasteArea(!showPasteArea)}
                    className="text-xs font-medium text-zinc-400 hover:text-zinc-600 whitespace-nowrap transition-colors"
                  >
                    {showPasteArea ? '↑ Back to file upload' : 'Or paste itinerary text'}
                  </button>
                  <div className="flex-1 h-px bg-zinc-100" />
                </div>
              )}

              {/* Paste area */}
              {showPasteArea && (
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste your itinerary here — from an email, PDF copy, travel agent doc, or any text…"
                  rows={8}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-2xl text-sm text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-sky-600 resize-none"
                />
              )}

              {/* Error */}
              {step === 'error' && (
                <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                  <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-rose-800">Couldn&apos;t parse itinerary</p>
                    <p className="text-xs text-rose-600 mt-0.5">{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* Trip choice */}
              <div>
                <p className="text-sm font-semibold text-zinc-700 mb-3">Where should this go?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setTripChoice('new')}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                      tripChoice === 'new'
                        ? 'border-sky-400 bg-sky-50'
                        : 'border-zinc-100 hover:border-zinc-200 bg-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      tripChoice === 'new' ? 'bg-sky-800' : 'bg-zinc-100'
                    }`}>
                      <PlusCircle className={`w-4 h-4 ${tripChoice === 'new' ? 'text-white' : 'text-zinc-400'}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${tripChoice === 'new' ? 'text-sky-900' : 'text-zinc-700'}`}>New trip</p>
                      <p className="text-xs text-zinc-400">Create from this file</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setTripChoice('existing')}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                      tripChoice === 'existing'
                        ? 'border-sky-400 bg-sky-50'
                        : 'border-zinc-100 hover:border-zinc-200 bg-white'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      tripChoice === 'existing' ? 'bg-sky-800' : 'bg-zinc-100'
                    }`}>
                      <FileText className={`w-4 h-4 ${tripChoice === 'existing' ? 'text-white' : 'text-zinc-400'}`} />
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${tripChoice === 'existing' ? 'text-sky-900' : 'text-zinc-700'}`}>Existing trip</p>
                      <p className="text-xs text-zinc-400">Add to a planned trip</p>
                    </div>
                  </button>
                </div>

                {/* Trip selector for existing */}
                {tripChoice === 'existing' && (
                  <div className="mt-3">
                    {tripsLoading ? (
                      <div className="flex items-center justify-center gap-2 py-3 text-sm text-zinc-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading your trips…
                      </div>
                    ) : realTrips.length === 0 ? (
                      <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <p className="text-xs text-amber-800">No trips found. Create a new trip first, or select &quot;New trip&quot; above.</p>
                      </div>
                    ) : (
                      <select
                        value={selectedTripId}
                        onChange={e => setSelectedTripId(e.target.value)}
                        className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
                      >
                        {realTrips.map(trip => (
                          <option key={trip.id} value={trip.id}>
                            {trip.title} — {trip.destination}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={handleProcess}
                disabled={!hasContent || (tripChoice === 'existing' && realTrips.length === 0)}
                className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-black disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-full transition-all"
              >
                <Sparkles className="w-4 h-4" />
                Parse with AI
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Step: Processing ── */}
          {step === 'processing' && (
            <div className="py-10 flex flex-col items-center text-center gap-5">
              <div className="relative">
                <div className="w-16 h-16 bg-sky-800 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                  <span className="text-white font-bold text-2xl">t</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 mb-2">AI Parsing</p>
                <p className="text-lg font-bold text-zinc-900 mb-1">Reading your itinerary…</p>
                <p className="text-sm text-zinc-400 h-5 transition-all duration-500">{loadingMsg}</p>
              </div>
              <div className="w-48 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-sky-800 rounded-full" style={{ width: '60%', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            </div>
          )}

          {/* ── Step: Cruise Check ── */}
          {step === 'cruise-check' && (
            <div className="py-6 flex flex-col gap-6">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 bg-sky-100 rounded-full flex items-center justify-center">
                  <Anchor className="w-7 h-7 text-sky-700" />
                </div>
                <div>
                  <p className="text-lg font-bold text-zinc-900">One quick question</p>
                  {parsedMeta?.destination && (
                    <p className="text-sm text-zinc-400 mt-0.5">
                      {parsedMeta.destination}{parsedMeta.tripLength ? ` · ${parsedMeta.tripLength} days` : ''}
                    </p>
                  )}
                </div>
              </div>

              {isCruise === null && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-zinc-700 text-center">Is this a cruise?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => handleCruiseConfirm(true)}
                      className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-zinc-200 hover:border-sky-400 hover:bg-sky-50 transition-all"
                    >
                      <Ship className="w-7 h-7 text-sky-600" />
                      <span className="font-semibold text-zinc-800 text-sm">Yes, it&apos;s a cruise</span>
                    </button>
                    <button
                      onClick={() => handleCruiseConfirm(false)}
                      className="flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50 transition-all"
                    >
                      <span className="text-3xl">🏨</span>
                      <span className="font-semibold text-zinc-800 text-sm">No, land trip</span>
                    </button>
                  </div>
                </div>
              )}

              {isCruise === true && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-3 py-2 bg-sky-50 border border-sky-200 rounded-xl">
                    <Ship className="w-4 h-4 text-sky-600 flex-shrink-0" />
                    <span className="text-sm text-sky-800 font-medium">Cruise itinerary — port stops detected ⚓</span>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-zinc-700 mb-2">Which cruise line?</label>
                    <input
                      type="text"
                      autoFocus
                      placeholder="e.g. Royal Caribbean, Carnival, Norwegian…"
                      value={cruiseLine}
                      onChange={e => setCruiseLine(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCruiseLineConfirm()}
                      className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-600"
                    />
                    <p className="text-xs text-zinc-400 mt-1.5">
                      AI will suggest activities within walking distance of each port terminal.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsCruise(null)}
                      className="px-5 py-3 border border-zinc-200 text-zinc-600 font-semibold rounded-full hover:bg-zinc-50 transition-colors text-sm"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleCruiseLineConfirm}
                      className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-black text-white font-semibold py-3 rounded-full transition-colors text-sm"
                    >
                      Continue to my trip
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Done ── */}
          {step === 'done' && (
            <div className="py-6 flex flex-col items-center text-center gap-5">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-zinc-900 mb-1">Itinerary imported!</p>
                {parsedMeta?.destination && (
                  <p className="text-sm text-zinc-500">
                    Parsed <span className="font-semibold text-zinc-700">{parsedMeta.destination}</span>
                    {parsedMeta.tripLength ? ` · ${parsedMeta.tripLength} days` : ''}
                  </p>
                )}
                {isCruise && cruiseLine && (
                  <p className="text-xs text-sky-700 font-medium mt-1 flex items-center justify-center gap-1">
                    <Ship className="w-3 h-3" /> {cruiseLine} cruise · port-stop mode active
                  </p>
                )}
                <p className="text-xs text-zinc-400 mt-1">
                  {tripChoice === 'new'
                    ? 'A new trip has been created with your itinerary.'
                    : `Added to ${realTrips.find(t => t.id === selectedTripId)?.title || 'your trip'}.`}
                </p>
                {loadedFiles.length > 1 && (
                  <p className="text-xs text-zinc-400 mt-0.5">{loadedFiles.length} files merged and parsed.</p>
                )}
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 border border-zinc-200 text-zinc-600 font-semibold rounded-full hover:bg-zinc-50 transition-colors text-sm"
                >
                  Close
                </button>
                <button
                  onClick={handleNavigate}
                  className="flex-1 flex items-center justify-center gap-2 bg-zinc-900 hover:bg-black text-white font-semibold py-3 rounded-full transition-colors text-sm"
                >
                  View Itinerary
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
