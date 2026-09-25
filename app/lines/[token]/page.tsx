import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { viewOnlyLines } from '@/lib/lines-view';
import LinesLive from './LinesLive';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Lines · DashPad', robots: { index: false } };

// A view-only, live page of every line sent for an event (approved, rejected
// and waiting), for someone the planner shares it with. Nothing can be changed here.
export default async function LinesViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await viewOnlyLines(token);
  if (!data) notFound();
  return <LinesLive token={token} initial={data} />;
}
