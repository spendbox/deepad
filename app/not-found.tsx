import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <div className="brand">DashPad</div>
        <h1 style={{ fontSize: 36 }}>We couldn’t find that page.</h1>
        <p>Check the link, or ask the MC for the QR code.</p>
        <div className="actions"><Link href="/" className="btn">Go home</Link></div>
      </div>
    </main>
  );
}
