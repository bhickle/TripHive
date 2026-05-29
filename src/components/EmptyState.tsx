import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/**
 * Shared empty state used across collaborative + list surfaces (chat, votes,
 * expenses, packing, flights, community feed, etc.).
 *
 * Design: white rounded-2xl card with border-zinc-100, centered icon in a
 * zinc-100 chip, semibold zinc-700 title, zinc-500 body, optional sky-800
 * rounded-full CTA. Lifted from the 2026-05-29 design audit which found
 * six visually different empty-state patterns and recommended this one as
 * the canonical version.
 *
 * Use over hand-coded empty markup any time a list / table / grid has
 * nothing to show. The Group Votes inviting-card pattern (with starter
 * prompts) is a richer variant; this is the bread-and-butter case.
 */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional primary action — internal route or external href. */
  cta?: { label: string; href: string; external?: boolean };
  /** Optional inline action button (handler, no nav). */
  action?: { label: string; onClick: () => void };
  /** Compact = less vertical padding for in-tab use. Default = roomy. */
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  cta,
  action,
  compact = false,
}) => (
  <div
    className={`bg-white rounded-2xl border border-zinc-100 text-center ${compact ? 'p-6' : 'p-10'}`}
  >
    <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
      <Icon className="w-6 h-6 text-zinc-400" />
    </div>
    <p className="font-semibold text-zinc-700 mb-1">{title}</p>
    {description && <p className="text-sm text-zinc-500 max-w-sm mx-auto">{description}</p>}
    {cta && (
      cta.external ? (
        <a
          href={cta.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-full text-sm transition-all shadow-sm"
        >
          {cta.label}
        </a>
      ) : (
        <Link
          href={cta.href}
          className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-full text-sm transition-all shadow-sm"
        >
          {cta.label}
        </Link>
      )
    )}
    {action && (
      <button
        onClick={action.onClick}
        className="mt-5 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-full text-sm transition-all shadow-sm"
      >
        {action.label}
      </button>
    )}
  </div>
);
