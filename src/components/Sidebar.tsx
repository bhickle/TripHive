'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Compass, Map, Radar, Settings, Menu, X, ChevronRight, Globe2, LogOut } from 'lucide-react';
import { Avatar } from './Avatar';
import { useAuth } from '@/context/AuthContext';

interface SidebarProps {
  activeTrip?: { id: string; title: string; destination: string; };
  activePage?: string;
  user?: { name: string; avatarUrl?: string; subscriptionTier: 'free' | 'trip_pass' | 'explorer' | 'nomad'; };
}

const tierConfig = {
  free:      { label: 'Free',        className: 'bg-white/10 text-parchment/70' },
  trip_pass: { label: 'Trip Pass ✦', className: 'bg-sky-500/20 text-sky-300' },
  explorer:  { label: 'Explorer ✦',  className: 'bg-sky-500/20 text-sky-300' },
  nomad:     { label: 'Nomad ✦✦',    className: 'bg-orange-500/20 text-orange-300' },
};

export const Sidebar: React.FC<SidebarProps> = ({ activeTrip, activePage = 'dashboard', user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { signOut } = useAuth();
  const router = useRouter();

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
    router.push('/');
  };

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
        <p className="text-xs mt-2.5 leading-snug" style={{ color: 'rgba(245,241,232,0.4)' }}>
          Pull the ripcord on group trip chaos.
        </p>
      </div>

      {/* Divider */}
      <div className="mx-6 h-px mb-5" style={{ background: 'rgba(255,255,255,0.08)' }} />

      {/* Main Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        <p className="font-script italic text-[12px] font-semibold px-3 mb-3 tracking-wide" style={{ color: 'rgba(245,241,232,0.35)' }}>Navigate</p>
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
                  ? 'border-green-500'
                  : 'border-transparent'
              }`}
              style={{
                background: isActive ? 'rgba(245,241,232,0.09)' : undefined,
                color: isActive ? '#f5f1e8' : 'rgba(245,241,232,0.55)',
              }}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-green-400' : 'text-parchment/30 group-hover:text-parchment/60'}`}
                style={{ color: isActive ? '#4ade80' : undefined }} />
              <span className="font-semibold text-sm">{item.label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto" style={{ color: '#4ade80' }} />}
            </Link>
          );
        })}
      </nav>

      {/* Active Trip Pill */}
      {activeTrip && (
        <div className="mx-3 mb-4">
          <div className="mx-1 h-px mb-4" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <p className="font-script italic text-[12px] font-semibold px-3 mb-3 tracking-wide" style={{ color: 'rgba(245,241,232,0.35)' }}>In Progress ✈</p>
          <Link
            href={`/trip/${activeTrip.id}/itinerary`}
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 group"
            style={{ background: 'rgba(245,241,232,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,241,232,0.12)' }}>
              <span className="text-sm">✈</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#f5f1e8' }}>{activeTrip.title}</p>
              <p className="text-xs truncate" style={{ color: 'rgba(245,241,232,0.45)' }}>{activeTrip.destination}</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'rgba(245,241,232,0.35)' }} />
          </Link>
        </div>
      )}

      {/* User Profile */}
      {user && (
        <div className="mx-3 mb-4" ref={userMenuRef}>
          <div className="mx-1 h-px mb-4" style={{ background: 'rgba(255,255,255,0.08)' }} />

          {/* Sign-out / Settings popover */}
          {showUserMenu && (
            <div
              className="mb-2 mx-1 rounded-xl overflow-hidden shadow-xl"
              style={{ background: '#3a3330', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Link
                href="/settings"
                onClick={() => { setShowUserMenu(false); setIsOpen(false); }}
                className="flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all"
                style={{ color: 'rgba(245,241,232,0.8)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,241,232,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Settings className="w-4 h-4 flex-shrink-0" />
                Settings
              </Link>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all text-left"
                style={{ color: 'rgba(245,100,100,0.9)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,241,232,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <LogOut className="w-4 h-4 flex-shrink-0" />
                Sign Out
              </button>
            </div>
          )}

          <button
            onClick={() => setShowUserMenu(prev => !prev)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,241,232,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = showUserMenu ? 'rgba(245,241,232,0.05)' : 'transparent')}
            style={{ background: showUserMenu ? 'rgba(245,241,232,0.05)' : 'transparent' }}
          >
            <Avatar src={user.avatarUrl} name={user.name} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: '#f5f1e8' }}>{user.name}</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mt-0.5 ${tierConfig[user.subscriptionTier].className}`}>
                {tierConfig[user.subscriptionTier].label}
              </span>
            </div>
            <ChevronRight
              className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
              style={{ color: 'rgba(245,241,232,0.3)', transform: showUserMenu ? 'rotate(90deg)' : 'rotate(0deg)' }}
            />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl text-white shadow-lg"
        style={{ background: '#2c2826' }}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {isOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
      )}

      <aside
        style={{ background: '#2c2826', borderRight: '1px solid rgba(255,255,255,0.06)' }}
        className={`fixed top-0 left-0 w-64 h-screen z-40 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 flex-shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <NavContent />
      </aside>
    </>
  );
};
