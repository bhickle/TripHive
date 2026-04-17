'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, UserPlus, Copy, Check, Map, Sparkles, Users, CheckSquare, Camera } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationPanel';

interface TopBarProps {
  tripTitle: string;
  destination: string;
  activeTab?: 'itinerary' | 'discover' | 'group' | 'prep' | 'memories';
  onTabChange?: (tab: 'itinerary' | 'discover' | 'group' | 'prep' | 'memories') => void;
  onInvite?: () => void;
  tripId?: string;
  showBackButton?: boolean;
}

const tabs = [
  { id: 'itinerary', label: 'The Plan', Icon: Map },
  { id: 'discover', label: "What's Out There", Icon: Sparkles },
  { id: 'group', label: 'Group', Icon: Users },
  { id: 'prep', label: "Don't Forget", Icon: CheckSquare },
  { id: 'memories', label: 'The Pics', Icon: Camera },
] as const;

export const TopBar: React.FC<TopBarProps> = ({
  tripTitle, destination, activeTab = 'itinerary', onTabChange, onInvite, tripId, showBackButton = true,
}) => {
  const [inviteCopied, setInviteCopied] = useState(false);

  const handleInvite = () => {
    if (onInvite) onInvite();
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-zinc-100 shadow-sm">
      <div className="px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {showBackButton && (
            <Link href="/dashboard" className="p-2 rounded-xl hover:bg-zinc-100 transition-colors flex-shrink-0" title="Back to dashboard">
              <ArrowLeft className="w-5 h-5 text-zinc-600" />
            </Link>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-script italic text-lg font-semibold text-zinc-900 truncate leading-tight">{tripTitle}</h1>
            <div className="flex items-center gap-1.5 mt-0.5 text-zinc-500">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="font-script italic text-sm truncate">{destination}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <NotificationBell />
          <button
            onClick={handleInvite}
            className="inline-flex items-center gap-2 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-sm px-4 py-2 rounded-full shadow-sm hover:shadow-md transition-all"
          >
            {inviteCopied ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            <span className="hidden sm:inline">{inviteCopied ? 'Copied! ✓' : 'Add Someone'}</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-6 border-t border-zinc-50 flex items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const { Icon } = tab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange?.(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 py-3 px-3 border-b-2 font-medium text-sm transition-all duration-200 whitespace-nowrap ${
                isActive
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
