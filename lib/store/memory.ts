import { randomUUID } from 'node:crypto';
import type { NewPaymentLog, NewPlanner, NewSprayEvent, NewTransfer, PasswordReset, PaymentLog, Planner, SprayEvent, Transfer } from '../types';
import { computeStats, type Store } from './types';

// A throwaway store that lives in the server's memory, for developers running
// the app on their own computer. It is never used on the live site.

type Data = {
  planners: Planner[];
  events: SprayEvent[];
  transfers: Transfer[];
  resets: PasswordReset[];
  logs: PaymentLog[];
  nextTransferId: number;
};

const g = globalThis as unknown as { __dashpadMemory?: Data };
function data(): Data {
  g.__dashpadMemory ??= { planners: [], events: [], transfers: [], resets: [], logs: [], nextTransferId: 1 };
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
  async uploadImage(_path: string, bytes: Uint8Array, contentType: string) {
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
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
  async listEventsByPlanner(plannerId: string) {
    return data().events.filter((e) => e.plannerId === plannerId && !e.deletedAt).sort(byNewest);
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
  async listTransfers(eventId: string, limit = 1000) {
    return data()
      .transfers.filter((t) => t.eventId === eventId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }
  async setTransferHidden(eventId: string, transferId: number, hidden: boolean) {
    const t = data().transfers.find((x) => x.id === transferId && x.eventId === eventId);
    if (t) t.hidden = hidden;
  }
  async eventStats(eventId: string) {
    return computeStats(data().transfers.filter((t) => t.eventId === eventId));
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
