'use client';

import React, { useState, useMemo } from 'react';
import {
  Plane, Ship, Clock, MapPin, DollarSign, Navigation, AlertCircle,
  Zap, MapPinIcon, TrendingUp, AlertTriangle
} from 'lucide-react';

interface LayoverActivity {
  id: string;
  name: string;
  distance: number;
  duration: number;
  transport: string;
  cost: number;
  category: string;
}

interface FlightLayoverData {
  airport: string;
  airportCode: string;
  arrivalTime: string;
  departureTime: string;
  availableTime: number;
}

interface PortStop {
  city: string;
  dockTime: string;
  allAboardTime: string;
  shoreTime: number;
}

interface ExcursionSuggestion {
  id: string;
  name: string;
  distance: string;
  tier: 'walking' | 'taxi' | 'guided';
  duration: string;
  cost: string;
  description: string;
  viator?: boolean;
}

interface FlightRecommendation {
  title: string;
  subtitle: string;
  activities: Array<string | { name: string; time: string; cost: number }>;
}

export default function LayoverPlannerPage() {
  const [activeMode, setActiveMode] = useState<'flight' | 'cruise'>('flight');

  // Flight layover state
  const [flightLayover, setFlightLayover] = useState<FlightLayoverData>({
    airport: 'Istanbul Airport (IST)',
    airportCode: 'IST',
    arrivalTime: '10:00',
    departureTime: '17:00',
    availableTime: 7,
  });

  // Cruise port state
  const [portStop, setPortStop] = useState<PortStop>({
    city: 'Reykjavik, Iceland',
    dockTime: '08:00',
    allAboardTime: '16:30',
    shoreTime: 8,
  });

  // Flight layover activities based on time
  const flightActivities: LayoverActivity[] = [
    {
      id: 'ist_1',
      name: 'Blue Mosque (Sultanahmet)',
      distance: 45,
      duration: 90,
      transport: 'Taxi + Metro',
      cost: 65,
      category: 'Cultural',
    },
    {
      id: 'ist_2',
      name: 'Grand Bazaar',
      distance: 50,
      duration: 120,
      transport: 'Taxi + Metro',
      cost: 45,
      category: 'Shopping',
    },
    {
      id: 'ist_3',
      name: 'Hagia Sophia',
      distance: 48,
      duration: 75,
      transport: 'Taxi + Metro',
      cost: 55,
      category: 'Cultural',
    },
    {
      id: 'ist_4',
      name: 'Kebab & Turkish Coffee at Sultanahmet',
      distance: 48,
      duration: 45,
      transport: 'Taxi + Walk',
      cost: 18,
      category: 'Food',
    },
  ];

  // Cruise port excursions
  const cruiseExcursions: ExcursionSuggestion[] = [
    // Walking distance
    {
      id: 'rk_walk_1',
      name: 'Hallgrímskirkja Church',
      distance: '15 min walk',
      tier: 'walking',
      duration: '1.5 hours',
      cost: 'Free (tower climb $11)',
      description: 'Iconic landmark with panoramic city views from the tower.',
      viator: false,
    },
    {
      id: 'rk_walk_2',
      name: 'Sun Voyager Sculpture',
      distance: '10 min walk',
      tier: 'walking',
      duration: '30 min',
      cost: 'Free',
      description: 'Iconic harbor sculpture and harborside walk.',
      viator: false,
    },
    {
      id: 'rk_walk_3',
      name: 'Laugavegur Shopping Street',
      distance: '5 min walk',
      tier: 'walking',
      duration: '1-2 hours',
      cost: 'Variable',
      description: 'Main shopping street with local boutiques and cafes.',
      viator: false,
    },
    // Taxi tier
    {
      id: 'rk_taxi_1',
      name: 'Blue Lagoon',
      distance: '45 min by taxi',
      tier: 'taxi',
      duration: '3 hours',
      cost: '$85-120',
      description: 'Famous geothermal spa with mineral-rich waters.',
      viator: true,
    },
    {
      id: 'rk_taxi_2',
      name: 'Whale Watching from Old Harbour',
      distance: '10 min from dock',
      tier: 'taxi',
      duration: '2.5 hours',
      cost: '$85',
      description: 'Sail in search of minke whales, dolphins, and puffins.',
      viator: true,
    },
    // Excursion tier
    {
      id: 'rk_guided_1',
      name: 'Golden Circle Express Tour',
      distance: 'Full day',
      tier: 'guided',
      duration: '6 hours',
      cost: '$95',
      description: 'Þingvellir, Geysir, and Gullfoss with expert guide and lunch.',
      viator: true,
    },
  ];

  // Calculate available time for flight layover
  const calculateFlightAvailableTime = (arrival: string, departure: string) => {
    const [arrH, arrM] = arrival.split(':').map(Number);
    const [depH, depM] = departure.split(':').map(Number);
    const arrivalMinutes = arrH * 60 + arrM;
    const departureMinutes = depH * 60 + depM;
    const diff = departureMinutes - arrivalMinutes;
    const bufferMinutes = 90; // Security and transit buffer
    return Math.max(0, Math.floor((diff - bufferMinutes) / 60));
  };

  // Calculate shore time for cruise
  const calculateShoreTime = (dock: string, allAboard: string) => {
    const [dockH, dockM] = dock.split(':').map(Number);
    const [boardH, boardM] = allAboard.split(':').map(Number);
    const dockMinutes = dockH * 60 + dockM;
    const boardMinutes = boardH * 60 + boardM;
    const diff = boardMinutes - dockMinutes;
    const bufferMinutes = 30; // Safety buffer
    return Math.max(0, Math.floor((diff - bufferMinutes) / 60));
  };

  const actualFlightTime = useMemo(
    () => calculateFlightAvailableTime(flightLayover.arrivalTime, flightLayover.departureTime),
    [flightLayover.arrivalTime, flightLayover.departureTime]
  );

  const actualShoreTime = useMemo(
    () => calculateShoreTime(portStop.dockTime, portStop.allAboardTime),
    [portStop.dockTime, portStop.allAboardTime]
  );

  // Determine flight itinerary tier
  const getFlightTier = (hours: number) => {
    if (hours < 2) return 'minimal';
    if (hours < 4) return 'airport';
    if (hours < 8) return 'quick';
    return 'full';
  };

  const flightTier = getFlightTier(actualFlightTime);

  // Filter activities based on tier
  const getFlightRecommendations = (): FlightRecommendation[] => {
    const recommendations: FlightRecommendation[] = [];

    if (flightTier === 'airport') {
      recommendations.push({
        title: 'Airport Only',
        subtitle: 'Best for quick breaks',
        activities: [
          'Airport lounge with showers',
          'Duty-free shopping',
          'Turkish coffee and snacks',
        ],
      });
    } else if (flightTier === 'quick') {
      recommendations.push({
        title: 'Quick City Visit',
        subtitle: '1-2 nearby attractions',
        activities: [
          { name: 'Kebab & Turkish Coffee', time: '45 min', cost: 18 },
          { name: 'Grand Bazaar Quick Walk', time: '60 min', cost: 45 },
        ],
      });
    } else if (flightTier === 'full') {
      recommendations.push({
        title: 'Full Day Out',
        subtitle: '3-4 activities + transport',
        activities: [
          { name: 'Blue Mosque', time: '90 min', cost: 65 },
          { name: 'Hagia Sophia', time: '75 min', cost: 55 },
          { name: 'Turkish Lunch', time: '45 min', cost: 25 },
          { name: 'Grand Bazaar', time: '120 min', cost: 45 },
        ],
      });
    }

    return recommendations;
  };

  const flightRecommendations = getFlightRecommendations();

  // Filter cruise excursions by tier
  const walkingExcursions = cruiseExcursions.filter(e => e.tier === 'walking');
  const taxiExcursions = cruiseExcursions.filter(e => e.tier === 'taxi');
  const guidedExcursions = cruiseExcursions.filter(e => e.tier === 'guided');

  return (
    <div className="min-h-screen bg-gradient-subtle p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Plane className="w-8 h-8 text-sky-700" />
            <Ship className="w-8 h-8 text-stone-700" />
            <h1 className="text-4xl font-display font-bold text-slate-900">
              Layover & Port Stop Planner
            </h1>
          </div>
          <p className="text-slate-600 text-lg">
            Make the most of your connection or port stop with tailored itineraries
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-3 mb-8">
          <button
            onClick={() => setActiveMode('flight')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
              activeMode === 'flight'
                ? 'bg-sky-800 text-white shadow-md'
                : 'bg-white border border-sky-200 text-sky-700 hover:bg-sky-50'
            }`}
          >
            <Plane className="w-5 h-5" />
            Flight Layover
          </button>
          <button
            onClick={() => setActiveMode('cruise')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
              activeMode === 'cruise'
                ? 'bg-green-800 text-white shadow-md'
                : 'bg-white border border-stone-200 text-stone-700 hover:bg-parchment'
            }`}
          >
            <Ship className="w-5 h-5" />
            Cruise Port Stop
          </button>
        </div>

        {/* Flight Layover Mode */}
        {activeMode === 'flight' && (
          <div className="space-y-6">
            {/* Input Card */}
            <div className="card p-6">
              <h2 className="text-xl font-display font-bold text-slate-900 mb-6">
                Layover Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Airport
                  </label>
                  <input
                    type="text"
                    value={flightLayover.airport}
                    onChange={(e) => setFlightLayover({...flightLayover, airport: e.target.value})}
                    className="input-field"
                    placeholder="e.g., Istanbul Airport (IST)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Arrival Time
                  </label>
                  <input
                    type="time"
                    value={flightLayover.arrivalTime}
                    onChange={(e) => setFlightLayover({...flightLayover, arrivalTime: e.target.value})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Departure Time
                  </label>
                  <input
                    type="time"
                    value={flightLayover.departureTime}
                    onChange={(e) => setFlightLayover({...flightLayover, departureTime: e.target.value})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Available Time
                  </label>
                  <div className="flex items-center gap-2 p-3 bg-sky-50 rounded-xl border border-sky-200">
                    <Clock className="w-5 h-5 text-sky-700" />
                    <span className="font-semibold text-sky-900">{actualFlightTime}h</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    (Minus 1.5hr buffer for security/transit)
                  </p>
                </div>
              </div>
            </div>

            {/* Time-Based Recommendations */}
            <div className="space-y-4">
              {flightTier === 'minimal' && (
                <div className="card p-6 border-2 border-sky-200 bg-sky-50">
                  <div className="flex gap-4">
                    <AlertTriangle className="w-6 h-6 text-sky-700 flex-shrink-0 mt-1" />
                    <div>
                      <h3 className="font-semibold text-sky-900 mb-2">Tight Connection</h3>
                      <p className="text-sky-900 text-sm">
                        With less than 2 hours, we recommend staying in the airport. Focus on rest, food, and duty-free shopping.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {flightRecommendations.map((rec, idx) => (
                <div key={idx} className="card p-6 border-l-4 border-l-ocean-500">
                  <div className="mb-4">
                    <h3 className="text-xl font-display font-bold text-slate-900">
                      {rec.title}
                    </h3>
                    <p className="text-slate-600 text-sm">{rec.subtitle}</p>
                  </div>

                  {rec.activities.every(a => typeof a === 'string') ? (
                    <ul className="space-y-2">
                      {(rec.activities as string[]).map((activity, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <Zap className="w-4 h-4 text-sky-600 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-700">{activity}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(rec.activities as Array<{ name: string; time: string; cost: number }>).map((activity, i) => (
                        <div key={i} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                          <h4 className="font-semibold text-slate-900 mb-2">{activity.name}</h4>
                          <div className="flex items-center gap-4 text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {activity.time}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              ${activity.cost}
                            </span>
                          </div>
                          <button className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-800 text-white rounded-lg hover:bg-sky-900 transition-all text-sm font-semibold">
                            <Navigation className="w-4 h-4" />
                            Navigate
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Available Activities */}
            <div className="card p-6">
              <h3 className="text-xl font-display font-bold text-slate-900 mb-6">
                Top Attractions Near {flightLayover.airportCode}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {flightActivities.map((activity) => (
                  <div key={activity.id} className="p-4 border border-slate-200 rounded-lg hover:border-sky-300 hover:shadow-md transition-all">
                    <h4 className="font-semibold text-slate-900 mb-3">{activity.name}</h4>
                    <div className="space-y-2 text-sm text-slate-600 mb-4">
                      <div className="flex items-center gap-2">
                        <MapPinIcon className="w-4 h-4 text-sky-700" />
                        <span>{activity.distance} min from airport</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-sky-700" />
                        <span>{activity.duration} min visit</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-sky-700" />
                        <span>{activity.transport}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-sky-700" />
                        <span>${activity.cost}</span>
                      </div>
                    </div>
                    <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sky-100 text-sky-800 rounded-lg hover:bg-sky-200 transition-all font-semibold">
                      <Navigation className="w-4 h-4" />
                      Navigate
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Cruise Port Stop Mode */}
        {activeMode === 'cruise' && (
          <div className="space-y-6">
            {/* Input Card */}
            <div className="card p-6">
              <h2 className="text-xl font-display font-bold text-slate-900 mb-6">
                Port Stop Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Port City
                  </label>
                  <input
                    type="text"
                    value={portStop.city}
                    onChange={(e) => setPortStop({...portStop, city: e.target.value})}
                    className="input-field"
                    placeholder="e.g., Reykjavik, Iceland"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Dock Time
                  </label>
                  <input
                    type="time"
                    value={portStop.dockTime}
                    onChange={(e) => setPortStop({...portStop, dockTime: e.target.value})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    All-Aboard Time
                  </label>
                  <input
                    type="time"
                    value={portStop.allAboardTime}
                    onChange={(e) => setPortStop({...portStop, allAboardTime: e.target.value})}
                    className="input-field"
                  />
                </div>
              </div>
            </div>

            {/* All-Aboard Warning */}
            <div className="card p-6 border-2 border-red-200 bg-red-50">
              <div className="flex gap-4">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-2">
                    All-Aboard: {portStop.allAboardTime}
                  </h3>
                  <p className="text-red-800 text-sm">
                    Don't be late! Ship departs promptly. Plan to be back with {Math.ceil((actualShoreTime / 4))} hours to spare.
                  </p>
                </div>
              </div>
            </div>

            {/* Shore Time Summary */}
            <div className="card p-6 border-l-4 border-l-earth-500 bg-parchment">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-6 h-6 text-stone-700" />
                <div>
                  <p className="text-sm text-slate-600">Available Shore Time</p>
                  <p className="text-3xl font-display font-bold text-stone-900">
                    {actualShoreTime} hours
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    (With 30-min safety buffer)
                  </p>
                </div>
              </div>
            </div>

            {/* Excursion Tiers */}
            <div className="space-y-6">
              {/* Walking Distance */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <MapPin className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-bold text-slate-900">
                      Within Walking Distance
                    </h3>
                    <p className="text-sm text-slate-600">15-min walk from port</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {walkingExcursions.map((exc) => (
                    <div key={exc.id} className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <h4 className="font-semibold text-slate-900">{exc.name}</h4>
                        <span className="badge-blue text-xs">{exc.tier === 'walking' ? 'Walking' : ''}</span>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{exc.description}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-600 mb-3">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {exc.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> {exc.cost}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Taxi Distance */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-bold text-slate-900">
                      Quick Taxi Rides
                    </h3>
                    <p className="text-sm text-slate-600">15-30 min by taxi/shuttle</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {taxiExcursions.map((exc) => (
                    <div key={exc.id} className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <h4 className="font-semibold text-slate-900">{exc.name}</h4>
                        {exc.viator && (
                          <span className="badge bg-sky-100 text-sky-800 text-xs">Viator</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{exc.description}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-600 mb-3">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {exc.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> {exc.cost}
                        </span>
                      </div>
                      <button className="w-full px-4 py-2 bg-sky-900 text-white rounded-lg hover:bg-sky-900 transition-all text-sm font-semibold">
                        Book Shore Excursion
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Guided Excursions */}
              <div className="card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Ship className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-bold text-slate-900">
                      Full Day Excursions
                    </h3>
                    <p className="text-sm text-slate-600">Guided tours & full experiences</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {guidedExcursions.map((exc) => (
                    <div key={exc.id} className="p-4 border border-green-200 bg-green-50 rounded-lg">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <h4 className="font-semibold text-slate-900">{exc.name}</h4>
                        {exc.viator && (
                          <span className="badge bg-green-100 text-green-700 text-xs font-semibold">
                            Viator
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{exc.description}</p>
                      <div className="flex flex-wrap gap-3 text-sm text-slate-600 mb-4">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" /> {exc.duration}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" /> {exc.cost}
                        </span>
                      </div>
                      <button className="w-full px-4 py-2 bg-green-800 text-white rounded-lg hover:bg-green-800 transition-all font-semibold">
                        Book Shore Excursion
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
