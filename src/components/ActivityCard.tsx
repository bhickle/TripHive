'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Clock,
  DollarSign,
  Share2,
  Mountain,
  Utensils,
  Hotel,
  Plane,
  Compass,
} from 'lucide-react';
import { Activity } from '@/lib/types';

interface ActivityCardProps {
  activity: Activity;
  trackColor?: string;
  showTrackIndicator?: boolean;
  onBooking?: (activityId: string) => void;
  expanded?: boolean;
}

const categoryIcons: Record<string, React.ComponentType<any>> = {
  dining: Utensils,
  food: Utensils,
  accommodation: Hotel,
  transport: Plane,
  experience: Mountain,
  adventure: Mountain,
  nature: Mountain,
  culture: Compass,
  wellness: Compass,
  tour: Compass,
  shopping: Compass,
};

const trackColors = {
  shared: 'bg-blue-100 text-blue-700 border-blue-200',
  track_a: 'bg-purple-100 text-purple-700 border-purple-200',
  track_b: 'bg-pink-100 text-pink-700 border-pink-200',
};

const trackLabels = {
  shared: 'Shared Track',
  track_a: 'Track A',
  track_b: 'Track B',
};

export const ActivityCard: React.FC<ActivityCardProps> = ({
  activity,
  showTrackIndicator = true,
  onBooking,
  expanded: initialExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [selectedAlternative, setSelectedAlternative] = useState<Activity | null>(null);

  const CategoryIcon = categoryIcons[activity.category || ''] || Compass;
  const confidencePercentage = activity.confidence <= 5 ? activity.confidence * 20 : Math.round(activity.confidence * 100);
  const isHighConfidence = activity.confidence >= 4 || activity.confidence >= 0.75;

  const handleBooking = () => {
    if (onBooking) {
      onBooking(activity.id);
    }
    if (activity.bookingUrl) {
      window.open(activity.bookingUrl, '_blank');
    }
  };

  return (
    <div className="space-y-2">
      {/* Main Activity Card */}
      <div className="card overflow-hidden hover:shadow-md transition-all duration-200">
        {/* Track Indicator Bar */}
        {showTrackIndicator && (
          <div
            className={`h-1 w-full ${
              activity.track === 'shared' ? 'bg-blue-500' : activity.track === 'track_a' ? 'bg-purple-500' : 'bg-pink-500'
            }`}
          />
        )}

        {/* Content */}
        <div className="p-4">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              {/* Time and Title */}
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-sm font-medium text-slate-600">
                  {activity.timeSlot}
                </span>
              </div>
              <h3 className="text-base font-semibold text-slate-900">
                {activity.title}
              </h3>
            </div>

            {/* Confidence Badge */}
            <div className="flex items-center space-x-1.5">
              {isHighConfidence ? (
                <div className="flex items-center space-x-1 bg-green-100 px-2 py-1 rounded-full">
                  <CheckCircle2 className="w-4 h-4 text-green-700" />
                  <span className="text-xs font-medium text-green-700">
                    {confidencePercentage}%
                  </span>
                </div>
              ) : (
                <div className="flex items-center space-x-1 bg-sky-100 px-2 py-1 rounded-full">
                  <AlertCircle className="w-4 h-4 text-sky-800" />
                  <span className="text-xs font-medium text-sky-800">
                    {confidencePercentage}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {activity.description && (
            <p className="text-sm text-slate-600 mb-3 line-clamp-2">
              {activity.description}
            </p>
          )}

          {/* Info Row */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3 pt-3 border-t border-slate-200">
            {/* Cost and Category */}
            <div className="flex items-center gap-3">
              {activity.costEstimate > 0 && (
                <div className="flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-sky-700" />
                  <span className="text-sm font-semibold text-sky-700">
                    ${activity.costEstimate}
                  </span>
                </div>
              )}

              {activity.category && (
                <div className="flex items-center gap-1.5 text-slate-600">
                  <CategoryIcon className="w-4 h-4" />
                  <span className="text-xs font-medium capitalize">
                    {activity.category}
                  </span>
                </div>
              )}
            </div>

            {/* Track Badge and Actions */}
            <div className="flex items-center gap-2">
              {showTrackIndicator && (
                <span className={`badge ${trackColors[activity.track]} border`}>
                  {trackLabels[activity.track]}
                </span>
              )}

              {/* Action Buttons */}
              <button
                onClick={() => setExpanded(!expanded)}
                className="btn-ghost p-2"
                aria-expanded={expanded}
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    expanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Booking Button */}
          {activity.bookingUrl && (
            <button
              onClick={handleBooking}
              className="btn-primary text-sm w-full gap-2 justify-center"
            >
              <ExternalLink className="w-4 h-4" />
              Book Now
            </button>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="card-flat p-4 space-y-4">
          {/* Full Description */}
          {activity.description && (
            <div>
              <p className="text-sm text-slate-700">{activity.description}</p>
            </div>
          )}

          {/* Location */}
          {activity.location && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {activity.location.address}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activity.location.lat.toFixed(4)}, {activity.location.lng.toFixed(4)}
                </p>
              </div>
            </div>
          )}

          {/* Alternatives */}
          {activity.alternatives && activity.alternatives.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-900">
                Alternative Options
              </h4>
              {activity.alternatives.map((alt, idx) => (
                <button
                  key={alt.id}
                  onClick={() => setSelectedAlternative(selectedAlternative?.id === alt.id ? null : alt)}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                    selectedAlternative?.id === alt.id
                      ? 'bg-sky-50 border-sky-300'
                      : 'bg-white border-slate-200 hover:border-sky-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        Option {idx + 1}: {alt.title}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        {alt.description}
                      </p>
                    </div>
                    {alt.costEstimate > 0 && (
                      <span className="text-xs font-semibold text-sky-700">
                        ${alt.costEstimate}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Confidence</p>
              <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5">
                <div
                  className={`h-full rounded-full transition-all ${
                    isHighConfidence ? 'bg-green-500' : 'bg-sky-800'
                  }`}
                  style={{ width: `${confidencePercentage}%` }}
                />
              </div>
            </div>
            {activity.verified && (
              <div className="flex items-center gap-1 text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verified</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
