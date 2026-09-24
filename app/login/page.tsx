import Logo from '@/components/Logo';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPlanner } from '@/lib/session';
import LoginForm from './LoginForm';

export const metadata = { title: 'Log in · DashPad' };

export default async function LoginPage() {
  if (await currentPlanner()) redirect('/dashboard');
  return (
    <main className="auth">
      <div className="auth-top"><Link href="/" className="brand" aria-label="DashPad home"><Logo size={30} /></Link></div>
      <div className="auth-card">
        <h1>Welcome back</h1>
        <LoginForm />
        <p className="hint">New to DashPad? <Link href="/signup">Create an account</Link></p>
      </div>
    </main>
  );
}
