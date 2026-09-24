import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { screenFeed } from '@/lib/events';
import { siteUrl } from '@/lib/site';
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
  // QR code for "spray with a message", drawn once here so it shows even if the venue internet drops.
  const sprayUrl = `${await siteUrl()}/${event.slug}/spray`;
  const qrSvg = await QRCode.toString(sprayUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1F0A26', light: '#FFFFFF' } });
  return <LiveScreen code={code} initialFeed={await screenFeed(event)} qrSvg={qrSvg} sprayPath={`/${event.slug}/spray`} />;
}
