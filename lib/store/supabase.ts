import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NewPlanner, NewSprayEvent, NewTransfer, PasswordReset, Planner, SprayEvent, Transfer } from '../types';
import { computeStats, type Store } from './types';

// Talks to Supabase with the secret service-role key. Server only: the key
// must never reach a browser. Column names are the snake_case form of our
// field names (plannerFeeBps <-> planner_fee_bps).

type Row = Record<string, any>;

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

function toRow(obj: object): Row {
  const row: Row = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) row[toSnake(k)] = v;
  return row;
}

function fromRow<T>(row: Row, numeric: string[] = []): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  for (const k of numeric) if (out[k] != null) out[k] = Number(out[k]);
  return out as T;
}

const EVENT_NUMS = ['plannerFeeBps', 'platformFeeBps', 'bigSprayKobo'];
const TRANSFER_NUMS = ['id', 'amountKobo', 'platformFeeKobo', 'plannerFeeKobo', 'celebrantKobo', 'processingFeeKobo'];
const toEvent = (r: Row | null) => {
  const e = fromRow<SprayEvent>(r ?? {}, EVENT_NUMS);
  e.photos = Array.isArray(e.photos) ? e.photos : [];
  return e;
};
const toReset = (r: Row | null) => fromRow<PasswordReset>(r ?? {});

export const PHOTO_BUCKET = 'celebrant-photos';
const toTransfer = (r: Row | null) => fromRow<Transfer>(r ?? {}, TRANSFER_NUMS);
const toPlanner = (r: Row | null) => fromRow<Planner>(r ?? {});

