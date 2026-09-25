import { randomUUID } from 'node:crypto';
import type {
  NewPaymentLog,
  NewPlanner,
  NewSprayEvent,
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
import { computeStats, type Store } from './types';

// A throwaway store that lives in the server's memory, for developers running
// the app on their own computer. It is never used on the live site.

type Data = {
  planners: Planner[];
  events: SprayEvent[];
  transfers: Transfer[];
  resets: PasswordReset[];
  logs: PaymentLog[];
  intents: SprayIntent[];
  lines: SprayLine[];
  nextTransferId: number;
};

const g = globalThis as unknown as { __dashpadMemory?: Data };
function data(): Data {
  g.__dashpadMemory ??= { planners: [], events: [], transfers: [], resets: [], logs: [], intents: [], lines: [], nextTransferId: 1 };
  g.__dashpadMemory.lines ??= [];
  return g.__dashpadMemory;
}

const now = () => new Date().toISOString();
const byNewest = <T extends { createdAt: string }>(a: T, b: T) => b.createdAt.localeCompare(a.createdAt);

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;

  async createPlanner(p: NewPlanner) {
    const d = data();
    if (d.planners.some((x) => x.email === p.email)) throw new Error('EMAIL_TAKEN');
    const planner: Planner = { ...p, id: randomUUID(), createdAt: now() };
    d.planners.push(planner);
    return planner;
  }
  async getPlannerById(id: string) {
    return data().planners.find((p) => p.id === id) ?? null;
  }
  async getPlannerByEmail(email: string) {
    return data().planners.find((p) => p.email === email) ?? null;
  }
  async updatePlanner(id: string, patch: Partial<NewPlanner>) {
    const p = data().planners.find((x) => x.id === id);
    if (!p) throw new Error('Planner not found');
    Object.assign(p, patch);
    return p;
  }
  async listPlanners() {
    return [...data().planners].sort(byNewest);
  }

  async createPasswordReset(r: { plannerId: string; tokenHash: string; expiresAt: string }) {
    data().resets.push({ ...r, id: randomUUID(), usedAt: null, createdAt: now() });
  }
  async findPasswordReset(tokenHash: string) {
    return data().resets.find((r) => r.tokenHash === tokenHash) ?? null;
  }
  async latestPasswordReset(plannerId: string) {
    return data().resets.filter((r) => r.plannerId === plannerId).sort(byNewest)[0] ?? null;
  }
  async markPasswordResetUsed(id: string) {
    const r = data().resets.find((x) => x.id === id);
    if (!r || r.usedAt) return false;
    r.usedAt = now();
    return true;
  }

  // Images are kept inline as data links. Fine for a developer's computer only.
  async uploadImage(path: string, bytes: Uint8Array, contentType: string) {
    return `data:${contentType};name=${path.split('/').pop()};base64,${Buffer.from(bytes).toString('base64')}`;
  }
  async deleteImage() {}

  async createEvent(e: NewSprayEvent) {
    const d = data();
    if (d.events.some((x) => x.slug === e.slug)) throw new Error('SLUG_TAKEN');
    const event: SprayEvent = { ...e, id: randomUUID(), createdAt: now() };
    d.events.push(event);
    return event;
  }
  async getEventById(id: string) {
    return data().events.find((e) => e.id === id) ?? null;
  }
  async getEventBySlug(slug: string) {
    return data().events.find((e) => e.slug === slug) ?? null;
  }
  async getEventByAccountNumber(acct: string) {
    return data().events.find((e) => e.accountNumber === acct) ?? null;
  }
  async getEventByCustomerCode(code: string) {
    return data().events.find((e) => e.paystackCustomerCode === code) ?? null;
  }
  async getEventByLinesToken(token: string) {
    return data().events.find((e) => e.linesViewToken === token) ?? null;
  }
  async listEventsByPlanner(plannerId: string, opts: { includeDeleted?: boolean } = {}) {
    return data()
      .events.filter((e) => e.plannerId === plannerId && (opts.includeDeleted || !e.deletedAt))
      .sort(byNewest);
  }
  async listEvents() {
    return [...data().events].sort(byNewest);
  }
  async listEventsToClose(at: Date) {
    return data().events.filter((e) => !e.closedAt && new Date(e.endsAt) <= at);
  }
  async updateEvent(id: string, patch: Partial<NewSprayEvent>) {
    const e = data().events.find((x) => x.id === id);
    if (!e) throw new Error('Event not found');
    Object.assign(e, patch);
    return e;
  }
  async deleteEvent(id: string) {
    const d = data();
    d.events = d.events.filter((e) => e.id !== id);
    d.transfers = d.transfers.filter((t) => t.eventId !== id);
  }
  async claimReport(eventId: string) {
    const e = data().events.find((x) => x.id === eventId);
    if (!e || e.reportSentAt) return false;
    e.reportSentAt = now();
    return true;
  }
  async releaseReport(eventId: string) {
    const e = data().events.find((x) => x.id === eventId);
    if (e) e.reportSentAt = null;
  }

  async insertTransfer(t: NewTransfer) {
    const d = data();
    const existing = d.transfers.find((x) => x.reference === t.reference);
    if (existing) return { transfer: existing, created: false };
    const transfer: Transfer = { ...t, id: d.nextTransferId++, hidden: false, createdAt: now() };
    d.transfers.push(transfer);
    return { transfer, created: true };
  }
  async listTransfersAfter(eventId: string, afterId: number, limit = 200) {
    return data()
      .transfers.filter((t) => t.eventId === eventId && t.id > afterId)
      .sort((a, b) => a.id - b.id)
      .slice(0, limit);
  }
  async listMoneyRows(eventIds: string[]) {
    const ids = new Set(eventIds);
    return data().transfers.filter((t) => ids.has(t.eventId));
  }
  async listTransfers(eventId: string, limit = 1000) {
    return data()
      .transfers.filter((t) => t.eventId === eventId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }
  async setTransferMessage(transferId: number, message: string | null, rawNarration: string | null) {
    const t = data().transfers.find((x) => x.id === transferId);
    if (t) Object.assign(t, { message, rawNarration });
  }
  async setTransferHidden(eventId: string, transferId: number, hidden: boolean) {
    const t = data().transfers.find((x) => x.id === transferId && x.eventId === eventId);
    if (t) t.hidden = hidden;
  }
  async eventStats(eventId: string) {
    return computeStats(data().transfers.filter((t) => t.eventId === eventId));
  }

  async createIntent(i: NewSprayIntent) {
    const intent: SprayIntent = { ...i, status: 'pending', transferId: null, createdAt: now() };
    data().intents.push(intent);
    return intent;
  }
  async getIntent(reference: string) {
    return data().intents.find((i) => i.reference === reference) ?? null;
  }
  async markIntentPaid(reference: string, transferId: number) {
    const i = data().intents.find((x) => x.reference === reference);
    if (i) Object.assign(i, { status: 'paid', transferId });
  }

  async createLine(l: NewSprayLine) {
    const line: SprayLine = { ...l, id: randomUUID(), createdAt: now() };
    data().lines.push(line);
    return line;
  }
  async listLines(eventId: string, opts: { status?: LineStatus[]; limit?: number } = {}) {
    return data()
      .lines.filter((l) => l.eventId === eventId && (!opts.status || opts.status.includes(l.status)))
      .sort(byNewest)
      .slice(0, opts.limit ?? 500);
  }
  async countLines(eventId: string) {
    return data().lines.filter((l) => l.eventId === eventId).length;
  }
  async setLinesStatus(eventId: string, lineIds: string[], status: LineStatus) {
    for (const l of data().lines) {
      if (l.eventId === eventId && lineIds.includes(l.id)) {
        l.status = status;
        l.reviewedAt = now();
      }
    }
  }
  async deleteLine(eventId: string, lineId: string) {
    const d = data();
    const i = d.lines.findIndex((x) => x.id === lineId && x.eventId === eventId);
    return i < 0 ? null : d.lines.splice(i, 1)[0];
  }

  async logPayment(l: NewPaymentLog) {
    const d = data();
    d.logs.unshift({ ...l, id: d.logs.length + 1, createdAt: now() });
    d.logs.length = Math.min(d.logs.length, 500);
  }
  async listPaymentLogs(limit = 50) {
    return data().logs.slice(0, limit);
  }
  async schemaProblems() {
    return [];
  }
}
