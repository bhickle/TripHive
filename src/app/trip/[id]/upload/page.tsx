/**
 * /trip/[id]/upload is superseded by the UploadItineraryModal used from
 * the dashboard. Redirect anyone who lands here back to the dashboard
 * so they can use the current upload flow.
 */
import { redirect } from 'next/navigation';

export default function UploadRedirectPage() {
  redirect('/dashboard');
}
