import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eventByCameraToken } from '@/lib/camera';
import { eventPhase } from '@/lib/event-info';
import CameraBroadcaster from './CameraBroadcaster';
import './camera.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Live camera · DashPad', robots: { index: false } };

// The camera person opens this secret link on a phone and taps "Go live":
// the phone's camera then shows on the event's big screen.
export default async function CameraPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const event = await eventByCameraToken(token);
  if (!event) notFound();
  return (
    <CameraBroadcaster
      token={token}
      title={event.title}
      celebrantName={event.celebrantName}
      ended={eventPhase(event) === 'ended'}
    />
  );
}
