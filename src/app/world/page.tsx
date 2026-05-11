import type { Metadata } from 'next';
import WorldClient from './Client';

export const metadata: Metadata = { title: 'My World' };

export default function WorldPage() {
  return <WorldClient />;
}
