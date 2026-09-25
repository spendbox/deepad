// A round picture for a person: their photo, or their first letter on a colour
// picked from their name (the same name always gets the same colour).

const COLORS = ['#1F7A5C', '#2D4FA3', '#B4541A', '#6B2FA0', '#0E7490', '#C2185B'];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function Avatar({
  name,
  photo,
  size,
  letters,
  className = '',
}: {
  name: string;
  photo?: string | null;
  size: number;
  /** What to show without a photo (default: the first letter). */
  letters?: string;
  className?: string;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.46) };
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt="" className={`avatar ${className}`} style={{ ...style, objectFit: 'cover' }} />;
  }
  return (
    <span className={`avatar ${className}`} style={{ ...style, background: avatarColor(name) }} aria-hidden="true">
      {letters ?? (name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
