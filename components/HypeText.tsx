import './hype.css';

/** The hype line, with its letters bouncing in a little wave. */
export default function HypeText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`hype-text ${className}`} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} aria-hidden="true" className="hype-ch" style={{ animationDelay: `${(i * 0.06).toFixed(2)}s` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}
