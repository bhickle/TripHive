import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'My Adventures' };

export default function Page() {
  return <Client />;
}
