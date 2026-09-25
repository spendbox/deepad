import type {
  MoneyRow,
  EventStats,
  NewPlanner,
  NewSprayEvent,
  NewPaymentLog,
  NewSprayIntent,
  NewSprayLine,
  NewTransfer,
  PasswordReset,
  PaymentLog,
  Planner,
  SprayEvent,
  SprayIntent,
  SprayLine,
  LineStatus,
  Transfer,
} from '../types';

export interface Store {
  readonly kind: 'memory' | 'supabase';

  createPlanner(p: NewPlanner): Promise<Planner>;
  getPlannerById(id: string): Promise<Planner | null>;
  getPlannerByEmail(email: string): Promise<Planner | null>;
  updatePlanner(id: string, patch: Partial<NewPlanner>): Promise<Planner>;
  listPlanners(): Promise<Planner[]>;

  createPasswordReset(r: { plannerId: string; tokenHash: string; expiresAt: string }): Promise<void>;
  findPasswordReset(tokenHash: string): Promise<PasswordReset | null>;
  latestPasswordReset(plannerId: string): Promise<PasswordReset | null>;
  markPasswordResetUsed(id: string): Promise<boolean>;

  /** Save an image and return its public link. */
  uploadImage(path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  deleteImage(url: string): Promise<void>;

  createEvent(e: NewSprayEvent): Promise<SprayEvent>;
  getEventById(id: string): Promise<SprayEvent | null>;
  getEventBySlug(slug: string): Promise<SprayEvent | null>;
  getEventByAccountNumber(accountNumber: string): Promise<SprayEvent | null>;
  getEventByCustomerCode(code: string): Promise<SprayEvent | null>;
  getEventByLinesToken(token: string): Promise<SprayEvent | null>;
  /** A planner's events, newest first. Deleted ones only with includeDeleted (e.g. for earnings). */
  listEventsByPlanner(plannerId: string, opts?: { includeDeleted?: boolean }): Promise<SprayEvent[]>;
  listEvents(): Promise<SprayEvent[]>;
  /** Events whose end time has passed but which have not been closed yet. */
  listEventsToClose(now: Date): Promise<SprayEvent[]>;
  updateEvent(id: string, patch: Partial<NewSprayEvent>): Promise<SprayEvent>;
  /** Remove an event completely (only used when it never received money). */
  deleteEvent(id: string): Promise<void>;
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
  /** Money columns of every transfer for these events, in one go (for totals and charts). */
  listMoneyRows(eventIds: string[]): Promise<MoneyRow[]>;
  /** Transfers with an id greater than `afterId`, oldest first (so the screen never skips one). */
  listTransfersAfter(eventId: string, afterId: number, limit?: number): Promise<Transfer[]>;
  setTransferHidden(eventId: string, transferId: number, hidden: boolean): Promise<void>;
  /** Fill in a description that arrived after the payment was first recorded. */
  setTransferMessage(transferId: number, message: string | null, rawNarration: string | null): Promise<void>;
  /** Totals of transfers that counted (inside the event window). */
  eventStats(eventId: string): Promise<EventStats>;

  createIntent(i: NewSprayIntent): Promise<SprayIntent>;
  getIntent(reference: string): Promise<SprayIntent | null>;
  markIntentPaid(reference: string, transferId: number): Promise<void>;

  createLine(l: NewSprayLine): Promise<SprayLine>;
  /** Newest first; only the given statuses if `status` is set. */
  listLines(eventId: string, opts?: { status?: LineStatus[]; limit?: number }): Promise<SprayLine[]>;
  countLines(eventId: string): Promise<number>;
  /** Approve or reject one or many lines at once. */
  setLinesStatus(eventId: string, lineIds: string[], status: LineStatus): Promise<void>;
  /** Returns the deleted line (so its photo can be removed too), or null. */
  deleteLine(eventId: string, lineId: string): Promise<SprayLine | null>;

  logPayment(l: NewPaymentLog): Promise<void>;
  listPaymentLogs(limit?: number): Promise<PaymentLog[]>;

  /** Problems with the database set-up (e.g. the latest schema.sql was not run). Empty if fine. */
  schemaProblems(): Promise<string[]>;
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
