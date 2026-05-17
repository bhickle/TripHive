'use client';

import { useState } from 'react';
import { X, Copy, Check, Mail, Share2 } from 'lucide-react';

interface ShareTripModalProps {
  tripId: string;
  tripName: string;
  destination?: string;
  onClose: () => void;
}

/**
 * Quick share affordance for a trip. Surfaces three actions:
 *   1. Copy link (the join URL — works for both invitees and members)
 *   2. iMessage / SMS (mailto-style sms: link works on iOS)
 *   3. WhatsApp (universal native + web)
 *   4. Twitter / X intent URL
 *
 * Uses the /join/[id] link rather than /trip/[id]/itinerary so non-members
 * who tap the link land on the join flow (the itinerary URL would 403 for
 * non-members). For members, /join redirects to the itinerary automatically.
 */
export function ShareTripModal({ tripId, tripName, destination, onClose }: ShareTripModalProps) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${tripId}`
    : `https://www.tripcoord.ai/join/${tripId}`;
  // Short, friendly message that works for SMS/WhatsApp/Twitter all the same.
  // Quote-friendly: no curly apostrophes that some SMS clients mangle.
  const messageText = destination
    ? `I'm planning a trip to ${destination} on TripCoord — want to join?`
    : `I'm planning a trip on TripCoord — want to join?`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers — fall back to a select+execCommand or just silently fail.
      // Modern devices all support clipboard; skip the fallback complexity.
    }
  };

  const handleNativeShare = async () => {
    // Web Share API works on iOS Safari, Android Chrome, and some desktops.
    // Falls through to no-op if unsupported — the other buttons cover that case.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: tripName, text: messageText, url });
      } catch {
        // User cancelled or share failed — non-error path.
      }
    }
  };

  const smsUrl = `sms:?&body=${encodeURIComponent(`${messageText} ${url}`)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${messageText} ${url}`)}`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(messageText)}&url=${encodeURIComponent(url)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(`Join my trip — ${tripName}`)}&body=${encodeURIComponent(`${messageText}\n\n${url}`)}`;

  const hasNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share trip"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 flex items-start justify-between">
          <div>
            <h2 className="font-script italic text-xl font-semibold text-zinc-900">Share this trip</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Anyone with the link can join.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-3">
          {/* Copy link — the high-leverage action; gets primary visual weight */}
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-colors"
          >
            <span className="text-sm text-zinc-700 truncate text-left flex-1">{url}</span>
            <span className="flex items-center gap-1.5 flex-shrink-0">
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-zinc-500" />}
              <span className={`text-xs font-semibold ${copied ? 'text-emerald-600' : 'text-zinc-600'}`}>
                {copied ? 'Copied!' : 'Copy'}
              </span>
            </span>
          </button>

          {/* Native share — mobile devices get the OS share sheet which covers
              every messaging app the user has installed. Hidden on desktop
              browsers where Web Share API typically isn't supported. */}
          {hasNativeShare && (
            <button
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-2 py-3 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-full text-sm transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share via…
            </button>
          )}

          {/* Direct-link share buttons — explicit options for desktop users
              and as a fallback when native share isn't available. */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <a
              href={smsUrl}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-semibold text-xs rounded-xl transition-colors"
            >
              <span className="text-base">💬</span>
              Messages
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-semibold text-xs rounded-xl transition-colors"
            >
              <span className="text-base">📱</span>
              WhatsApp
            </a>
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-semibold text-xs rounded-xl transition-colors"
            >
              <span className="text-base">𝕏</span>
              Twitter
            </a>
            <a
              href={emailUrl}
              className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-semibold text-xs rounded-xl transition-colors"
            >
              <Mail className="w-3.5 h-3.5" />
              Email
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
