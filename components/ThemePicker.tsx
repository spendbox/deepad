'use client';

import { useId } from 'react';
import { isHexColor } from '@/lib/colors';
import { presetColors, resolveTheme, THEMES, type ScreenTheme, type ThemeColors } from '@/lib/themes';

export type ThemeValue = { theme: string; colors: ThemeColors | null };

/** A tiny version of the big screen, in the chosen colours. */
export function ScreenPreview({ theme, label, size = 'md' }: { theme: ScreenTheme; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`screen-preview ${size}`} style={{ background: theme.bg, color: theme.text }} aria-hidden="true">
      <div className="sp-card" style={{ background: theme.panel, borderColor: theme.accent }}>
        <span className="sp-kicker" style={{ background: theme.accent, color: theme.onAccent }}>New spray!</span>
        <span className="sp-amt" style={{ color: theme.accent }}>₦20,000</span>
        <span className="sp-to" style={{ color: theme.muted }}>sent to {label}</span>
        {size === 'md' && <span className="sp-msg" style={{ color: theme.text }}>“Congratulations!”</span>}
      </div>
      <div className="sp-bar" style={{ background: theme.accent, color: theme.onAccent }}>
        <span className="sp-acct">0123 456 789</span>
        {size === 'md' && <span className="sp-bank">Wema Bank</span>}
      </div>
    </div>
  );
}

const SWATCHES = ['#1F0A26', '#0B1537', '#06231A', '#3A0D1E', '#7A1F1F', '#0E0E10', '#FFF6E6', '#FFFFFF'];
const HIGHLIGHTS = ['#F2B437', '#E9C46A', '#FFB3C7', '#FF8A5B', '#7FE0C4', '#8EC5FF', '#E8E8EC', '#1F0A26'];

function ColorField({
  label,
  hint,
  value,
  swatches,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  swatches: string[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field color-field">
      <label htmlFor={id}>{label}</label>
      <span className="hint">{hint}</span>
      <div className="color-row">
        <input id={id} type="color" className="color-input" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input
          className="input color-hex"
          value={value}
          maxLength={7}
          aria-label={`${label} colour code`}
          onChange={(e) => {
            const v = e.target.value.trim();
            const withHash = v.startsWith('#') ? v : `#${v}`;
            if (isHexColor(withHash)) onChange(withHash.toUpperCase());
          }}
        />
      </div>
      <div className="swatches" role="group" aria-label={`Suggested ${label.toLowerCase()} colours`}>
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            className="swatch"
            style={{ background: c }}
            aria-label={c}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

export default function ThemePicker({
  value,
  onChange,
  recipientLabel,
}: {
  value: ThemeValue;
  onChange: (v: ThemeValue) => void;
  recipientLabel: string;
}) {
  const custom = value.theme === 'custom';
  const colors = value.colors ?? presetColors(value.theme);
  const resolved = resolveTheme('custom', colors);

  return (
    <div className="theme-picker">
      <div className="theme-grid" role="group" aria-label="Ready-made themes">
        {THEMES.map((t) => {
          const th = resolveTheme(t.id, null);
          return (
            <button
              key={t.id}
              type="button"
              className="theme-card"
              aria-pressed={value.theme === t.id}
              onClick={() => onChange({ theme: t.id, colors: null })}
            >
              <ScreenPreview theme={th} label={recipientLabel} size="sm" />
              <span className="theme-name">
                {t.name}
                {value.theme === t.id && <span aria-hidden="true">✓</span>}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="theme-card theme-card-custom"
          aria-pressed={custom}
          onClick={() => onChange({ theme: 'custom', colors })}
        >
          <div className="custom-tile" style={{ background: `linear-gradient(135deg, ${colors.primary} 0 50%, ${colors.secondary} 50% 100%)` }}>
            <span>Your own colours</span>
          </div>
          <span className="theme-name">
            Custom
            {custom && <span aria-hidden="true">✓</span>}
          </span>
        </button>
      </div>

      {custom && (
        <div className="custom-colors">
          <div className="custom-fields">
            <ColorField
              label="Primary colour"
              hint="The background of the screen"
              value={colors.primary}
              swatches={SWATCHES}
              onChange={(primary) => onChange({ theme: 'custom', colors: { ...colors, primary } })}
            />
            <ColorField
              label="Secondary colour"
              hint="Amounts and the account number bar"
              value={colors.secondary}
              swatches={HIGHLIGHTS}
              onChange={(secondary) => onChange({ theme: 'custom', colors: { ...colors, secondary } })}
            />
          </div>
          <div className="custom-preview">
            <span className="field-label">How it will look</span>
            <ScreenPreview theme={resolved} label={recipientLabel} />
            {resolved.notes.length > 0 ? (
              <div className="contrast-note adjusted" role="status">
                <strong>We tweaked your colours so everyone can read the screen:</strong>
                <ul>{resolved.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            ) : (
              <div className="contrast-note" role="status">
                <strong>Easy to read.</strong> These colours have strong contrast.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
