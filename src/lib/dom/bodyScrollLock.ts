/**
 * Ref-counted body-scroll lock.
 *
 * The naïve "save previous overflow → restore on cleanup" pattern that
 * useModalUX and the trip-layout both used independently does NOT
 * compose when locks have overlapping (rather than nested) lifetimes:
 *
 *   Sequence  trip-mount(prev='') → modal-open(prev='hidden')
 *             → trip-unmount(restore '') → modal-close(restore 'hidden')
 *   Result    body stuck at overflow:hidden on the destination page.
 *
 * A counter sidesteps the order-of-unmount question entirely: lock when
 * the count goes 0→1, unlock when it returns 1→0, ignore everything in
 * between. Whoever calls last wins by definition.
 *
 * Usage:
 *   useEffect(() => {
 *     lockBodyScroll();
 *     return () => unlockBodyScroll();
 *   }, []);
 *
 * Calls outside the browser (SSR) are no-ops.
 */

let lockCount = 0;
/** Whatever body.style.overflow was before the first lock — restored
 *  when the count returns to 0 so a non-empty inline style set by some
 *  other consumer isn't clobbered. */
let originalOverflow: string | null = null;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount++;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return; // already unlocked — defensive guard
  lockCount--;
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow ?? '';
    originalOverflow = null;
  }
}
