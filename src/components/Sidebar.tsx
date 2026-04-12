'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Compass, Map, Heart, Settings, Menu, X, ChevronRight, Hexagon, Globe2 } from 'lucide-react';
import { Avatar } from './Avatar';

interface SidebarProps {
  activeTrip?: { id: string; title: string; destination: string; };
  activePage?: string;
  user?: { name: string; avatarUrl?: string; subscriptionTier: 'free' | 'explorer' | 'nomad'; };
}

const tierConfig = {
  free: { label: 'Free', className: 'bg-zinc-700 text-zinc-300' },
  explorer: { label: 'Explorer ✦', className: 'bg-sky-900/60 text-sky-300' },
  nomad: { label: 'Nomad ✦✦', className: 'bg-sky-800/80 text-sky-200' },
};

export const Sidebar: React.FC<SidebarProps> = ({ activeTrip, activePage = 'dashboard', user }) => {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { label: 'Home Base', href: '/dashboard', icon: Compass, id: 'dashboard' },
    { label: 'Adventures', href: '/trips', icon: Map, id: 'trips' },
    { label: 'One Day...', href: '/wishlist', icon: Heart, id: 'wishlist' },
    { label: 'Discover', href: '/discover', icon: Globe2, id: 'discover' },
    { label: 'Settings', href: '/settings', icon: Settings, id: 'settings' },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-sky-800 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">t</span>
          </div>
          <span className="text-white font-display font-bold text-xl tracking-tight">triphive</span>
        </div>
        <p className="text-zinc-500 text-xs mt-2 ml-10">Plan together. Explore better.</p>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px bg-white/5 mb-6" />

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        <p className="label-overline px-3 mb-3" style={{ color: '#52525b' }}>Navigate</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                isActive
                  ? 'bg-green-800/10 text-white border-l-2 border-green-700'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-green-600' : 'group-hover:text-zinc-300'}`} />
              <span className="font-medium text-sm">{item.label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-green-600" />}
            </Link>
          );
        })}
      </nav>

      {/* Active Trip Pill */}
      {activeTrip && (
        <div className="mx-3 mb-4">
          <div className="mx-1 h-px bg-white/5 mb-4" />
          <p className="label-overline px-3 mb-3" style={{ color: '#52525b' }}>In Progress ✈</p>
          <Link
            href={`/trip/${activeTrip.id}/itinerary`}
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-3.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-xl transition-all duration-200 group"
          >
            <div className="w-8 h-8 bg-sky-800/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-sky-600 text-sm">✈</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{activeTrip.title}</p>
              <p className="text-xs text-zinc-500 truncate">{activeTrip.destination}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 flex-shrink-0" />
          </Link>
        </div>
      )}

      {/* User Profile */}
      {user && (
        <div className="mx-3 mb-4">
          <div className="mx-1 h-px bg-white/5 mb-4" />
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer">
            <Avatar src={user.avatarUrl} name={user.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user.name}</p>
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
        style={{ background: '#0C0C0F' }}
        className={`fixed top-0 left-0 w-64 h-screen z-40 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex-shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <NavContent />
      </aside>
    </>
  );
};
