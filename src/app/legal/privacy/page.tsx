import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function Page() {
  return <Client />;
}
