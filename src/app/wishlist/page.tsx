import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'On My Radar' };

export default function Page() {
  return <Client />;
}
