import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DashEvent, NewEvent, NewSpray, Spray, SprayIntent } from '../types';
import { computeStats, type Store } from './types';

// Talks to Supabase with the secret service-role key. Only ever runs on the
// server; the key must never be sent to a browser.

type Row = Record<string, any>;

const eventCols: [keyof NewEvent, string][] = [
  ['slug', 'slug'],
  ['title', 'title'],
  ['celebrants', 'celebrants'],
  ['mcName', 'mc_name'],
  ['status', 'status'],
  ['paused', 'paused'],
  ['nextUp', 'next_up'],
  ['bigSprayKobo', 'big_spray_kobo'],
  ['platformFeeBps', 'platform_fee_bps'],
  ['mcFeeBps', 'mc_fee_bps'],
  ['accountNumber', 'account_number'],
  ['accountBank', 'account_bank'],
  ['accountName', 'account_name'],
  ['celebrantBank', 'celebrant_bank'],
  ['celebrantAccountNumber', 'celebrant_account_number'],
  ['celebrantAccountName', 'celebrant_account_name'],
  ['mcBank', 'mc_bank'],
  ['mcAccountNumber', 'mc_account_number'],
  ['mcAccountName', 'mc_account_name'],
  ['paystackSplitCode', 'paystack_split_code'],
];

function toEvent(r: Row): DashEvent {
  const e: Record<string, unknown> = { id: r.id, createdAt: r.created_at };
  for (const [k, col] of eventCols) e[k] = r[col];
  e.bigSprayKobo = Number(r.big_spray_kobo);
  return e as DashEvent;
}

function fromEvent(patch: Partial<NewEvent>): Row {
  const row: Row = {};
  for (const [k, col] of eventCols) if (k in patch) row[col] = patch[k];
  return row;
}

function toIntent(r: Row): SprayIntent {
  return {
    reference: r.reference,
    eventId: r.event_id,
    guestName: r.guest_name,
    message: r.message,
    anonymous: r.anonymous,
    sprayKobo: Number(r.spray_kobo),
    feeKobo: Number(r.fee_kobo),
    totalKobo: Number(r.total_kobo),
    accountNumber: r.account_number,
    bankName: r.bank_name,
    accountName: r.account_name,
    expiresAt: r.expires_at,
    status: r.status,
    sprayId: r.spray_id == null ? null : Number(r.spray_id),
    createdAt: r.created_at,
  };
}

function toSpray(r: Row): Spray {
  return {
    id: Number(r.id),
    eventId: r.event_id,
    reference: r.reference,
    source: r.source,
    guestName: r.guest_name,
    displayName: r.display_name,
    message: r.message,
    anonymous: r.anonymous,
    amountKobo: Number(r.amount_kobo),
    platformFeeKobo: Number(r.platform_fee_kobo),
    mcFeeKobo: Number(r.mc_fee_kobo),
    celebrantKobo: Number(r.celebrant_kobo),
    hidden: r.hidden,
    createdAt: r.created_at,
  };
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === '23505') throw new Error('That web address is already taken.');
    throw new Error(res.error.message);
  }
  return res.data;
}

export class SupabaseStore implements Store {
  readonly kind = 'supabase' as const;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async listEvents() {
    const rows = check(await this.db.from('events').select('*').order('created_at', { ascending: false }));
    return (rows ?? []).map(toEvent);
  }
  async getEventById(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const row = check(await this.db.from('events').select('*').eq('id', id).maybeSingle());
    return row ? toEvent(row) : null;
  }
  async getEventBySlug(slug: string) {
    const row = check(await this.db.from('events').select('*').eq('slug', slug).maybeSingle());
    return row ? toEvent(row) : null;
  }
  async getEventByAccountNumber(acct: string) {
    const rows = check(await this.db.from('events').select('*').eq('account_number', acct).limit(1));
    return rows && rows[0] ? toEvent(rows[0]) : null;
  }
  async createEvent(e: NewEvent) {
    const row = check(await this.db.from('events').insert(fromEvent(e)).select('*').single());
    return toEvent(row);
  }
  async updateEvent(id: string, patch: Partial<NewEvent>) {
    const row = check(await this.db.from('events').update(fromEvent(patch)).eq('id', id).select('*').single());
    return toEvent(row);
  }

  async createIntent(i: Omit<SprayIntent, 'createdAt' | 'status' | 'sprayId'>) {
    const row = check(
      await this.db
        .from('spray_intents')
        .insert({
          reference: i.reference,
          event_id: i.eventId,
          guest_name: i.guestName,
          message: i.message,
          anonymous: i.anonymous,
          spray_kobo: i.sprayKobo,
          fee_kobo: i.feeKobo,
          total_kobo: i.totalKobo,
          account_number: i.accountNumber,
          bank_name: i.bankName,
          account_name: i.accountName,
          expires_at: i.expiresAt,
        })
        .select('*')
        .single(),
    );
    return toIntent(row);
  }
  async getIntent(reference: string) {
    const row = check(await this.db.from('spray_intents').select('*').eq('reference', reference).maybeSingle());
    return row ? toIntent(row) : null;
  }
  async markIntentPaid(reference: string, sprayId: number) {
    check(await this.db.from('spray_intents').update({ status: 'paid', spray_id: sprayId }).eq('reference', reference));
  }

  async insertSpray(s: NewSpray) {
    const res = await this.db
      .from('sprays')
      .insert({
        event_id: s.eventId,
        reference: s.reference,
        source: s.source,
        guest_name: s.guestName,
        display_name: s.displayName,
        message: s.message,
        anonymous: s.anonymous,
        amount_kobo: s.amountKobo,
        platform_fee_kobo: s.platformFeeKobo,
        mc_fee_kobo: s.mcFeeKobo,
        celebrant_kobo: s.celebrantKobo,
      })
      .select('*')
      .single();
    if (res.error?.code === '23505') {
      // Same payment reported twice (webhooks retry). Keep the first one.
      const row = check(await this.db.from('sprays').select('*').eq('reference', s.reference).single());
      return { spray: toSpray(row), created: false };
    }
    return { spray: toSpray(check(res)), created: true };
  }
  async listSprays(eventId: string, limit = 500) {
    const rows = check(
      await this.db.from('sprays').select('*').eq('event_id', eventId).order('id', { ascending: false }).limit(limit),
    );
    return (rows ?? []).map(toSpray);
  }
  async setSprayHidden(eventId: string, sprayId: number, hidden: boolean) {
    check(await this.db.from('sprays').update({ hidden }).eq('id', sprayId).eq('event_id', eventId));
  }
  async eventStats(eventId: string) {
    // A party has hundreds of sprays, not millions, so adding up here is fine.
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(
        await this.db
          .from('sprays')
          .select('display_name, anonymous, amount_kobo')
          .eq('event_id', eventId)
          .order('id')
          .range(from, from + 999),
      );
      all.push(...(rows ?? []));
      if (!rows || rows.length < 1000) break;
    }
    return computeStats(
      all.map((r) => ({ displayName: r.display_name, anonymous: r.anonymous, amountKobo: Number(r.amount_kobo) })),
    );
  }
}
