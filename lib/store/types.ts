import type {
  DashEvent,
  EventStats,
  NewEvent,
  NewSpray,
  Spray,
  SprayIntent,
} from '../types';

export interface Store {
  readonly kind: 'memory' | 'supabase';

  listEvents(): Promise<DashEvent[]>;
  getEventById(id: string): Promise<DashEvent | null>;
  getEventBySlug(slug: string): Promise<DashEvent | null>;
  getEventByAccountNumber(accountNumber: string): Promise<DashEvent | null>;
  createEvent(e: NewEvent): Promise<DashEvent>;
  updateEvent(id: string, patch: Partial<NewEvent>): Promise<DashEvent>;

  createIntent(i: Omit<SprayIntent, 'createdAt' | 'status' | 'sprayId'>): Promise<SprayIntent>;
  getIntent(reference: string): Promise<SprayIntent | null>;
  markIntentPaid(reference: string, sprayId: number): Promise<void>;

  /** Idempotent on `reference`: a repeated webhook returns the existing spray. */
  insertSpray(s: NewSpray): Promise<{ spray: Spray; created: boolean }>;
  /** Newest first. */
  listSprays(eventId: string, limit?: number): Promise<Spray[]>;
  setSprayHidden(eventId: string, sprayId: number, hidden: boolean): Promise<void>;
  eventStats(eventId: string): Promise<EventStats>;
}

/** Leaderboard: named guests grouped by display name, anonymous sprays excluded. */
export function computeStats(
  rows: Pick<Spray, 'displayName' | 'anonymous' | 'amountKobo'>[],
): EventStats {
  let totalKobo = 0;
  // "Uncle Tunde" and "uncle tunde " count as the same person.
  const byName = new Map<string, { name: string; amountKobo: number }>();
  for (const r of rows) {
    totalKobo += r.amountKobo;
    if (r.anonymous) continue;
    const name = r.displayName.trim();
    const key = name.toLowerCase();
    const row = byName.get(key) ?? { name, amountKobo: 0 };
    row.amountKobo += r.amountKobo;
    byName.set(key, row);
  }
  const leaderboard = [...byName.values()]
    .sort((a, b) => b.amountKobo - a.amountKobo)
    .slice(0, 5);
  return { totalKobo, count: rows.length, leaderboard };
}
