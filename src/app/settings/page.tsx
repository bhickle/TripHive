'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { Avatar } from '@/components/Avatar';
import { currentUser } from '@/data/mock';
import {
  User, Bell, Lock, Download, Trash2, CreditCard, Wifi, Upload, Check, AlertCircle, Settings as SettingsIcon,
  ThumbsUp, MessageSquare, ChevronDown, ChevronUp, Send,
} from 'lucide-react';
import Image from 'next/image';

type ActiveSection = 'profile' | 'persona' | 'subscription' | 'notifications' | 'apps' | 'privacy' | 'downloads';

interface NotificationSettings {
  email: boolean;
  push: boolean;
  tripReminders: boolean;
  voteAlerts: boolean;
  expenseAlerts: boolean;
  marketing: boolean;
}

interface ConnectedApp {
  id: string;
  name: string;
  status: 'connected' | 'disconnected';
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('profile');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPersona, setEditingPersona] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [personaSaved, setPersonaSaved] = useState(false);

  const [profile, setProfile] = useState({
    name: currentUser.name,
    email: currentUser.email,
    avatarUrl: currentUser.avatarUrl,
  });

  const [persona, setPersona] = useState({
    style: currentUser.travelPersona?.style || '',
    groupType: currentUser.travelPersona?.groupType || '',
    priorities: currentUser.travelPersona?.priorities || [],
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    email: true,
    push: true,
    tripReminders: true,
    voteAlerts: true,
    expenseAlerts: true,
    marketing: false,
  });

  // ── Integration voting state ──────────────────────────────────────────────
  interface Integration {
    id: string;
    name: string;
    description: string;
    icon: string;
    votes: number;
  }

  const INTEGRATIONS: Integration[] = [
    { id: 'splitwise',  name: 'Splitwise',  description: 'Sync expenses so splits show up automatically in your trip budget.',    icon: '💸', votes: 34 },
    { id: 'revolut',   name: 'Revolut',    description: 'Pull real-time exchange rates and card transactions into your budget.',  icon: '💳', votes: 28 },
    { id: 'paypal',    name: 'PayPal',     description: 'Pay for trip add-ons and split costs via PayPal balance.',               icon: '🅿️', votes: 19 },
    { id: 'tripit',    name: 'TripIt',     description: 'Import confirmed bookings from TripIt into your itinerary automatically.', icon: '✈️', votes: 41 },
    { id: 'airbnb',    name: 'Airbnb',     description: 'Import Airbnb reservations straight into your accommodation step.',       icon: '🏠', votes: 52 },
    { id: 'google',    name: 'Google Calendar', description: 'Push your itinerary to Google Calendar and get trip reminders.',    icon: '📅', votes: 67 },
    { id: 'spotify',   name: 'Spotify',    description: 'Auto-generate a trip playlist based on the destination vibe.',           icon: '🎵', votes: 23 },
    { id: 'other',     name: 'Something else?', description: "Don't see what you need? Tell us below.",                          icon: '💡', votes: 0 },
  ];

  const LS_KEY = 'tripcoord_integration_votes';

  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>(
    Object.fromEntries(INTEGRATIONS.map(i => [i.id, i.votes]))
  );
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submittedComments, setSubmittedComments] = useState<Set<string>>(new Set());

  // Rehydrate votes from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (!stored) return;
      const ids: string[] = JSON.parse(stored);
      setVotedIds(new Set(ids));
      setVoteCounts(prev => {
        const next = { ...prev };
        ids.forEach(id => { if (next[id] !== undefined) next[id] = prev[id]; });
        return next;
      });
    } catch { /* ignore */ }
  }, []);

  const postVote = (integrationId: string, integrationName: string, action: 'vote' | 'unvote' | 'comment', comment?: string) => {
    fetch('/api/integration-vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId, integrationName, action, comment }),
    }).catch(() => { /* fire-and-forget; UI never blocks on this */ });
  };

  const handleVote = (id: string, name: string) => {
    setVotedIds(prev => {
      const next = new Set(prev);
      let action: 'vote' | 'unvote';
      if (next.has(id)) {
        next.delete(id);
        action = 'unvote';
        setVoteCounts(c => ({ ...c, [id]: c[id] - 1 }));
      } else {
        next.add(id);
        action = 'vote';
        setVoteCounts(c => ({ ...c, [id]: c[id] + 1 }));
      }
      // Persist to localStorage
      try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      postVote(id, name, action);
      return next;
    });
  };

  const handleSubmitComment = (id: string, name: string) => {
    const text = comments[id]?.trim();
    if (!text) return;
    postVote(id, name, 'comment', text);
    setSubmittedComments(prev => new Set(prev).add(id));
    setExpandedComment(null);
  };

  const toggleNotification = (key: keyof NotificationSettings) => {
    setNotifications({ ...notifications, [key]: !notifications[key] });
  };

  const togglePriority = (priority: string) => {
    setPersona({
      ...persona,
      priorities: persona.priorities.includes(priority)
        ? persona.priorities.filter(p => p !== priority)
        : [...persona.priorities, priority]
    });
  };

  const travelStyles = ['Explorer', 'Relaxer', 'Adventurer', 'Culture Seeker', 'Foodie'];
  const groupTypes = ['Solo', 'Couple', 'Friends', 'Family', 'Group Tour'];
  const priorityOptions = ['Food', 'Culture', 'Adventure', 'Nature', 'Wellness', 'Shopping', 'Photography'];

  const SectionButton = ({ section, label, icon: Icon }: { section: ActiveSection; label: string; icon: any }) => (
    <button
      onClick={() => setActiveSection(section)}
      className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all flex items-center space-x-3 ${
        activeSection === section
          ? 'bg-sky-100 text-sky-900'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar activePage="settings" user={currentUser} />

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-display font-bold text-slate-900">Settings</h1>
            <p className="text-slate-600 mt-2">Manage your profile and preferences</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Settings Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2">
                <SectionButton section="profile" label="Profile" icon={User} />
                <SectionButton section="persona" label="Travel Persona" icon={SettingsIcon} />
                <SectionButton section="subscription" label="Subscription" icon={CreditCard} />
                <SectionButton section="notifications" label="Notifications" icon={Bell} />
                <SectionButton section="apps" label="Connected Apps" icon={Wifi} />
                <SectionButton section="privacy" label="Privacy & Data" icon={Lock} />
                <SectionButton section="downloads" label="Downloaded Trips" icon={Download} />
              </div>
            </div>

            {/* Settings Content */}
            <div className="lg:col-span-3">
              {/* PROFILE SECTION */}
              {activeSection === 'profile' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Your Profile</h2>

                  {editingProfile ? (
                    <div className="space-y-6">
                      {/* Avatar Upload */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">Profile Picture</label>
                        <div className="flex items-end space-x-6">
                          <Avatar src={profile.avatarUrl} name={profile.name} size="lg" />
                          <button className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium">
                            <Upload className="w-4 h-4 inline mr-2" />
                            Upload Photo
                          </button>
                        </div>
                      </div>

                      {/* Name Input */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">Full Name</label>
                        <input
                          type="text"
                          value={profile.name}
                          onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                        />
                      </div>

                      {/* Email Input */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">Email</label>
                        <input
                          type="email"
                          value={profile.email}
                          onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                        />
                      </div>

                      {/* Buttons */}
                      <div className="flex space-x-3 pt-4">
                        <button
                          onClick={() => {
                            setEditingProfile(false);
                            setProfileSaved(true);
                            setTimeout(() => setProfileSaved(false), 2000);
                          }}
                          className={`px-6 py-2 rounded-lg transition-all font-semibold ${
                            profileSaved
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-sky-800 text-white hover:bg-sky-900'
                          }`}
                        >
                          {profileSaved ? '✓ Saved!' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => {
                            setProfile({
                              name: currentUser.name,
                              email: currentUser.email,
                              avatarUrl: currentUser.avatarUrl,
                            });
                            setEditingProfile(false);
                          }}
                          className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Display Profile */}
                      <div className="flex items-center justify-between pb-6 border-b border-slate-200">
                        <div className="flex items-center space-x-6">
                          <Avatar src={profile.avatarUrl} name={profile.name} size="lg" />
                          <div>
                            <p className="font-semibold text-slate-900">{profile.name}</p>
                            <p className="text-slate-600">{profile.email}</p>
                            <p className="text-sm text-slate-500 mt-1 capitalize">Nomad tier member</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingProfile(true)}
                          className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TRAVEL PERSONA SECTION */}
              {activeSection === 'persona' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Travel Persona</h2>

                  {editingPersona ? (
                    <div className="space-y-6">
                      {/* Travel Style */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">Travel Style</label>
                        <div className="flex flex-wrap gap-2">
                          {travelStyles.map((style) => (
                            <button
                              key={style}
                              onClick={() => setPersona({ ...persona, style })}
                              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                persona.style === style
                                  ? 'bg-sky-800 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {style}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Group Type */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">Travel With</label>
                        <div className="flex flex-wrap gap-2">
                          {groupTypes.map((type) => (
                            <button
                              key={type}
                              onClick={() => setPersona({ ...persona, groupType: type })}
                              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                persona.groupType === type
                                  ? 'bg-green-800 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Priorities */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">Top Priorities</label>
                        <div className="flex flex-wrap gap-2">
                          {priorityOptions.map((priority) => (
                            <button
                              key={priority}
                              onClick={() => togglePriority(priority)}
                              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                persona.priorities.includes(priority)
                                  ? 'bg-sky-800 text-white'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {priority}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex space-x-3 pt-4">
                        <button
                          onClick={() => {
                            setEditingPersona(false);
                            setPersonaSaved(true);
                            setTimeout(() => setPersonaSaved(false), 2000);
                          }}
                          className={`px-6 py-2 rounded-lg transition-all font-semibold ${
                            personaSaved
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-sky-800 text-white hover:bg-sky-900'
                          }`}
                        >
                          {personaSaved ? '✓ Saved!' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => {
                            setPersona({
                              style: currentUser.travelPersona?.style || '',
                              groupType: currentUser.travelPersona?.groupType || '',
                              priorities: currentUser.travelPersona?.priorities || [],
                            });
                            setEditingPersona(false);
                          }}
                          className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="pb-6 border-b border-slate-200">
                        <p className="text-sm text-slate-600 mb-2">Travel Style</p>
                        <p className="font-semibold text-slate-900 text-lg">{persona.style}</p>
                      </div>
                      <div className="pb-6 border-b border-slate-200">
                        <p className="text-sm text-slate-600 mb-2">Group Type</p>
                        <p className="font-semibold text-slate-900 text-lg">{persona.groupType}</p>
                      </div>
                      <div className="pb-6 border-b border-slate-200">
                        <p className="text-sm text-slate-600 mb-2">Top Priorities</p>
                        <div className="flex flex-wrap gap-2">
                          {persona.priorities.map((p) => (
                            <span key={p} className="px-3 py-1 bg-sky-100 text-sky-900 rounded-full text-sm font-medium">
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingPersona(true)}
                        className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SUBSCRIPTION SECTION */}
              {activeSection === 'subscription' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Subscription</h2>

                  <div className="bg-gradient-earth rounded-lg p-6 text-white mb-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-sm opacity-90">Current Plan</p>
                        <h3 className="text-3xl font-bold">Nomad</h3>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold">$14.99</p>
                        <p className="text-sm opacity-90">/month</p>
                      </div>
                    </div>

                    <button className="px-6 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-semibold transition-all">
                      Manage Subscription
                    </button>
                  </div>

                  {/* Usage Stats */}
                  <div className="mb-6">
                    <h3 className="font-semibold text-slate-900 mb-4">Usage This Month</h3>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-sm font-medium text-slate-700">AI Itinerary Generations</p>
                          <p className="text-sm font-semibold text-slate-900">8/Unlimited</p>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2">
                          <div className="bg-sky-800 h-2 rounded-full" style={{ width: '30%' }}></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4">Plan Features</h3>
                    <ul className="space-y-3">
                      {['Unlimited trips', 'Unlimited travelers', 'Premium AI (faster)', 'Flight price alerts', 'Offline maps', 'AI-organized photo albums', 'Trip narrative generation', 'Travel agent marketplace access', 'Aurora & weather alerts', 'Cruise search add-on (+$4.99/mo)', 'Email support'].map((feature) => (
                        <li key={feature} className="flex items-center space-x-3 text-slate-700">
                          <Check className="w-5 h-5 text-stone-700" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* NOTIFICATIONS SECTION */}
              {activeSection === 'notifications' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Notification Preferences</h2>

                  <div className="space-y-4">
                    {[
                      { key: 'email', label: 'Email Notifications', desc: 'Receive updates via email' },
                      { key: 'push', label: 'Push Notifications', desc: 'Get alerts on your devices' },
                      { key: 'tripReminders', label: 'Trip Reminders', desc: 'Reminders for upcoming trip dates' },
                      { key: 'voteAlerts', label: 'Vote Alerts', desc: 'Notifications for group votes' },
                      { key: 'expenseAlerts', label: 'Expense Alerts', desc: 'Updates on trip expenses' },
                      { key: 'marketing', label: 'Marketing Emails', desc: 'Tips, deals, and new features' },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <p className="font-semibold text-slate-900">{label}</p>
                          <p className="text-sm text-slate-600">{desc}</p>
                        </div>
                        <button
                          onClick={() => toggleNotification(key as keyof NotificationSettings)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
                            notifications[key as keyof NotificationSettings] ? 'bg-sky-800' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all ${
                              notifications[key as keyof NotificationSettings] ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button className="mt-6 px-6 py-2 bg-sky-800 text-white rounded-lg hover:bg-sky-900 transition-all font-semibold">
                    Save Changes
                  </button>
                </div>
              )}

              {/* CONNECTED APPS SECTION */}
              {activeSection === 'apps' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-1">Integrations</h2>
                  <p className="text-sm text-slate-500 mb-6">
                    We're building integrations next — vote for what you want most and we'll prioritise accordingly.
                  </p>

                  <div className="space-y-3">
                    {INTEGRATIONS.sort((a, b) => voteCounts[b.id] - voteCounts[a.id]).map((integration) => {
                      const voted = votedIds.has(integration.id);
                      const isExpanded = expandedComment === integration.id;
                      const submitted = submittedComments.has(integration.id);

                      return (
                        <div
                          key={integration.id}
                          className={`border rounded-xl transition-all ${
                            voted ? 'border-sky-200 bg-sky-50/40' : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-4 p-4">
                            {/* Icon */}
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">
                              {integration.icon}
                            </div>

                            {/* Name + description */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900 text-sm">{integration.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{integration.description}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {/* Comment toggle */}
                              <button
                                onClick={() => setExpandedComment(isExpanded ? null : integration.id)}
                                className={`p-2 rounded-lg transition-colors ${
                                  submitted
                                    ? 'text-emerald-600 bg-emerald-50'
                                    : isExpanded
                                    ? 'text-sky-700 bg-sky-100'
                                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                                title={submitted ? 'Comment sent' : 'Add a comment'}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>

                              {/* Vote button */}
                              <button
                                onClick={() => handleVote(integration.id, integration.name)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                                  voted
                                    ? 'bg-sky-700 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                <ThumbsUp className={`w-3.5 h-3.5 ${voted ? 'fill-white' : ''}`} />
                                <span>{voteCounts[integration.id]}</span>
                              </button>
                            </div>
                          </div>

                          {/* Comment box */}
                          {isExpanded && !submitted && (
                            <div className="px-4 pb-4 flex gap-2">
                              <input
                                type="text"
                                placeholder={`Tell us more about how you'd use ${integration.name}…`}
                                value={comments[integration.id] || ''}
                                onChange={(e) => setComments(prev => ({ ...prev, [integration.id]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment(integration.id, integration.name); }}
                                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 bg-white"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSubmitComment(integration.id, integration.name)}
                                disabled={!comments[integration.id]?.trim()}
                                className="px-3 py-2 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg transition-colors"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            </div>
                          )}

                          {isExpanded && submitted && (
                            <div className="px-4 pb-4">
                              <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5" /> Thanks! We'll factor this in.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-xs text-slate-400 mt-5 leading-relaxed">
                    Votes are anonymous and help us decide what to build next. We'll notify you when an integration you voted for goes live.
                  </p>
                </div>
              )}

              {/* PRIVACY & DATA SECTION */}
              {activeSection === 'privacy' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Privacy & Data</h2>

                  <div className="space-y-4">
                    <div className="p-4 border border-slate-200 rounded-lg hover:border-sky-400 transition-all">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Download Your Data</p>
                          <p className="text-sm text-slate-600 mt-1">Export all your trips, itineraries, and settings as JSON</p>
                        </div>
                        <button className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium">
                          <Download className="w-4 h-4 inline mr-2" />
                          Export
                        </button>
                      </div>
                    </div>

                    <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-red-900">Delete Account</p>
                          <p className="text-sm text-red-700 mt-1">Permanently delete your account and all associated data</p>
                        </div>
                        <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-medium">
                          <Trash2 className="w-4 h-4 inline mr-2" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="p-4 border border-slate-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Cookie Preferences</p>
                          <p className="text-sm text-slate-600 mt-1">Manage which cookies we use on your device</p>
                        </div>
                        <button className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium">
                          Manage
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* DOWNLOADED TRIPS SECTION */}
              {activeSection === 'downloads' && (
                <div className="bg-white rounded-lg border border-slate-200 p-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-6">Downloaded Trips</h2>

                  <div className="space-y-4">
                    <div className="p-4 border border-slate-200 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">Iceland Adventure</p>
                        <p className="text-sm text-slate-600 mt-1">234 MB • Downloaded Sep 15, 2026</p>
                      </div>
                      <button className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-all font-medium">
                        <Trash2 className="w-4 h-4 inline mr-2" />
                        Delete
                      </button>
                    </div>

                    <div className="p-4 border border-slate-200 rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">Tokyo Food Tour</p>
                        <p className="text-sm text-slate-600 mt-1">156 MB • Downloaded Oct 28, 2026</p>
                      </div>
                      <button className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-all font-medium">
                        <Trash2 className="w-4 h-4 inline mr-2" />
                        Delete
                      </button>
                    </div>

                    <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center">
                      <p className="text-slate-600">No more downloaded trips</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
