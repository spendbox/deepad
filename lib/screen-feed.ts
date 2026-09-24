import 'server-only';
import { getStore } from './store';
import { toScreenSpray, type ScreenSpray } from './sprays';
import type { EventStats } from './types';

export type ScreenFeed = {
  event: {
    title: string;
    celebrants: string;
    mcName: string;
    status: string;
    paused: boolean;
    nextUp: string | null;
    bigSprayKobo: number;
    accountNumber: string | null;
    accountBank: string | null;
    accountName: string | null;
  };
  stats: EventStats;
  /** Latest sprays, oldest first. */
  recent: ScreenSpray[];
};

export async function getScreenFeed(slug: string): Promise<ScreenFeed | null> {
  const store = getStore();
  const event = await store.getEventBySlug(slug);
  if (!event) return null;
  const [stats, sprays] = await Promise.all([store.eventStats(event.id), store.listSprays(event.id, 30)]);
  return {
    event: {
      title: event.title,
      celebrants: event.celebrants,
      mcName: event.mcName,
      status: event.status,
      paused: event.paused,
      nextUp: event.nextUp,
      bigSprayKobo: event.bigSprayKobo,
      accountNumber: event.accountNumber,
      accountBank: event.accountBank,
      accountName: event.accountName,
    },
    stats,
    recent: sprays.map(toScreenSpray).reverse(),
  };
}
