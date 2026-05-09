import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Create Account' };

export default function Page() {
  return <Client />;
}
