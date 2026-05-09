import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Log In' };

export default function Page() {
  return <Client />;
}
