'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, FileText, Image, MessageSquare, CheckCircle2, AlertCircle,
  Loader, ChevronDown, MapPin, Calendar, Activity, Anchor, AlertTriangle, Zap, Clock
} from 'lucide-react';

interface ParsedDay {
  day: number;
  date: string;
  activities: ParsedActivity[];
}

interface ParsedActivity {
  id: string;
  name: string;
  time?: string;
  location?: string;
  confidence: number;
  uncertain?: boolean;
}

interface ProcessingStep {
  label: string;
  completed: boolean;
  detail?: string;
}

interface ParsedItinerary {
  destination: string;
  startDate: string;
  endDate: string;
  days: ParsedDay[];
  accommodations: string[];
  isCruise: boolean;
  ports?: string[];
}

export default function UploadItineraryPage() {
  const router = useRouter();
  const [uploadMode, setUploadMode] = useState<'file' | 'paste' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [parsedData, setParsedData] = useState<ParsedItinerary | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preferences form state
  const [showPreferences, setShowPreferences] = useState(false);
  const [prefStep, setPrefStep] = useState(1); // 1=who's traveling, 2=priorities, 3=budget, 4=generate
  const [groupType, setGroupType] = useState('');
  const [priorities, setPriorities] = useState<string[]>([]);
  const [ageRanges, setAgeRanges] = useState<string[]>([]);
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<string[]>([]);
  const [budget, setBudget] = useState('3000');
  const [isGenerating, setIsGenerating] = useState(false);

  // Preference form options
  const groupTypeOptions = [
    { id: 'solo', label: 'Solo', icon: '🧳', desc: 'Just me' },
    { id: 'couple', label: 'Couple', icon: '💑', desc: 'Two of us' },
    { id: 'friends', label: 'Friends', icon: '👥', desc: '3+ friends' },
    { id: 'family', label: 'Family', icon: '👨‍👩‍👧‍👦', desc: 'Family trip' },
  ];

  const priorityOptions = [
    { id: 'nature', label: 'Nature', icon: '🌿' },
    { id: 'food', label: 'Food', icon: '🍽️' },
    { id: 'nightlife', label: 'Nightlife', icon: '🎉' },
    { id: 'history', label: 'History', icon: '🏛️' },
    { id: 'sports', label: 'Sports', icon: '⚽' },
    { id: 'photography', label: 'Photography', icon: '📸' },
    { id: 'wellness', label: 'Wellness', icon: '🧘' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'adventure', label: 'Adventure', icon: '🪂' },
    { id: 'culture', label: 'Culture', icon: '🎨' },
  ];

  const ageRangeOptions = ['Under 12', '12-17', '18-30', '31-50', '51-65', '65+'];
  const accessibilityOptionsList = ['Wheelchair accessible', 'Limited mobility', 'Visual assistance', 'No special needs'];

  const mockProcessingSteps: ProcessingStep[] = [
    { label: 'Scanning your document...', completed: false },
    { label: 'Extracting trip details...', completed: false },
    { label: 'Building your itinerary...', completed: false },
  ];

  const mockParsedData: ParsedItinerary = {
    destination: 'Reykjavik, Iceland',
    startDate: '2026-09-15',
    endDate: '2026-09-21',
    isCruise: false,
    accommodations: ['Hotel Borg - 4 nights'],
    days: [
      {
        day: 1,
        date: '2026-09-15',
        activities: [
          { id: '1', name: 'Arrive at Keflavik Airport', time: '15:00', confidence: 5, uncertain: false },
          { id: '2', name: 'Check-in at Hotel Borg', time: '17:30', confidence: 5, uncertain: false },
          { id: '3', name: 'Dinner at Grillið', time: '19:00', confidence: 4, uncertain: false },
        ],
      },
      {
        day: 2,
        date: '2026-09-16',
        activities: [
          { id: '4', name: 'Breakfast at hotel', time: '08:00', confidence: 5, uncertain: false },
          { id: '5', name: 'Golden Circle day tour', time: '09:30', confidence: 5, uncertain: false },
          { id: '6', name: 'Lunch at Geysir', time: '12:00', confidence: 3, uncertain: true },
        ],
      },
      {
        day: 3,
        date: '2026-09-17',
        activities: [
          { id: '7', name: 'South Coast Adventure', time: '08:30', confidence: 4, uncertain: false },
          { id: '8', name: 'Seljalandsfoss Waterfall', time: '10:00', confidence: 5, uncertain: false },
          { id: '9', name: 'Glacier hiking or black sand beach', time: '14:00', confidence: 2, uncertain: true },
        ],
      },
    ],
  };

  const mockCruiseData: ParsedItinerary = {
    destination: 'Norwegian & Caribbean Cruise',
    startDate: '2026-07-10',
    endDate: '2026-07-17',
    isCruise: true,
    accommodations: ['Cruise Ship Cabin - Inside Balcony'],
    ports: ['Port Canaveral, Florida', 'Nassau, Bahamas', 'Cozumel, Mexico', 'Grand Cayman'],
    days: [
      {
        day: 1,
        date: '2026-07-10',
        activities: [
          { id: '1', name: 'Embarkation Day at Port Canaveral', time: '11:00', confidence: 5, uncertain: false },
          { id: '2', name: 'Check cabin', time: '13:00', confidence: 5, uncertain: false },
          { id: '3', name: 'Mandatory muster drill', time: '16:00', confidence: 5, uncertain: false },
        ],
      },
      {
        day: 2,
        date: '2026-07-11',
        activities: [
          { id: '4', name: 'Sea day', time: '09:00', confidence: 5, uncertain: false },
          { id: '5', name: 'Explore ship amenities', time: '10:00', confidence: 4, uncertain: false },
          { id: '6', name: 'Dinner at main dining room', time: '19:00', confidence: 4, uncertain: false },
        ],
      },
      {
        day: 3,
        date: '2026-07-12',
        activities: [
          { id: '7', name: 'Nassau, Bahamas', time: '08:00', location: 'Port', confidence: 5, uncertain: false },
          { id: '8', name: 'Beach & water activities', time: '09:00', confidence: 3, uncertain: true },
          { id: '9', name: 'All-aboard 16:00', time: '16:00', confidence: 5, uncertain: false },
        ],
      },
    ],
  };

  const simulateProcessing = async (isShipData: boolean = false) => {
    setIsProcessing(true);
    setProcessingSteps(mockProcessingSteps.map(s => ({ ...s, completed: false })));

    // Step 1: Scanning
    await new Promise(resolve => setTimeout(resolve, 1000));
    setProcessingSteps(prev => {
      const newSteps = [...prev];
      newSteps[0] = { ...newSteps[0], completed: true, detail: isShipData ? 'Cruise itinerary detected' : 'Travel document scanned' };
      return newSteps;
    });

    // Step 2: Extracting
    await new Promise(resolve => setTimeout(resolve, 1200));
    const dataToUse = isShipData ? mockCruiseData : mockParsedData;
    setProcessingSteps(prev => {
      const newSteps = [...prev];
      newSteps[1] = {
        ...newSteps[1],
        completed: true,
        detail: `${dataToUse.destination} • ${dataToUse.days.length} days`
      };
      return newSteps;
    });

    // Step 3: Building
    await new Promise(resolve => setTimeout(resolve, 1500));
    const totalActivities = dataToUse.days.reduce((sum, d) => sum + d.activities.length, 0);
    setProcessingSteps(prev => {
      const newSteps = [...prev];
      newSteps[2] = {
        ...newSteps[2],
        completed: true,
        detail: `${totalActivities} activities found`
      };
      return newSteps;
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    setParsedData(dataToUse);
    setIsProcessing(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('border-sky-600', 'bg-sky-50');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('border-sky-600', 'bg-sky-50');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('border-sky-600', 'bg-sky-50');
    if (e.dataTransfer.files?.[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileUpload = async () => {
    if (selectedFile) {
      const isCruiseDoc = selectedFile.name.toLowerCase().includes('cruise');
      await simulateProcessing(isCruiseDoc);
      setUploadMode(null);
    }
  };

  const handlePasteUpload = async () => {
    if (pasteText.trim()) {
      const isCruiseDoc = pasteText.toLowerCase().includes('cruise') || pasteText.toLowerCase().includes('port');
      await simulateProcessing(isCruiseDoc);
      setUploadMode(null);
      setPasteText('');
    }
  };

  const resetUpload = () => {
    setParsedData(null);
    setSelectedFile(null);
    setPasteText('');
    setUploadMode(null);
    setProcessingSteps([]);
    setShowPreferences(false);
    setPrefStep(1);
    setGroupType('');
    setPriorities([]);
    setAgeRanges([]);
    setAccessibilityNeeds([]);
    setBudget('3000');
    setIsGenerating(false);
  };

  // Processing UI
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gradient-subtle p-6 md:p-8 flex items-center justify-center">
        <div className="max-w-lg w-full">
          <div className="card p-8 text-center">
            <div className="mb-8">
              <Loader className="w-12 h-12 text-sky-700 mx-auto animate-spin" />
            </div>
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-6">
              Parsing Your Itinerary
            </h2>
            <div className="space-y-4">
              {processingSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className="flex-shrink-0 mt-1">
                    {step.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-stone-700" />
                    ) : (
                      <Loader className="w-5 h-5 text-sky-700 animate-spin" />
                    )}
                  </div>
                  <div className="text-left flex-1">
                    <p className="font-semibold text-slate-900">{step.label}</p>
                    {step.detail && (
                      <p className="text-sm text-slate-600 mt-1">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Preferences Form (after upload confirmation)
  if (parsedData && showPreferences) {
    const totalPrefSteps = 3;
    const prefProgress = ((prefStep - 1) / totalPrefSteps) * 100;

    if (isGenerating) {
      return (
        <div className="min-h-screen bg-gradient-subtle p-6 md:p-8 flex items-center justify-center">
          <div className="max-w-lg w-full card p-8 text-center">
            <Loader className="w-12 h-12 text-sky-700 mx-auto animate-spin mb-6" />
            <h2 className="text-2xl font-display font-bold text-slate-900 mb-2">Building Your Trip</h2>
            <p className="text-slate-600">Creating your personalized {parsedData.destination} itinerary...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-subtle p-6 md:p-8">
        <div className="max-w-3xl mx-auto">
          {/* Header with trip info from parsed data */}
          <div className="mb-8">
            <p className="text-sm text-sky-700 font-medium mb-2">Enhancing your uploaded itinerary</p>
            <h1 className="text-3xl font-display font-bold text-slate-900 mb-2">
              Personalize Your Trip
            </h1>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {parsedData.destination}</span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {parsedData.days.length} days</span>
            </div>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-700">Step {prefStep} of {totalPrefSteps}</span>
              <span className="text-sm font-medium text-sky-700">{Math.round(prefProgress)}% complete</span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-ocean-400 to-ocean-600 transition-all duration-300" style={{ width: `${prefProgress}%` }} />
            </div>
          </div>

          <div className="card p-8 mb-8">
            {/* Step 1: Who's traveling? */}
            {prefStep === 1 && (
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900 mb-6">Who's traveling?</h2>
                <div className="grid grid-cols-2 gap-4">
                  {groupTypeOptions.map(option => (
                    <button
                      key={option.id}
                      onClick={() => setGroupType(option.id)}
                      className={`p-6 rounded-lg border-2 transition-all text-center ${
                        groupType === option.id ? 'border-sky-700 bg-sky-50' : 'border-slate-200 hover:border-sky-300'
                      }`}
                    >
                      <span className="text-3xl block mb-2">{option.icon}</span>
                      <p className="font-semibold text-slate-900">{option.label}</p>
                      <p className="text-sm text-slate-600 mt-1">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: What matters most? */}
            {prefStep === 2 && (
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900 mb-6">What matters most?</h2>

                {/* Age Ranges */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-slate-900 mb-3">Age Ranges</label>
                  <div className="grid grid-cols-3 gap-2">
                    {ageRangeOptions.map(age => (
                      <button
                        key={age}
                        onClick={() => setAgeRanges(prev => prev.includes(age) ? prev.filter(a => a !== age) : [...prev, age])}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          ageRanges.includes(age) ? 'border-sky-700 bg-sky-50 text-sky-800' : 'border-slate-200 text-slate-700 hover:border-sky-300'
                        }`}
                      >
                        {age}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Accessibility */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-slate-900 mb-3">Accessibility Needs</label>
                  <div className="grid grid-cols-2 gap-2">
                    {accessibilityOptionsList.map(need => (
                      <label key={need} className="flex items-center space-x-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={accessibilityNeeds.includes(need)}
                          onChange={() => setAccessibilityNeeds(prev => prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need])}
                          className="w-4 h-4 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
                        />
                        <span className="text-sm font-medium text-slate-900">{need}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Travel Priorities */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-slate-900 mb-3">Travel Priorities</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {priorityOptions.map(priority => (
                      <button
                        key={priority.id}
                        onClick={() => setPriorities(prev => prev.includes(priority.id) ? prev.filter(p => p !== priority.id) : [...prev, priority.id])}
                        className={`p-4 rounded-lg border-2 transition-all text-center ${
                          priorities.includes(priority.id) ? 'border-sky-700 bg-sky-50' : 'border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        <span className="text-2xl block mb-1">{priority.icon}</span>
                        <p className="font-medium text-slate-900 text-sm">{priority.label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Budget */}
            {prefStep === 3 && (
              <div>
                <h2 className="text-2xl font-display font-bold text-slate-900 mb-6">Set Your Budget</h2>
                <p className="text-slate-600 mb-6">How much are you planning to spend on this trip (excluding what's already booked)?</p>

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-slate-900 mb-3">Total Budget (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold">$</span>
                    <input
                      type="number"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 border border-slate-300 rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-sky-700"
                      placeholder="3000"
                    />
                  </div>
                </div>

                <div className="p-4 bg-sky-50 border border-sky-200 rounded-lg">
                  <p className="text-sm text-sky-900 font-medium">This budget will be used to recommend activities, restaurants, and experiences within your price range for your {parsedData.destination} trip.</p>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-4">
            <button
              onClick={() => {
                if (prefStep === 1) {
                  setShowPreferences(false);
                } else {
                  setPrefStep(prev => prev - 1);
                }
              }}
              className="flex-1 px-6 py-4 bg-white border-2 border-slate-200 text-slate-900 font-semibold rounded-xl hover:bg-slate-50 transition-all text-lg"
            >
              {prefStep === 1 ? '← Back to Review' : '← Back'}
            </button>
            <button
              onClick={() => {
                if (prefStep < totalPrefSteps) {
                  setPrefStep(prev => prev + 1);
                } else {
                  // Generate the trip
                  setIsGenerating(true);
                  setTimeout(() => {
                    router.push('/trip/trip_1/itinerary');
                  }, 2000);
                }
              }}
              className="flex-1 px-6 py-4 bg-sky-800 text-white font-semibold rounded-xl hover:bg-sky-900 transition-all text-lg shadow-md"
            >
              {prefStep === totalPrefSteps ? 'Generate Trip →' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Parsed Data Review
  if (parsedData && !showPreferences) {
    return (
      <div className="min-h-screen bg-gradient-subtle p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-display font-bold text-slate-900 mb-2">
              Review & Confirm
            </h1>
            <p className="text-slate-600 text-lg">
              Here's what we extracted from your document. Edit any details that don't look right.
            </p>
          </div>

          {/* Cruise Badge */}
          {parsedData.isCruise && (
            <div className="card p-6 mb-6 border-l-4 border-l-earth-500 bg-stone-50">
              <div className="flex items-start gap-4">
                <Anchor className="w-6 h-6 text-stone-700 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-stone-900 mb-2">Cruise Itinerary Detected</h3>
                  <p className="text-stone-800 text-sm mb-3">
                    We've identified {parsedData.ports?.length || 0} port stops. We can auto-generate layover plans for each port using our Layover Planner.
                  </p>
                  <button className="inline-flex items-center gap-2 px-4 py-2 bg-green-800 text-white rounded-lg hover:bg-green-800 transition-all text-sm font-semibold">
                    <Zap className="w-4 h-4" />
                    Enhance with triphive AI
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Trip Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Destination
              </p>
              <p className="text-lg font-display font-bold text-slate-900">
                {parsedData.destination}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Duration
              </p>
              <p className="text-lg font-display font-bold text-slate-900">
                {parsedData.days.length} days
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                Total Activities
              </p>
              <p className="text-lg font-display font-bold text-slate-900">
                {parsedData.days.reduce((sum, d) => sum + d.activities.length, 0)}
              </p>
            </div>
          </div>

          {/* Days */}
          <div className="space-y-6 mb-8">
            {parsedData.days.map((day) => (
              <div key={day.day} className="card p-6">
                <div className="flex items-start justify-between mb-6 pb-4 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-5 h-5 text-sky-700" />
                      <p className="text-sm font-semibold text-slate-600">
                        Day {day.day}
                      </p>
                    </div>
                    <p className="text-xl font-display font-bold text-slate-900">
                      {new Date(day.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <button className="px-4 py-2 text-sky-700 font-semibold hover:bg-sky-50 rounded-lg transition-all">
                    Edit
                  </button>
                </div>

                <div className="space-y-3">
                  {day.activities.map((activity) => (
                    <div
                      key={activity.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        activity.uncertain
                          ? 'border-sky-300 bg-sky-50'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold text-slate-900">
                              {activity.name}
                            </h4>
                            {activity.uncertain && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-200 text-sky-900 rounded text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                AI uncertain
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                            {activity.time && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {activity.time}
                              </span>
                            )}
                            {activity.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {activity.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <button className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-all text-sm font-medium">
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Accommodations */}
          {parsedData.accommodations.length > 0 && (
            <div className="card p-6 mb-8">
              <h3 className="text-lg font-display font-bold text-slate-900 mb-4">
                Accommodations
              </h3>
              <div className="space-y-2">
                {parsedData.accommodations.map((acc, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
                    <p className="text-slate-700 font-medium">{acc}</p>
                    <button className="text-sky-700 hover:text-sky-800 text-sm font-medium">
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cruise Ports */}
          {parsedData.isCruise && parsedData.ports && parsedData.ports.length > 0 && (
            <div className="card p-6 mb-8">
              <h3 className="text-lg font-display font-bold text-slate-900 mb-4">
                Port Schedule
              </h3>
              <div className="space-y-2">
                {parsedData.ports.map((port, idx) => (
                  <div key={idx} className="p-4 bg-gradient-to-r from-earth-50 to-ocean-50 rounded-lg flex items-center justify-between border border-stone-200">
                    <div className="flex items-center gap-3">
                      <Anchor className="w-5 h-5 text-stone-700" />
                      <p className="text-slate-900 font-medium">{port}</p>
                    </div>
                    <button className="text-stone-700 hover:text-stone-700 text-sm font-medium">
                      Plan Layover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="mb-4 p-4 bg-sky-50 border border-sky-200 rounded-lg flex items-start gap-3">
            <Zap className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-sky-900">
              After confirming, you'll be asked about your travel preferences (priorities, accessibility, difficulty levels) so we can enhance your itinerary with personalized recommendations.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => setParsedData(null)}
              className="flex-1 px-6 py-4 bg-white border-2 border-slate-200 text-slate-900 font-semibold rounded-xl hover:bg-slate-50 transition-all text-lg"
            >
              This doesn't look right — try again
            </button>
            <button
              onClick={() => setShowPreferences(true)}
              className="flex-1 px-6 py-4 bg-sky-800 text-white font-semibold rounded-xl hover:bg-sky-900 transition-all text-lg shadow-md"
            >
              Continue to Preferences →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Upload Screen
  return (
    <div className="min-h-screen bg-gradient-subtle p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-4 bg-sky-100 rounded-2xl">
              <Upload className="w-8 h-8 text-sky-700" />
            </div>
          </div>
          <h1 className="text-4xl font-display font-bold text-slate-900 mb-3">
            Import Your Itinerary
          </h1>
          <p className="text-lg text-slate-600">
            Already have a trip booked? Upload your confirmation and we'll build your triphive itinerary from it.
          </p>
        </div>

        {/* Upload Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* File Upload */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="card p-8 border-2 border-dashed border-sky-300 hover:border-sky-600 cursor-pointer transition-all hover:bg-sky-50"
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              accept=".pdf,.docx,.png,.jpg,.jpeg,.txt"
              className="hidden"
            />
            <div className="text-center">
              <FileText className="w-12 h-12 text-sky-700 mx-auto mb-4" />
              <h3 className="text-xl font-display font-bold text-slate-900 mb-2">
                Upload Document
              </h3>
              <p className="text-slate-600 text-sm mb-4">
                Drag and drop your file or click to browse
              </p>
              {selectedFile && (
                <div className="mb-4 p-3 bg-sky-50 rounded-lg border border-sky-200">
                  <p className="text-sm font-medium text-sky-900">{selectedFile.name}</p>
                </div>
              )}
              <div className="text-xs text-slate-500 space-y-1">
                <p className="font-semibold">Supported formats:</p>
                <p className="flex items-center justify-center gap-2">
                  <FileText className="w-3 h-3" /> PDF
                  <FileText className="w-3 h-3" /> DOCX
                  <Image className="w-3 h-3" /> PNG/JPG
                </p>
              </div>
              {selectedFile && (
                <button
                  onClick={handleFileUpload}
                  className="mt-4 w-full px-6 py-3 bg-sky-800 text-white font-semibold rounded-xl hover:bg-sky-900 transition-all"
                >
                  Upload & Parse
                </button>
              )}
            </div>
          </div>

          {/* Text Paste */}
          <div className="card p-8 border-2 border-slate-200 flex flex-col">
            <div className="text-center mb-4">
              <MessageSquare className="w-12 h-12 text-stone-700 mx-auto mb-4" />
              <h3 className="text-xl font-display font-bold text-slate-900 mb-2">
                Paste Text
              </h3>
              <p className="text-slate-600 text-sm">
                Paste your itinerary, email, or document text
              </p>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your itinerary details here..."
              className="flex-1 min-h-48 p-4 border border-slate-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-earth-500 focus:border-transparent text-slate-700"
            />
            {pasteText.trim() && (
              <button
                onClick={handlePasteUpload}
                className="mt-4 w-full px-6 py-3 bg-green-800 text-white font-semibold rounded-xl hover:bg-green-800 transition-all"
              >
                Parse Text
              </button>
            )}
          </div>
        </div>

        {/* Format Tips */}
        <div className="card p-6 bg-blue-50 border border-blue-200">
          <div className="flex gap-4">
            <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-blue-900 mb-2">Pro Tips</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>Works best with cruise confirmations, flight itineraries, and travel agent summaries</li>
                <li>Include dates, times, and location names for best results</li>
                <li>Our AI will ask you to clarify any uncertain details</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
