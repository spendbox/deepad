// Small helpers about events that both the server and the browser use.

import type { EventType } from './types';

export type Phase = 'upcoming' | 'live' | 'ended';

/** Transfers only count between the start and end time the planner chose. */
export function eventPhase(e: { startsAt: string; endsAt: string; closedAt?: string | null }, now = Date.now()): Phase {
  if (e.closedAt || now >= new Date(e.endsAt).getTime()) return 'ended';
  if (now < new Date(e.startsAt).getTime()) return 'upcoming';
  return 'live';
}

export const EVENT_TYPES: { id: EventType; label: string; recipient: string; titleFor: (name: string) => string }[] = [
  { id: 'wedding', label: 'Wedding', recipient: 'the couple', titleFor: (n) => `${n}’s wedding` },
  { id: 'birthday', label: 'Birthday', recipient: 'the celebrant', titleFor: (n) => `${n}’s birthday` },
  { id: 'burial', label: 'Remembrance', recipient: 'the family', titleFor: (n) => `Celebrating ${n}` },
  { id: 'graduation', label: 'Graduation', recipient: 'the graduate', titleFor: (n) => `${n}’s graduation` },
  { id: 'other', label: 'Other party', recipient: 'the celebrant', titleFor: (n) => `${n}’s party` },
];

export const RECIPIENT_CHOICES = ['the couple', 'the celebrant', 'the birthday star', 'the family', 'the graduate', 'the host'];

export function isEventType(v: unknown): v is EventType {
  return EVENT_TYPES.some((t) => t.id === v);
}

/** How long an event may run, so a typo can't leave an account open for months. */
export const MAX_EVENT_HOURS = 72;

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
}
