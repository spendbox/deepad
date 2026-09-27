import 'server-only';
import { summarise } from '@/lib/events';
import { getStore } from '@/lib/store';

/** Every event with its money totals, plus the planners (for names) and grand totals. */
export async function loadEventsWithTotals() {
  const store = getStore();
  const [planners, events] = await Promise.all([store.listPlanners(), store.listEvents()]);
  const money = await store.listMoneyRows(events.map((e) => e.id));
  const sums = new Map(events.map((e) => [e.id, summarise(money.filter((m) => m.eventId === e.id))]));
  const plannerName = new Map(planners.map((p) => [p.id, p.name]));
  const total = [...sums.values()].reduce(
    (a, s) => ({ sprayed: a.sprayed + s.totalKobo, platform: a.platform + s.platformKobo, processing: a.processing + s.processingKobo, outside: a.outside + s.outside.length }),
    { sprayed: 0, platform: 0, processing: 0, outside: 0 },
  );
  return { planners, events, sums, plannerName, total };
}

export type EventsWithTotals = Awaited<ReturnType<typeof loadEventsWithTotals>>;
