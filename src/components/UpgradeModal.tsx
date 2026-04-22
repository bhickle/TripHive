'use client';

import React from 'react';
import Link from 'next/link';
import { X, Lock, Sparkles, ArrowRight } from 'lucide-react';
import { UpgradePrompt } from '@/hooks/useEntitlements';

interface UpgradeModalProps {
  prompt: UpgradePrompt;
  onClose: () => void;
}

export function UpgradeModal({ prompt, onClose }: UpgradeModalProps) {
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

        {/* CTAs */}
        <div className="flex flex-col gap-2">
          <Link
            href="/pricing"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-3 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-full transition-all text-sm"
          >
            <Sparkles className="w-4 h-4" />
            {prompt.ctaLabel}
            <ArrowRight className="w-4 h-4" />
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
