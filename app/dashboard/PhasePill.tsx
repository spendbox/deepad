import type { Phase } from '@/lib/event-info';

const TEXT: Record<Phase, string> = { upcoming: 'Upcoming', live: 'Live now', ended: 'Ended' };

export default function PhasePill({ phase }: { phase: Phase }) {
  return <span className={`pill ${phase}`}>{phase === 'live' ? '● ' : ''}{TEXT[phase]}</span>;
}
