import { getTheme } from '@/lib/themes';

export function themeVars(themeId: string): React.CSSProperties {
  const t = getTheme(themeId);
  return {
    '--s-bg': t.bg,
    '--s-panel': t.panel,
    '--s-accent': t.accent,
    '--s-on-accent': t.onAccent,
    '--s-text': t.text,
    '--s-muted': t.muted,
  } as React.CSSProperties;
}
