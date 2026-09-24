// DashPad logo: a gold "D" on aubergine with a naira note flying off it
// (a spray), plus the wordmark. Pure SVG so it is sharp at every size.

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="15" fill="#1F0A26" />
      <path d="M17 15h12.5a17 17 0 0 1 0 34H17z" fill="none" stroke="#F2B437" strokeWidth="7.5" strokeLinejoin="round" />
      <g transform="rotate(-24 47 17)">
        <rect x="37" y="11" width="21" height="12" rx="2.5" fill="#1F7A4D" stroke="#1F0A26" strokeWidth="2" />
        <circle cx="47.5" cy="17" r="3" fill="none" stroke="#CFF2DC" strokeWidth="1.6" />
      </g>
    </svg>
  );
}

/** Mark + "DashPad". `tone` is the background it sits on. */
export default function Logo({ size = 30, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <span className="logo" style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3 }}>
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: 'var(--display)',
          fontWeight: 800,
          fontSize: size * 0.72,
          letterSpacing: '-0.01em',
          lineHeight: 1,
          color: tone === 'dark' ? '#FFF6E6' : '#1F0A26',
        }}
      >
        Dash<span style={{ color: '#F2B437' }}>Pad</span>
      </span>
    </span>
  );
}
