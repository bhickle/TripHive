'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { trips } from '@/data/mock';
import {
  X, Upload, FileText, Loader2, CheckCircle2,
  PlusCircle, ChevronRight, ChevronLeft, AlertCircle,
  Sparkles,
} from 'lucide-react';

type Step = 'upload' | 'trip-choice' | 'processing' | 'done' | 'error';
type TripChoice = 'new' | 'existing';

interface ParsedMeta {
  destination?: string;
  startDate?: string;
  endDate?: string;
  tripLength?: number;
}

interface UploadItineraryModalProps {
  onClose: () => void;
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
  const [selectedTripId, setSelectedTripId] = useState(trips[0]?.id || '');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedMeta, setParsedMeta] = useState<ParsedMeta | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [errorMsg, setErrorMsg] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);

  // ── File reading ──────────────────────────────────────────────────────────

  const readFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRawText(text || '');
      setShowPasteArea(false);
    };
    reader.onerror = () => setErrorMsg('Could not read file. Try pasting the text instead.');
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
  }, [readFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  // ── AI parsing ────────────────────────────────────────────────────────────

  const handleProcess = async () => {
    if (!rawText.trim()) return;
    setStep('processing');
    setErrorMsg('');

    // Cycle loading messages
    let msgIdx = 0;
    const interval = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[msgIdx]);
    }, 1800);

    try {
      const res = await fetch('/api/parse-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
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

      // Store parsed itinerary
      localStorage.setItem('generatedItinerary', JSON.stringify(data.itinerary));
      const meta: ParsedMeta = data.meta || {};
      setParsedMeta(meta);

      if (tripChoice === 'new') {
        localStorage.setItem('generatedTripMeta', JSON.stringify({
          destination: meta.destination || 'Uploaded Trip',
          startDate: meta.startDate || '',
          endDate: meta.endDate || '',
          budget: 5000,
          budgetBreakdown: { flights: 1500, hotel: 1200, food: 800, experiences: 900, transport: 600 },
          fromUpload: true,
        }));
      } else {
        const trip = trips.find(t => t.id === selectedTripId);
        localStorage.setItem('generatedTripMeta', JSON.stringify({
          destination: trip?.destination || meta.destination || 'Your Trip',
          startDate: trip?.startDate || meta.startDate || '',
          endDate: trip?.endDate || meta.endDate || '',
          budget: trip?.budgetTotal || 5000,
          budgetBreakdown: trip?.budgetBreakdown || { flights: 1500, hotel: 1200, food: 800, experiences: 900, transport: 600 },
          fromUpload: true,
        }));
      }

      setStep('done');
    } catch (err) {
      clearInterval(interval);
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setStep('error');
    }
  };

  const handleNavigate = () => {
    const tripId = tripChoice === 'existing' ? selectedTripId : 'trip_1';
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
                  className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-sky-400 bg-sky-50'
                      : rawText
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-zinc-200 hover:border-sky-300 hover:bg-sky-50/40'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.text"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {rawText ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="font-semibold text-emerald-800">{fileName || 'File loaded'}</p>
                      <p className="text-xs text-emerald-600">{rawText.length.toLocaleString()} characters ready to parse</p>
                      <button
                        onClick={e => { e.stopPropagation(); setRawText(''); setFileName(''); }}
                        className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 underline"
                      >
                        Remove & upload different file
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center">
                        <FileText className="w-6 h-6 text-zinc-400" />
                      </div>
                      <p className="font-semibold text-zinc-700">Drop your itinerary file here</p>
                      <p className="text-xs text-zinc-400">or click to browse · .txt or .md files</p>
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              {!rawText && (
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
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
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
                    <p className="text-sm font-semibold text-rose-800">Couldn't parse itinerary</p>
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
                    <select
                      value={selectedTripId}
                      onChange={e => setSelectedTripId(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
                    >
                      {trips.map(trip => (
                        <option key={trip.id} value={trip.id}>
                          {trip.title} — {trip.destination}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* CTA */}
              <button
                onClick={handleProcess}
                disabled={!rawText.trim()}
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
                <p className="text-xs text-zinc-400 mt-1">
                  {tripChoice === 'new'
                    ? 'A new trip has been created with your itinerary.'
                    : `Added to ${trips.find(t => t.id === selectedTripId)?.title || 'your trip'}.`}
                </p>
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
