import Logo from '@/components/Logo';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="auth">
      <div className="auth-top"><Link href="/" className="brand" aria-label="DashPad home"><Logo size={30} /></Link></div>
      <div className="auth-card">
        <h1>We couldn’t find that page.</h1>
        <p className="hint">Check the link, or ask the event planner for the right one.</p>
        <Link href="/" className="btn btn-dark">Go home</Link>
      </div>
    </main>
  );
}
