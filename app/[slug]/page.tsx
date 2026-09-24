import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { screenFeed } from '@/lib/events';
import { getStore } from '@/lib/store';
import LiveScreen from './LiveScreen';
import './screen.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: code } = await params;
  const event = await getStore().getEventBySlug(code);
  return { title: event ? `${event.title} · DashPad` : 'DashPad', robots: { index: false } };
}

// The event's short link, e.g. dashpad.ng/tolu-and-dayo. Open it on the venue TV or projector.
export default async function EventScreenPage({ params }: Props) {
  const { slug: code } = await params;
  const event = await getStore().getEventBySlug(code);
  if (!event || event.deletedAt) notFound();
  return <LiveScreen code={code} initialFeed={await screenFeed(event)} />;
}
