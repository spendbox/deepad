// An animated illustration for the homepage: a celebrant dancing with arms
// raised while naira notes shower down. Pure SVG + CSS, so it loads instantly
// and never needs an image file.

const NOTES = [
  { x: 40, delay: 0, dur: 4.2, rot: -30 },
  { x: 95, delay: 1.3, dur: 3.6, rot: 25 },
  { x: 150, delay: 0.6, dur: 4.8, rot: -15 },
  { x: 250, delay: 2.1, dur: 3.9, rot: 35 },
  { x: 305, delay: 0.3, dur: 4.4, rot: -25 },
  { x: 350, delay: 1.7, dur: 3.7, rot: 15 },
  { x: 70, delay: 2.8, dur: 4.6, rot: 40 },
  { x: 330, delay: 3.2, dur: 4.1, rot: -40 },
  { x: 200, delay: 2.5, dur: 5.0, rot: 10 },
  { x: 120, delay: 3.6, dur: 3.8, rot: -20 },
];

function Note({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-22" y="-11" width="44" height="22" rx="3" fill="#1F7A4D" stroke="#3FA56E" strokeWidth="2" />
      <text x="0" y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#CFF2DC" fontFamily="system-ui, sans-serif">₦</text>
    </g>
  );
}

export default function SprayScene() {
  return (
    <svg className="lp-scene" viewBox="0 0 400 420" role="img" aria-label="A celebrant dancing while guests spray money">
      <defs>
        <radialGradient id="glow" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#F2B437" stopOpacity=".45" />
          <stop offset="100%" stopColor="#F2B437" stopOpacity="0" />
        </radialGradient>
        <pattern id="aso" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="14" height="14" fill="#F2B437" />
          <rect width="5" height="14" fill="#E39B1B" />
        </pattern>
      </defs>

      <circle cx="200" cy="200" r="200" fill="url(#glow)" />

      {/* Notes raining down behind the dancer */}
      {NOTES.slice(0, 5).map((n, i) => (
        <g key={`b${i}`} className="lp-fall" style={{ animationDelay: `${n.delay}s`, animationDuration: `${n.dur}s` }}>
          <g transform={`translate(${n.x} 0) rotate(${n.rot})`}>
            <Note scale={0.9} />
          </g>
        </g>
      ))}

      {/* The dancer */}
      <g className="lp-dancer">
        {/* Left arm (raised, waving) */}
        <g className="lp-arm-l">
          <path d="M168 190 Q140 150 128 100" stroke="#7A4A33" strokeWidth="17" strokeLinecap="round" fill="none" />
          <circle cx="127" cy="94" r="11" fill="#7A4A33" />
        </g>
        {/* Right arm holding a fan of notes */}
        <g className="lp-arm-r">
          <path d="M232 190 Q262 150 274 100" stroke="#7A4A33" strokeWidth="17" strokeLinecap="round" fill="none" />
          <g transform="translate(276 84)">
            <g transform="rotate(-35)"><Note scale={0.8} /></g>
            <g transform="rotate(-10)"><Note scale={0.8} /></g>
            <g transform="rotate(15)"><Note scale={0.8} /></g>
          </g>
          <circle cx="274" cy="96" r="11" fill="#7A4A33" />
        </g>
        {/* Agbada / flowing outfit */}
        <path d="M160 178 Q200 166 240 178 L292 400 Q200 418 108 400 Z" fill="url(#aso)" />
        <path d="M160 178 Q200 166 240 178 L232 214 Q200 224 168 214 Z" fill="#E39B1B" />
        <path d="M188 176 L200 206 L212 176" fill="none" stroke="#1F0A26" strokeWidth="3" strokeLinejoin="round" />
        {/* Head, face, gele */}
        <rect x="190" y="150" width="20" height="24" rx="8" fill="#7A4A33" />
        <circle cx="200" cy="130" r="28" fill="#8A5A40" />
        <path d="M188 138 Q200 148 212 138" stroke="#1F0A26" strokeWidth="3" strokeLinecap="round" fill="none" />
        <circle cx="189" cy="126" r="3" fill="#1F0A26" />
        <circle cx="211" cy="126" r="3" fill="#1F0A26" />
        <path d="M166 118 Q170 76 206 78 Q246 80 240 112 Q256 96 250 80 Q232 60 200 62 Q160 66 160 104 Z" fill="#33163D" />
        <path d="M172 112 Q200 92 236 108" stroke="#F2B437" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>

      {/* A guest's hand at the side, spraying notes onto the dancer */}
      <g className="lp-sprayer">
        <path d="M-10 236 Q36 226 64 208" stroke="#5C3726" strokeWidth="20" strokeLinecap="round" fill="none" />
        <circle cx="68" cy="205" r="13" fill="#5C3726" />
      </g>
      <g className="lp-flick">
        <Note x={74} y={198} scale={0.8} />
      </g>
      <g className="lp-flick lp-flick-2">
        <Note x={74} y={198} scale={0.8} />
      </g>

      {/* Notes falling in front */}
      {NOTES.slice(5).map((n, i) => (
        <g key={`f${i}`} className="lp-fall" style={{ animationDelay: `${n.delay}s`, animationDuration: `${n.dur}s` }}>
          <g transform={`translate(${n.x} 0) rotate(${n.rot})`}>
            <Note />
          </g>
        </g>
      ))}
    </svg>
  );
}
