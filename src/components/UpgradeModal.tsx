'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { X, Lock, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { UpgradePrompt, PRICING } from '@/hooks/useEntitlements';
import { STRIPE_PRICES } from '@/lib/stripe-prices';

interface UpgradeModalProps {
  prompt: UpgradePrompt;
  onClose: () => void;
  /** When provided, renders a "Buy a Pass for this trip" CTA that purchases
   *  a Trip Pass keyed to this trip ID. Without it, the modal falls back to
   *  the generic /pricing link. */
  tripId?: string;
  /** Used to compute the Trip Pass price (base + extra-people upsell) so the
   *  buyer sees the real total before clicking through to Stripe. Falls back
   *  to the base-group-size price when omitted. */
  tripGroupSize?: number;
}

export function UpgradeModal({ prompt, onClose, tripId, tripGroupSize }: UpgradeModalProps) {
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Trip Pass pricing math — base $30 + $4 per traveler beyond the first 6,
  // capped at maxGroupSize (12). Extra-people line items are added by the
  // checkout route based on the same `extraPeople` count we send here.
  const basePrice = PRICING.trip_pass.base;
  const extraFee = PRICING.trip_pass.extraPersonFee;
  const baseGroup = PRICING.trip_pass.baseGroupSize;
  const groupSize = Math.min(tripGroupSize ?? baseGroup, PRICING.trip_pass.maxGroupSize);
  const extraPeople = Math.max(0, groupSize - baseGroup);
  const totalPrice = basePrice + extraPeople * extraFee;

  const handleTripPassPurchase = async () => {
    if (!tripId) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: STRIPE_PRICES.trip_pass.base,
          mode: 'payment',
          tripId,
          extraPeople,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPurchaseError(data.error ?? 'Could not start checkout. Please try again.');
        setPurchasing(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setPurchaseError('Could not start checkout. Please check your connection.');
      setPurchasing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-800 to-green-700 flex items-center justify-center mb-5 shadow-md">
          <Lock className="w-6 h-6 text-white" />
        </div>

        {/* Copy */}
        <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-2">{prompt.headline}</h2>
        <p className="text-zinc-500 text-sm leading-relaxed mb-6">{prompt.body}</p>

        {purchaseError && (
          <div className="mb-4 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-xs text-rose-700">{purchaseError}</p>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2">
          {tripId && (
            <button
              onClick={handleTripPassPurchase}
              disabled={purchasing}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-full transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {purchasing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {purchasing
                ? 'Starting checkout…'
                : `Buy a Trip Pass for this trip — $${totalPrice}`}
            </button>
          )}
          {tripId && (
            <p className="text-[11px] text-zinc-400 text-center -mt-1 mb-1">
              {extraPeople > 0
                ? `Base $${basePrice} + ${extraPeople} extra ${extraPeople === 1 ? 'traveler' : 'travelers'} × $${extraFee}`
                : `Up to ${baseGroup} travelers · one-time, no subscription`}
            </p>
          )}
          <Link
            href="/pricing"
            onClick={onClose}
            className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-full transition-all text-sm ${
              tripId
                ? 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                : 'bg-sky-800 hover:bg-sky-900 text-white'
            }`}
          >
            {!tripId && <Sparkles className="w-4 h-4" />}
            {tripId ? 'See all plans' : prompt.ctaLabel}
            {!tripId && <ArrowRight className="w-4 h-4" />}
          </Link>
          <button
            onClick={onClose}
            className="w-full py-3 text-zinc-500 hover:text-zinc-700 text-sm font-medium transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inline lock badge — use on buttons that are gated ───────────────────────
export function LockBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full uppercase tracking-wide ${className}`}>
      <Lock className="w-2.5 h-2.5" />
      Upgrade
    </span>
  );
}
