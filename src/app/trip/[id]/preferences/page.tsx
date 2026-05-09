import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Trip Preferences' };

export default function Page() {
  return <Client />;
}
