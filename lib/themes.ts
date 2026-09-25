// Colour themes a planner can pick for their event's big screen: a ready-made
// preset, or their own two colours (made readable automatically, see colors.ts).
import { isHexColor, paletteFromColors } from './colors';

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

/** The planner's own colours: primary = background, secondary = highlight. */
export type ThemeColors = { primary: string; secondary: string };

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** A preset's two colours, used as the starting point for custom colours. */
export function presetColors(id: string | null | undefined): ThemeColors {
  const t = getTheme(id);
  return { primary: t.bg, secondary: t.accent };
}

export function cleanThemeColors(v: unknown): ThemeColors | null {
  if (!v || typeof v !== 'object') return null;
  const { primary, secondary } = v as Record<string, unknown>;
  return isHexColor(primary) && isHexColor(secondary) ? { primary: primary.toUpperCase(), secondary: secondary.toUpperCase() } : null;
}

export type ScreenTheme = Omit<Theme, 'id' | 'name'> & { light: boolean; notes: string[] };

/** The colours the big screen actually uses for an event. */
export function resolveTheme(id: string | null | undefined, colors: ThemeColors | null | undefined): ScreenTheme {
  const custom = cleanThemeColors(colors);
  if (id === 'custom' && custom) return paletteFromColors(custom.primary, custom.secondary);
  const t = getTheme(id);
  return { bg: t.bg, panel: t.panel, accent: t.accent, onAccent: t.onAccent, text: t.text, muted: t.muted, light: t.id === 'daylight', notes: [] };
}

export function themeVars(t: ScreenTheme): Record<string, string> {
  return {
    '--s-bg': t.bg,
    '--s-panel': t.panel,
    '--s-accent': t.accent,
    '--s-on-accent': t.onAccent,
    '--s-text': t.text,
    '--s-muted': t.muted,
  };
}

export function isThemeId(id: unknown): id is ThemeId {
  return THEMES.some((t) => t.id === id);
}

/** A preset id, or 'custom' for the planner's own colours. */
export type EventThemeId = ThemeId | 'custom';

export function isEventThemeId(id: unknown): id is EventThemeId {
  return id === 'custom' || isThemeId(id);
}
