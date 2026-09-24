import Link from 'next/link';

export default function Home() {
  return (
    <main className="landing">
      <div className="landing-inner">
        <div className="brand">DashPad</div>
        <h1>Spray the couple. No cash needed.</h1>
        <p>
          Guests scan a QR code or transfer to the account on the big screen. Every confirmed spray pops up live
          with their name, amount and message.
        </p>
        <div className="actions">
          <Link href="/screen/tolu-dayo" className="btn">See the demo screen</Link>
          <Link href="/s/tolu-dayo" className="btn ghost">Try the guest page</Link>
          <Link href="/admin" className="btn ghost">Admin</Link>
        </div>
      </div>
    </main>
  );
}
