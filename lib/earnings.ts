// Group a planner's earnings into hours, days, weeks or months for the Earnings chart.
// Times are Nigerian (West Africa Time, UTC+1, no daylight saving).

export type RangeId = '24h' | '7d' | '30d' | '90d' | '12m' | 'all';

export const RANGES: { id: RangeId; label: string }[] = [
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '3 months' },
  { id: '12m', label: '12 months' },
  { id: 'all', label: 'All time' },
];

export function isRangeId(v: unknown): v is RangeId {
  return RANGES.some((r) => r.id === v);
}

const WAT = 3600_000; // UTC+1
const HOUR = 3_600_000;
const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Unit = 'hour' | 'day' | 'week' | 'month';

/** Start of the day/week(Monday)/month containing `t`, in Nigerian time, as a UTC timestamp. */
function bucketStart(t: number, unit: Unit): number {
  if (unit === 'hour') return Math.floor(t / HOUR) * HOUR; // WAT is a whole hour off UTC
  const d = new Date(t + WAT);
  if (unit === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - WAT;
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - WAT;
  if (unit === 'day') return dayStart;
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  return dayStart - weekday * DAY;
}

function nextBucket(t: number, unit: Unit): number {
  if (unit === 'hour') return t + HOUR;
  if (unit === 'day') return t + DAY;
  if (unit === 'week') return t + 7 * DAY;
  const d = new Date(t + WAT);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - WAT;
}

/** "9pm", "9:30pm": a clock time in Nigeria. */
export function clockLabel(t: number): string {
  const d = new Date(t + WAT);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

function label(t: number, unit: Unit): string {
  if (unit === 'hour') return clockLabel(t);
  const d = new Date(t + WAT);
  if (unit === 'month') return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Where a range starts (null = all time) and how its bars are grouped. */
export function rangeWindow(range: RangeId, now: number, firstActivity: number | null): { from: number; unit: Unit } {
  switch (range) {
    case '24h':
      return { from: bucketStart(now, 'hour') - 23 * HOUR, unit: 'hour' };
    case '7d':
      return { from: bucketStart(now, 'day') - 6 * DAY, unit: 'day' };
    case '30d':
      return { from: bucketStart(now, 'day') - 29 * DAY, unit: 'day' };
    case '90d':
      return { from: bucketStart(now - 89 * DAY, 'week'), unit: 'week' };
    case '12m': {
      const d = new Date(now + WAT);
      return { from: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1) - WAT, unit: 'month' };
    }
    case 'all':
    default:
      return { from: bucketStart(firstActivity ?? now, 'month'), unit: 'month' };
  }
}

export type Bucket = { start: number; label: string; kobo: number; sprays: number };

/** A longer label for tooltips: "Sat 21 Sep, 9pm". */
export function fullLabel(t: number, unit: Unit): string {
  const d = new Date(t + WAT);
  const day = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (unit === 'hour') return `${day}, ${clockLabel(t)}`;
  if (unit === 'week') return `Week of ${day}`;
  if (unit === 'month') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return day;
}

/** One bar per day/week/month from `from` to now, including empty ones. */
export function bucketize(
  items: { at: number; kobo: number }[],
  from: number,
  unit: Unit,
  now: number,
): Bucket[] {
  const buckets: Bucket[] = [];
  const index = new Map<number, Bucket>();
  for (let t = bucketStart(from, unit); t <= now; t = nextBucket(t, unit)) {
    const b = { start: t, label: label(t, unit), kobo: 0, sprays: 0 };
    buckets.push(b);
    index.set(t, b);
    if (buckets.length > 400) break;
  }
  for (const it of items) {
    if (it.at < from || it.at > now) continue;
    const b = index.get(bucketStart(it.at, unit));
    if (b) {
      b.kobo += it.kobo;
      b.sprays += 1;
    }
  }
  return buckets;
}

/**
 * Earnings through one event, in slots of 15 minutes, 30 minutes or an hour
 * depending on how long it runs, so the planner sees when the money came in.
 */
export function eventTimeline(
  items: { at: number; kobo: number }[],
  startsAt: number,
  endsAt: number,
  now: number,
): { buckets: (Bucket & { tip: string })[]; slotLabel: string } {
  const length = endsAt - startsAt;
  const slot = length <= 4 * HOUR ? 15 * 60_000 : length <= 10 * HOUR ? 30 * 60_000 : HOUR;
  const slotLabel = slot === HOUR ? 'hour' : `${slot / 60_000} minutes`;
  const first = Math.floor(startsAt / slot) * slot;
  const last = Math.min(endsAt, Math.max(now, startsAt));
  const buckets: (Bucket & { tip: string })[] = [];
  for (let t = first; t < last && buckets.length < 300; t += slot) {
    buckets.push({ start: t, label: clockLabel(t), tip: `${clockLabel(t)} to ${clockLabel(t + slot)}`, kobo: 0, sprays: 0 });
  }
  for (const it of items) {
    const i = Math.floor((it.at - first) / slot);
    if (i >= 0 && i < buckets.length) {
      buckets[i].kobo += it.kobo;
      buckets[i].sprays += 1;
    }
  }
  return { buckets, slotLabel };
}
