import { redirect } from 'next/navigation';

// Older event links looked like /e/<code>. Send them to the short link.
export default async function OldEventLink({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/${encodeURIComponent(code)}`);
}
