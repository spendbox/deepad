import { randomUUID } from 'node:crypto';
import type { DashEvent, NewEvent, NewSpray, Spray, SprayIntent } from '../types';
import { computeStats, type Store } from './types';

// A practice store that lives in the server's memory. It is used when no
// Supabase database is connected, so the demo works straight away on a laptop.
// Everything is lost when the server restarts. Never use it for real money.

type Data = {
  events: DashEvent[];
  intents: Map<string, SprayIntent>;
  sprays: Spray[];
  nextSprayId: number;
};

const g = globalThis as unknown as { __dashpadMemory?: Data };

function data(): Data {
  if (!g.__dashpadMemory) {
    g.__dashpadMemory = { events: [], intents: new Map(), sprays: [], nextSprayId: 1 };
    seed(g.__dashpadMemory);
  }
  return g.__dashpadMemory;
}

function seed(d: Data) {
  const now = Date.now();
  const event: DashEvent = {
    id: randomUUID(),
    slug: 'tolu-dayo',
    title: 'Tolu & Dayo’s wedding',
    celebrants: 'Tolu & Dayo',
    mcName: 'MC Kunle',
    status: 'live',
    paused: false,
    nextUp: 'Couple trivia starts after this song',
    bigSprayKobo: 100_000_00,
    platformFeeBps: 500,
    mcFeeBps: 200,
    accountNumber: '0123456789',
    accountBank: 'Test Bank (demo)',
    accountName: 'DashPad / Tolu & Dayo',
    celebrantBank: null,
    celebrantAccountNumber: null,
    celebrantAccountName: null,
    mcBank: null,
    mcAccountNumber: null,
    mcAccountName: null,
    paystackSplitCode: null,
    createdAt: new Date(now).toISOString(),
  };
  d.events.push(event);

  const samples: [string, number, string | null, boolean][] = [
    ['Chief Bayo Adeyemi', 50000, 'Congratulations, my children!', false],
    ['Aunty Ngozi', 20000, 'Enjoy your day, Tolu!', false],
    ['Emeka and the boys', 100000, 'Dayo, you don hammer!', false],
    ['Mama Kemi', 10000, 'God bless this home.', false],
    ['Funmi in London', 25000, 'Watching from London. Love you both!', false],
    ['Mrs. Okafor', 40000, 'You two deserve all the joy.', true],
  ];
  samples.forEach(([name, amount, msg, anon], i) => {
    const amountKobo = amount * 100;
    d.sprays.push({
      id: d.nextSprayId++,
      eventId: event.id,
      reference: `seed-${i}`,
      source: 'qr',
      guestName: name,
      displayName: anon ? 'Anonymous guest' : name,
      message: msg,
      anonymous: anon,
      amountKobo,
      platformFeeKobo: Math.round(amountKobo * 0.05),
      mcFeeKobo: Math.round(amountKobo * 0.02),
      celebrantKobo: amountKobo,
      hidden: false,
      createdAt: new Date(now - (samples.length - i) * 60_000).toISOString(),
    });
  });
}

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;

  async listEvents() {
    return [...data().events].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
  async createEvent(e: NewEvent) {
    const d = data();
    if (d.events.some((x) => x.slug === e.slug)) throw new Error('That web address is already taken.');
    const event: DashEvent = { ...e, id: randomUUID(), createdAt: new Date().toISOString() };
    d.events.push(event);
    return event;
  }
  async updateEvent(id: string, patch: Partial<NewEvent>) {
    const d = data();
    const i = d.events.findIndex((e) => e.id === id);
    if (i < 0) throw new Error('Event not found');
    if (patch.slug && d.events.some((x) => x.slug === patch.slug && x.id !== id)) {
      throw new Error('That web address is already taken.');
    }
    d.events[i] = { ...d.events[i], ...patch };
    return d.events[i];
  }

  async createIntent(i: Omit<SprayIntent, 'createdAt' | 'status' | 'sprayId'>) {
    const intent: SprayIntent = { ...i, status: 'pending', sprayId: null, createdAt: new Date().toISOString() };
    data().intents.set(i.reference, intent);
    return intent;
  }
  async getIntent(reference: string) {
    return data().intents.get(reference) ?? null;
  }
  async markIntentPaid(reference: string, sprayId: number) {
    const intent = data().intents.get(reference);
    if (intent) Object.assign(intent, { status: 'paid', sprayId });
  }

  async insertSpray(s: NewSpray) {
    const d = data();
    const existing = d.sprays.find((x) => x.reference === s.reference);
    if (existing) return { spray: existing, created: false };
    const spray: Spray = { ...s, id: d.nextSprayId++, hidden: false, createdAt: new Date().toISOString() };
    d.sprays.push(spray);
    return { spray, created: true };
  }
  async listSprays(eventId: string, limit = 500) {
    return data()
      .sprays.filter((s) => s.eventId === eventId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit);
  }
  async setSprayHidden(eventId: string, sprayId: number, hidden: boolean) {
    const s = data().sprays.find((x) => x.id === sprayId && x.eventId === eventId);
    if (s) s.hidden = hidden;
  }
  async eventStats(eventId: string) {
    return computeStats(data().sprays.filter((s) => s.eventId === eventId));
  }
}
