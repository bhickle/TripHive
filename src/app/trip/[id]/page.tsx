import { redirect } from 'next/navigation';

// Server-side redirect — replaces the previous client useEffect that
// flashed a "Loading trip..." string for ~50ms before bouncing. Next 14's
// redirect() responds with a 307 before any HTML renders.
export default function TripIndexPage({ params }: { params: { id: string } }) {
  redirect(`/trip/${params.id}/itinerary`);
}
