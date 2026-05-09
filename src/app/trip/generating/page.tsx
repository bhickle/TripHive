import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Building Your Trip' };

export default function Page() {
  return <Client />;
}
