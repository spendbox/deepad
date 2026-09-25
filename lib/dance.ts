// How the cut-out celebrant moves on the big screen between sprays.

export type DanceStyle = 'groove' | 'bounce' | 'shimmy' | 'float' | 'still';

export const DANCE_STYLES: { id: DanceStyle; name: string; hint: string }[] = [
  { id: 'groove', name: 'Groove', hint: 'Sways side to side' },
  { id: 'bounce', name: 'Bounce', hint: 'Hops on the beat' },
  { id: 'shimmy', name: 'Shaku', hint: 'Quick shoulder shake' },
  { id: 'float', name: 'Float', hint: 'Slow and graceful' },
  { id: 'still', name: 'Still', hint: 'Only moves when sprayed' },
];

export const DEFAULT_DANCE: DanceStyle = 'groove';

export function isDanceStyle(v: unknown): v is DanceStyle {
  return DANCE_STYLES.some((d) => d.id === v);
}
