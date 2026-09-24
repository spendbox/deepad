import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isValidAdminToken } from '@/lib/auth';
import { buildReportPdf, reportFileName } from '@/lib/report-pdf';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// DashPad admin: the same PDF report the planner receives.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const jar = await cookies();
  if (!(await isValidAdminToken(jar.get(ADMIN_COOKIE)?.value))) return new Response('Unauthorized', { status: 401 });
  const { id } = await ctx.params;
  const store = getStore();
  const event = await store.getEventById(id);
  if (!event) return new Response('Not found', { status: 404 });
  const planner = await store.getPlannerById(event.plannerId);
  if (!planner) return new Response('Not found', { status: 404 });
  const pdf = await buildReportPdf(event, planner, (await store.listTransfers(event.id, 100000)).reverse());
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${reportFileName(event)}"` },
  });
}
