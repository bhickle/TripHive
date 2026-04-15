'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Compass, Map, Radar, Settings, Menu, X, ChevronRight, Globe2 } from 'lucide-react';
import { Avatar } from './Avatar';

interface SidebarProps {
  activeTrip?: { id: string; title: string; destination: string; };
  activePage?: string;
  user?: { name: string; avatarUrl?: string; subscriptionTier: 'free' | 'explorer' | 'nomad'; };
}

const tierConfig = {
  free:     { label: 'Free',        className: 'bg-zinc-200 text-zinc-700' },
  explorer: { label: 'Explorer ✦',  className: 'bg-sky-100 text-sky-800' },
  nomad:    { label: 'Nomad ✦✦',    className: 'bg-orange-100 text-orange-800' },
};

export const Sidebar: React.FC<SidebarProps> = ({ activeTrip, activePage = 'dashboard', user }) => {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { label: 'Home Base',   href: '/dashboard', icon: Compass, id: 'dashboard' },
    { label: 'Adventures',  href: '/trips',     icon: Map,     id: 'trips'     },
    { label: 'On My Radar', href: '/wishlist',  icon: Radar,   id: 'wishlist'  },
    { label: 'Discover',    href: '/discover',  icon: Globe2,  id: 'discover'  },
    { label: 'Settings',    href: '/settings',  icon: Settings, id: 'settings' },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 pt-8 pb-5">
        <Image
          src="/tripcoord_logo.png"
          alt="tripcoord"
          width={160}
          height={56}
          className="w-full h-auto"
          priority
        />
        <p className="text-zinc-500 text-xs mt-2.5 leading-snug">
          Pull the ripcord on group trip chaos.
        </p>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-zinc-900/10 mb-5" />

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        <p className="label-overline px-3 mb-3 text-zinc-400">Navigate</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group border-l-2 ${
                isActive
                  ? 'bg-zinc-900/8 text-zinc-900 border-green-600'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-900/5 border-transparent'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-green-700' : 'text-zinc-400 group-hover:text-zinc-600'}`} />
              <span className="font-medium text-sm">{item.label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-green-700" />}
            </Link>
          );
        })}
      </nav>

      {/* Active Trip Pill */}
      {activeTrip && (
        <div className="mx-3 mb-4">
          <div className="mx-1 h-px bg-zinc-900/10 mb-4" />
          <p className="label-overline px-3 mb-3 text-zinc-400">In Progress ✈</p>
          <Link
            href={`/trip/${activeTrip.id}/itinerary`}
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-3.5 bg-white/60 hover:bg-white/80 border border-zinc-900/10 rounded-xl transition-all duration-200 group"
          >
            <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-sky-700 text-sm">✈</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{activeTrip.title}</p>
              <p className="text-xs text-zinc-500 truncate">{activeTrip.destination}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 flex-shrink-0" />
          </Link>
        </div>
      )}

      {/* User Profile */}
      {user && (
        <div className="mx-3 mb-4">
          <div className="mx-1 h-px bg-zinc-900/10 mb-4" />
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-zinc-900/5 transition-all cursor-pointer">
            <Avatar src={user.avatarUrl} name={user.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{user.name}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-0.5 ${tierConfig[user.subscriptionTier].className}`}>
                {tierConfig[user.subscriptionTier].label}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2.5 bg-zinc-900 rounded-xl text-white shadow-lg"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      )}

      <aside
        style={{ background: '#f5f1e8' }}
        className={`fixed top-0 left-0 w-64 h-screen z-40 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex-shrink-0 border-r border-zinc-900/8 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <NavContent />
      </aside>
    </>
  );
};
