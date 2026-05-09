import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Update Password' };

export default function Page() {
  return <Client />;
}
