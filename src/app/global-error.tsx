'use client';

// Catches errors thrown inside the root layout itself — which the regular
// `error.tsx` CAN'T catch because it's mounted inside that layout. Without
// this file, a layout-level error falls through to Next's unbranded default
// error screen ("Application error: a client-side exception has occurred").
//
// MUST render its own <html> + <body> because it replaces the root layout
// when triggered. Keep the markup minimal — we can't rely on AuthProvider,
// fonts, or Tailwind components being mounted (the error might have happened
// before any of them initialized). Inline styles keep this dependency-free.

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error.tsx] caught:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{
        margin: 0,
        minHeight: '100vh',
        backgroundColor: '#f5f1e8',  // parchment — matches the rest of the app
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#1f2937',
      }}>
        <div style={{
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '40px 32px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid #f4f4f5',
        }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</p>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 600,
            fontStyle: 'italic',
            margin: '0 0 8px 0',
            color: '#18181b',
          }}>
            Something went sideways
          </h1>
          <p style={{ color: '#52525b', marginBottom: '24px', lineHeight: 1.5 }}>
            We hit an unexpected error. Try reloading — if it keeps happening,
            drop us a note at{' '}
            <a href="mailto:hello@tripcoord.ai" style={{ color: '#0369a1', fontWeight: 600 }}>
              hello@tripcoord.ai
            </a>
            .
          </p>
          {error.digest && (
            <p style={{ fontSize: '11px', color: '#a1a1aa', fontFamily: 'monospace', marginBottom: '24px' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              padding: '10px 20px',
              backgroundColor: '#f59e0b',
              color: '#ffffff',
              fontWeight: 600,
              borderRadius: '9999px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
