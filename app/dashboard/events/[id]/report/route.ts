import { buildReportPdf, reportFileName } from '@/lib/report-pdf';
import { currentPlanner } from '@/lib/session';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// The planner downloads their event report as a PDF.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const planner = await currentPlanner();
  if (!planner) return new Response('Please log in.', { status: 401 });
  const { id } = await ctx.params;
  const store = getStore();
  const event = await store.getEventById(id);
  if (!event || event.plannerId !== planner.id) return new Response('Not found', { status: 404 });
  const transfers = (await store.listTransfers(event.id, 100000)).reverse();
  const pdf = await buildReportPdf(event, planner, transfers);
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${reportFileName(event)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
