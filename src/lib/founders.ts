/**
 * Founder accounts.
 *
 * These four people can feature one of their own trips onto the public
 * "Founder Itineraries" rail on Discover (see PATCH /api/trips/[id]/feature
 * and the founder-only toggle on the itinerary header).
 *
 * Email-based allowlist — small, static, and authoritative on the server.
 * Resolved against the profiles table on 2026-05-25:
 *   abby0936@gmail.com        Abby Stark      (c2b67e19-436e-48c4-880e-aa7c0a91868b)
 *   brandon.hickle@gmail.com  Brandon Hickle  (dbf284f5-5c56-48a3-827d-a4a84641e7d0)
 *   lhixon1988@gmail.com      Luke Hixon      (db9d3db1-4198-44cc-90e1-18fe3bd7d6c5)
 *   hixon.mallory@gmail.com   Mallory Hixon   (1f294580-1d47-411d-bd07-9cde21b2fa84)
 */
export const FOUNDER_EMAILS = [
  'abby0936@gmail.com',
  'brandon.hickle@gmail.com',
  'lhixon1988@gmail.com',
  'hixon.mallory@gmail.com',
] as const;

/** Case-insensitive membership check against the founder allowlist. */
export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (FOUNDER_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}
