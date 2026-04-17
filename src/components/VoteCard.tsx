'use client';

import React, { useState } from 'react';
import { CheckCircle2, Clock, Users } from 'lucide-react';
import { GroupVote } from '@/lib/types';

interface VoteCardProps {
  vote: GroupVote;
  userHasVoted?: boolean;
  onVote?: (optionId: string) => void;
  showVoters?: boolean;
}

export const VoteCard: React.FC<VoteCardProps> = ({
  vote,
  userHasVoted = false,
  onVote,
  showVoters = false,
}) => {
  const [showVotersList, setShowVotersList] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  const totalVotes = vote.options.reduce((sum, opt) => sum + opt.votes, 0);
  const isOpen = vote.status === 'open';

  const formatClosesAt = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const hoursLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60));

    if (hoursLeft < 0) return 'Closed';
    if (hoursLeft < 1) return 'Closes in minutes';
    if (hoursLeft === 1) return 'Closes in 1 hour';
    return `Closes in ${hoursLeft}h`;
  };

  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">
            {vote.title}
          </h3>
          <div className="flex items-center gap-2 mt-2 text-xs text-slate-600">
            <Users className="w-3.5 h-3.5" />
            <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {isOpen ? (
            <>
              <Clock className="w-4 h-4 text-sky-700" />
              <span className="badge badge-amber">
                {vote.closesAt ? formatClosesAt(vote.closesAt) : 'Open'}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="badge bg-green-100 text-green-700">Closed</span>
            </>
          )}
        </div>
      </div>

      {/* Voting Options */}
      <div className="space-y-3">
        {vote.options.map((option) => {
          const percentage = totalVotes > 0 ? (option.votes / totalVotes) * 100 : 0;
          const isSelected = option.voters?.includes('current-user-id');

          return (
            <div
              key={option.id}
              className="space-y-1.5"
              onMouseEnter={() => setHoveredOption(option.id)}
              onMouseLeave={() => setHoveredOption(null)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900">
                  {option.label}
                </span>
                <span className="text-xs font-semibold text-slate-600">
                  {option.votes}
                  {totalVotes > 0 && ` (${Math.round(percentage)}%)`}
                </span>
              </div>

              {/* Vote Bar */}
              <div
                className={`relative h-8 bg-slate-100 rounded-lg overflow-hidden transition-all ${
                  hoveredOption === option.id ? 'ring-2 ring-ocean-300' : ''
                }`}
              >
                {/* Progress Fill */}
                <div
                  className={`h-full flex items-center px-3 transition-all duration-300 ${
                    percentage > 0
                      ? isSelected
                        ? 'bg-gradient-earth'
                        : 'bg-gradient-to-r from-sky-800 to-green-800'
                      : ''
                  }`}
                  style={{ width: `${Math.max(percentage, 5)}%` }}
                >
                  {percentage > 15 && (
                    <span className="text-xs font-bold text-white">
                      {Math.round(percentage)}%
                    </span>
                  )}
                </div>

                {/* Vote Button (if open and hovered) */}
                {isOpen && hoveredOption === option.id && (
                  <button
                    onClick={() => onVote?.(option.id)}
                    disabled={userHasVoted}
                    className="absolute inset-0 w-full h-full hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    title={userHasVoted ? 'You have already voted' : 'Click to vote'}
                  >
                    <span className="text-xs font-semibold text-sky-700 opacity-0 group-hover:opacity-100">
                      Vote
                    </span>
                  </button>
                )}
              </div>

              {/* Voter Names (if available and option has votes) */}
              {showVoters && option.voters && option.voters.length > 0 && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowVotersList(showVotersList ? false : true)}
                    className="text-xs text-sky-700 hover:text-sky-800 font-medium"
                  >
                    {option.voters.length} voter{option.voters.length !== 1 ? 's' : ''}
                  </button>
                  {showVotersList && (
                    <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-200">
                      {option.voters.map((voter, idx) => (
                        <p key={idx} className="text-xs text-slate-600">
                          {voter}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Result if Closed */}
      {!isOpen && vote.result && (
        <div className="mt-5 pt-5 border-t border-slate-200">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
            Result
          </p>
          <p className="text-sm font-semibold text-green-700">
            {vote.result} won!
          </p>
        </div>
      )}

      {/* Open Vote CTA */}
      {isOpen && !userHasVoted && (
        <div className="mt-5 pt-5 border-t border-slate-200">
          <p className="text-xs text-slate-600 mb-3">
            Cast your vote before this closes
          </p>
          <button className="btn-primary text-sm w-full">
            Vote Now
          </button>
        </div>
      )}

      {/* Already Voted */}
      {isOpen && userHasVoted && (
        <div className="mt-5 pt-5 border-t border-slate-200">
          <p className="text-xs font-medium text-green-700 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Your vote is in
          </p>
        </div>
      )}
    </div>
  );
};
