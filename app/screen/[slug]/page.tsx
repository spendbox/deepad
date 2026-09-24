import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { siteUrl } from '@/lib/config';
import { getScreenFeed } from '@/lib/screen-feed';
import LiveScreen from './LiveScreen';
import './screen.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const feed = await getScreenFeed(slug);
  return { title: feed ? `${feed.event.title} · DashPad live` : 'DashPad live' };
}

export default async function ScreenPage({ params }: Props) {
  const { slug } = await params;
  const feed = await getScreenFeed(slug);
  if (!feed) notFound();

  const guestUrl = `${await siteUrl()}/s/${slug}`;
  // Drawn once on the server, so the QR code keeps showing even if the venue internet dies.
  const qrSvg = await QRCode.toString(guestUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#1F0A26', light: '#FFFFFF' },
  });

  return <LiveScreen slug={slug} initialFeed={feed} qrSvg={qrSvg} guestUrl={guestUrl} />;
}
