import 'server-only';
import { getStore } from './store';
import type { LineStatus } from './types';

export type ViewLine = { id: string; text: string; name: string; photo: string | null; status: LineStatus; createdAt: string };
export type ViewOnlyData = { title: string; celebrantName: string; lines: ViewLine[] };

/** Everything the view-only lines page shows, found by its secret token. Nothing about money. */
export async function viewOnlyLines(token: string): Promise<ViewOnlyData | null> {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
  const store = getStore();
  const event = await store.getEventByLinesToken(token);
  if (!event || event.deletedAt) return null;
  const lines = await store.listLines(event.id, { limit: 1000 });
  return {
    title: event.title,
    celebrantName: event.celebrantName,
    lines: lines.map((l) => ({ id: l.id, text: l.text, name: l.authorName, photo: l.photoUrl, status: l.status, createdAt: l.createdAt })),
  };
}