type Res<T> = { data: T; error: { message: string; code?: string } | null };
function check<T>(res: Res<T>): T {
  if (res.error) {
    if (res.error.code === '23505') throw new Error(res.error.message.includes('email') ? 'EMAIL_TAKEN' : 'SLUG_TAKEN');
    throw new Error(res.error.message);
  }
  return res.data;
}

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  // ----- Planners -----
  async createPlanner(p: NewPlanner) {
    return toPlanner(check(await this.db.from('planners').insert(toRow(p)).select('*').single()));
  }
  async getPlannerById(id: string) {
    if (!isUuid(id)) return null;
    const row = check(await this.db.from('planners').select('*').eq('id', id).maybeSingle());
    return row ? toPlanner(row) : null;
  }
  async getPlannerByEmail(email: string) {
    const row = check(await this.db.from('planners').select('*').eq('email', email).maybeSingle());
    return row ? toPlanner(row) : null;
  }
  async updatePlanner(id: string, patch: Partial<NewPlanner>) {
    return toPlanner(check(await this.db.from('planners').update(toRow(patch)).eq('id', id).select('*').single()));
  }
  async listPlanners() {
    const rows = check(await this.db.from('planners').select('*').order('created_at', { ascending: false }));
    return (rows ?? []).map(toPlanner);
  }

  // ----- Password resets -----
  async createPasswordReset(r: { plannerId: string; tokenHash: string; expiresAt: string }) {
    check(await this.db.from('password_resets').insert(toRow(r)));
  }
  async findPasswordReset(tokenHash: string) {
    const row = check(await this.db.from('password_resets').select('*').eq('token_hash', tokenHash).maybeSingle());
    return row ? toReset(row) : null;
  }
  async latestPasswordReset(plannerId: string) {
    const rows = check(
      await this.db.from('password_resets').select('*').eq('planner_id', plannerId).order('created_at', { ascending: false }).limit(1),
    );
    return rows?.[0] ? toReset(rows[0]) : null;
  }
  async markPasswordResetUsed(id: string) {
    // Only succeeds once, so a reset link can't be used twice.
    const rows = check(
      await this.db.from('password_resets').update({ used_at: new Date().toISOString() }).eq('id', id).is('used_at', null).select('id'),
    );
    return (rows ?? []).length === 1;
  }

  // ----- Images (Supabase Storage, public bucket) -----
  async uploadImage(path: string, bytes: Uint8Array, contentType: string) {
    const bucket = this.db.storage.from(PHOTO_BUCKET);
    let res = await bucket.upload(path, bytes, { contentType, upsert: false });
    if (res.error && /bucket not found/i.test(res.error.message)) {
      await this.db.storage.createBucket(PHOTO_BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024 });
      res = await bucket.upload(path, bytes, { contentType, upsert: false });
    }
    if (res.error) throw new Error(res.error.message);
    return bucket.getPublicUrl(path).data.publicUrl;
  }
  async deleteImage(url: string) {
    const marker = `/object/public/${PHOTO_BUCKET}/`;
    const i = url.indexOf(marker);
    if (i < 0) return;
    await this.db.storage.from(PHOTO_BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
  }

  // ----- Events -----
  async createEvent(e: NewSprayEvent) {
    return toEvent(check(await this.db.from('spray_events').insert(toRow(e)).select('*').single()));
  }
  async getEventById(id: string) {
    if (!isUuid(id)) return null;
    const row = check(await this.db.from('spray_events').select('*').eq('id', id).maybeSingle());
    return row ? toEvent(row) : null;
  }
  async getEventBySlug(slug: string) {
    const row = check(await this.db.from('spray_events').select('*').eq('slug', slug).maybeSingle());
    return row ? toEvent(row) : null;
  }
  async getEventByAccountNumber(acct: string) {
    const rows = check(await this.db.from('spray_events').select('*').eq('account_number', acct).limit(1));
    return rows?.[0] ? toEvent(rows[0]) : null;
  }
  async getEventByCustomerCode(code: string) {
    const rows = check(await this.db.from('spray_events').select('*').eq('paystack_customer_code', code).limit(1));
    return rows?.[0] ? toEvent(rows[0]) : null;
  }
  async listEventsByPlanner(plannerId: string) {
    const rows = check(
      await this.db.from('spray_events').select('*').eq('planner_id', plannerId).order('created_at', { ascending: false }),
    );
    return (rows ?? []).map(toEvent);
  }
  async listEvents() {
    const rows = check(await this.db.from('spray_events').select('*').order('created_at', { ascending: false }));
    return (rows ?? []).map(toEvent);
  }
  async listEventsToClose(at: Date) {
    const rows = check(
      await this.db.from('spray_events').select('*').is('closed_at', null).lte('ends_at', at.toISOString()),
    );
    return (rows ?? []).map(toEvent);
  }
  async updateEvent(id: string, patch: Partial<NewSprayEvent>) {
    return toEvent(check(await this.db.from('spray_events').update(toRow(patch)).eq('id', id).select('*').single()));
  }
  async claimReport(eventId: string) {
    const rows = check(
      await this.db
        .from('spray_events')
        .update({ report_sent_at: new Date().toISOString() })
        .eq('id', eventId)
        .is('report_sent_at', null)
        .select('id'),
    );
    return (rows ?? []).length === 1;
  }
  async releaseReport(eventId: string) {
    check(await this.db.from('spray_events').update({ report_sent_at: null }).eq('id', eventId));
  }

  // ----- Transfers -----
  async insertTransfer(t: NewTransfer) {
    const res = await this.db.from('transfers').insert(toRow(t)).select('*').single();
    if (res.error?.code === '23505') {
      // Same payment reported twice (Paystack retries). Keep the first one.
      const row = check(await this.db.from('transfers').select('*').eq('reference', t.reference).single());
      return { transfer: toTransfer(row), created: false };
    }
    return { transfer: toTransfer(check(res)), created: true };
  }
  async listTransfers(eventId: string, limit = 1000) {
    const rows = check(
      await this.db.from('transfers').select('*').eq('event_id', eventId).order('id', { ascending: false }).limit(limit),
    );
    return (rows ?? []).map(toTransfer);
  }
  async setTransferHidden(eventId: string, transferId: number, hidden: boolean) {
    check(await this.db.from('transfers').update({ hidden }).eq('id', transferId).eq('event_id', eventId));
  }
  async eventStats(eventId: string) {
    // A party has hundreds of transfers, not millions, so adding up here is fine.
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(
        await this.db
          .from('transfers')
          .select('amount_kobo, outside_window')
          .eq('event_id', eventId)
          .order('id')
          .range(from, from + 999),
      );
      all.push(...(rows ?? []));
      if (!rows || rows.length < 1000) break;
    }
    return computeStats(all.map((r) => ({ amountKobo: Number(r.amount_kobo), outsideWindow: r.outside_window })));
  }
}
