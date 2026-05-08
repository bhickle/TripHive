'use client';

import { useEffect } from 'react';

/**
 * Shared modal UX hook — call inside a modal component when it's open.
 *
 *   useModalUX(isOpen, onClose);
 *
 * Adds:
 *  - Escape key closes the modal (was missing on most app modals)
 *  - Body scroll lock while open (prevents the page behind from scrolling)
 *
 * Both behaviors are standard expectations and were missing project-wide
 * per the modal UX audit. Hook is no-op when isOpen is false, so it's safe
 * to call unconditionally inside the modal component.
 *
 * NOTE: focus management (move focus to first focusable on open, restore
 * on close) and tab-trap are deliberately NOT included here. They require
 * per-modal coordination (which element to focus, what to skip) and are
 * tracked separately. This hook covers the two universally-applicable bits.
 */
export function useModalUX(isOpen: boolean, onClose: () => void): void {
  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Body scroll lock. Restores the previous overflow value on close, so
  // it composes correctly if multiple modals stack (innermost wins; on
  // close the outer modal's lock is restored).
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);
}
