import { NextResponse } from 'next/server';
import { viewOnlyLines } from '@/lib/lines-view';

export const dynamic = 'force-dynamic';

/** The view-only page's live list of lines (approved, rejected and waiting). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const data = await viewOnlyLines((await params).token);
  if (!data) return NextResponse.json({ error: 'This link is not valid any more.' }, { status: 404 });
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } });
}
