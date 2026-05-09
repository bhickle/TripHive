import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = { title: 'Join Trip' };

export default function Page({ params }: { params: { id: string } }) {
  return <Client params={params} />;
}
