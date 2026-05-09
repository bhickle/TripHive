import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Day-Of Guide' };

export default function Page() {
  return <Client />;
}
