import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Terms of Service' };

export default function Page() {
  return <Client />;
}
