import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Pricing' };

export default function Page() {
  return <Client />;
}
