'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Optional label shown in the error card (e.g. "itinerary") */
  context?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Generic React error boundary.
 * Catches render/lifecycle errors in any child tree and shows a recovery card.
 * Works with Next.js App Router client components.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Log for diagnostics — replace with your error tracking service if needed
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      const label = this.props.context ?? 'page';
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-8">
          <div className="bg-white border border-red-200 rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-600 mb-1">
              We couldn&apos;t load your {label}. This is usually caused by
              unexpected data — try refreshing.
            </p>
            {this.state.message && (
              <p className="text-xs text-slate-400 font-mono mt-2 mb-4 break-all">
                {this.state.message}
              </p>
            )}
            <div className="flex gap-3 justify-center mt-5">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2 bg-sky-800 hover:bg-sky-900 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
