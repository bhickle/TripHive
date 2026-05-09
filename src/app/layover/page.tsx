import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = {
  title: 'Layover Planner',
  description: 'Turn your airport layover into a mini adventure. AI-suggested activities for any city, any time window.',
};

export default function Page() {
  return <Client />;
}
