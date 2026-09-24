import Link from 'next/link';
import ResetForm from './ResetForm';

export const metadata = { title: 'Choose a new password · DashPad' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="auth">
      <div className="auth-top"><Link href="/" className="brand">DashPad</Link></div>
      <div className="auth-card">
        <h1>Choose a new password</h1>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <div className="banner error">This link is incomplete. Please <Link href="/forgot-password">ask for a new one</Link>.</div>
        )}
      </div>
    </main>
  );
}
