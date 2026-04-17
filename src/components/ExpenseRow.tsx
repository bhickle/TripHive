'use client';

import React from 'react';
import { DollarSign, CreditCard, Users, Utensils, Hotel, Plane, Compass } from 'lucide-react';
import { Expense } from '@/lib/types';
import { Avatar } from './Avatar';

interface ExpenseRowProps {
  expense: Expense;
  paidByName: string;
  paidByAvatar?: string;
  onExpenseClick?: (expenseId: string) => void;
}

const categoryIcons: Record<string, React.ComponentType<any>> = {
  flights: Plane,
  accommodation: Hotel,
  dining: Utensils,
  experiences: Compass,
  transport: Plane,
  default: CreditCard,
};

const categoryColors: Record<string, string> = {
  flights: 'text-blue-600 bg-blue-50',
  accommodation: 'text-purple-600 bg-purple-50',
  dining: 'text-orange-600 bg-orange-50',
  experiences: 'text-teal-600 bg-teal-50',
  transport: 'text-indigo-600 bg-indigo-50',
  default: 'text-slate-600 bg-slate-50',
};

const splitTypeLabels: Record<string, string> = {
  equal: 'Split Equally',
  itemized: 'Itemized',
  custom: 'Custom Split',
};

export const ExpenseRow: React.FC<ExpenseRowProps> = ({
  expense,
  paidByName,
  paidByAvatar,
  onExpenseClick,
}) => {
  const CategoryIcon = categoryIcons[expense.category] || categoryIcons.default;
  const categoryColorClass = categoryColors[expense.category] || categoryColors.default;

  const handleClick = () => {
    if (onExpenseClick) {
      onExpenseClick(expense.id);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <button
      onClick={handleClick}
      className="card-flat p-4 hover:bg-slate-100 transition-all duration-200 cursor-pointer w-full text-left"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: Avatar and Paid By Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar
            src={paidByAvatar}
            name={paidByName}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">
              {paidByName} paid
            </p>
            <p className="text-xs text-slate-600 truncate">
              {expense.description}
            </p>
          </div>
        </div>

        {/* Middle: Category and Details */}
        <div className="flex items-center gap-2">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${categoryColorClass}`}>
            <CategoryIcon className="w-5 h-5" />
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">
              {expense.currency} {expense.amount.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500">
              {formatDate(expense.date)}
            </p>
          </div>
        </div>

        {/* Right: Split Badge and Chevron */}
        <div className="flex items-center gap-2">
          <span className="badge badge-blue whitespace-nowrap">
            {splitTypeLabels[expense.splitType]}
          </span>
          <div className="text-slate-400">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Optional: Expansion indicator */}
      <div className="hidden group-hover:block mt-2 pt-2 border-t border-slate-200">
        <p className="text-xs text-slate-500">
          Click to view split details
        </p>
      </div>
    </button>
  );
};
