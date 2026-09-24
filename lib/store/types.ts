import type {
  EventStats,
  NewPlanner,
  NewSprayEvent,
  NewTransfer,
  Planner,
  SprayEvent,
  Transfer,
} from '../types';

export interface Store {
  readonly kind: 'memory' | 'supabase';

  createPlanner(p: NewPlanner): Promise<Planner>;
  getPlannerById(id: string): Promise<Planner | null>;
  getPlannerByEmail(email: string): Promise<Planner | null>;
  updatePlanner(id: string, patch: Partial<NewPlanner>): Promise<Planner>;
  listPlanners(): Promise<Planner[]>;

  createEvent(e: NewSprayEvent): Promise<SprayEvent>;
  getEventById(id: string): Promise<SprayEvent | null>;
  getEventBySlug(slug: string): Promise<SprayEvent | null>;
  getEventByAccountNumber(accountNumber: string): Promise<SprayEvent | null>;
  getEventByCustomerCode(code: string): Promise<SprayEvent | null>;
  listEventsByPlanner(plannerId: string): Promise<SprayEvent[]>;
  listEvents(): Promise<SprayEvent[]>;
  /** Events whose end time has passed but which have not been closed yet. */
  listEventsToClose(now: Date): Promise<SprayEvent[]>;
  updateEvent(id: string, patch: Partial<NewSprayEvent>): Promise<SprayEvent>;
  /**
   * Atomically mark the event's report as sent. Returns false if someone else
   * already claimed it, so the email only ever goes out once.
   */
  claimReport(eventId: string): Promise<boolean>;
  releaseReport(eventId: string): Promise<void>;

  /** Idempotent on `reference`: a repeated webhook returns the existing transfer. */
  insertTransfer(t: NewTransfer): Promise<{ transfer: Transfer; created: boolean }>;
  /** Newest first. */
  listTransfers(eventId: string, limit?: number): Promise<Transfer[]>;
  setTransferHidden(eventId: string, transferId: number, hidden: boolean): Promise<void>;
  /** Totals of transfers that counted (inside the event window). */
  eventStats(eventId: string): Promise<EventStats>;
}

export function computeStats(rows: Pick<Transfer, 'amountKobo' | 'outsideWindow'>[]): EventStats {
  let totalKobo = 0;
  let count = 0;
  for (const r of rows) {
    if (r.outsideWindow) continue;
    totalKobo += r.amountKobo;
    count += 1;
  }
  return { totalKobo, count };
}
