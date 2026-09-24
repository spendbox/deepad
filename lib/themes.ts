// Colour themes a planner can pick for their event's big screen.

export type ThemeId = 'owambe' | 'emerald' | 'royal' | 'blush' | 'midnight' | 'coral' | 'daylight';

export type Theme = {
  id: ThemeId;
  name: string;
  bg: string; // page background
  panel: string; // cards
  accent: string; // amounts, account number bar
  onAccent: string; // text on the accent colour
  text: string;
  muted: string;
};

export const THEMES: Theme[] = [
  { id: 'owambe', name: 'Owambe Gold', bg: '#1F0A26', panel: '#33163D', accent: '#F2B437', onAccent: '#1F0A26', text: '#FFF6E6', muted: '#D4BFDD' },
  { id: 'emerald', name: 'Emerald', bg: '#06231A', panel: '#0E3B2C', accent: '#E9C46A', onAccent: '#06231A', text: '#F4FFF8', muted: '#A8D5BF' },
  { id: 'royal', name: 'Royal Blue', bg: '#0B1537', panel: '#16265C', accent: '#F5C542', onAccent: '#0B1537', text: '#F3F6FF', muted: '#AFC0F0' },
  { id: 'blush', name: 'Blush', bg: '#3A0D1E', panel: '#5A1A33', accent: '#FFB3C7', onAccent: '#3A0D1E', text: '#FFF1F5', muted: '#F2BFD0' },
  { id: 'midnight', name: 'Midnight Silver', bg: '#0E0E10', panel: '#1C1C21', accent: '#E8E8EC', onAccent: '#0E0E10', text: '#FFFFFF', muted: '#A1A1AA' },
  { id: 'coral', name: 'Coral Sunset', bg: '#2B0F0A', panel: '#4A1C12', accent: '#FF8A5B', onAccent: '#2B0F0A', text: '#FFF3EC', muted: '#F3C3AE' },
  { id: 'daylight', name: 'Daylight (bright rooms)', bg: '#FFF6E6', panel: '#FFFFFF', accent: '#1F0A26', onAccent: '#F2B437', text: '#1F0A26', muted: '#5E4A66' },
];

export const DEFAULT_THEME: ThemeId = 'owambe';

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function isThemeId(id: unknown): id is ThemeId {
  return THEMES.some((t) => t.id === id);
}
