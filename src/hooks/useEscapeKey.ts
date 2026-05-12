import { useEffect, useRef } from 'react';

/**
 * Bind window keydown Escape to a callback while `active` is true.
 *
 * Use this on every modal so keyboard-only users can dismiss without a
 * mouse. The callback is held in a ref so changing identity doesn't
 * resubscribe — only `active` toggles the listener.
 *
 * Pair with `role="dialog" aria-modal="true"` on the modal root so
 * screen readers also announce the dialog and trap focus.
 *
 * @example
 *   useEscapeKey(() => setOpen(false), open);
 */
export function useEscapeKey(onEscape: () => void, active: boolean = true) {
  const cbRef = useRef(onEscape);
  cbRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cbRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}
