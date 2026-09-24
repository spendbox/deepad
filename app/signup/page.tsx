import Logo from '@/components/Logo';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentPlanner } from '@/lib/session';
import SignupForm from './SignupForm';

export const metadata = { title: 'Sign up · DashPad' };

export default async function SignupPage() {
  if (await currentPlanner()) redirect('/dashboard');
  return (
    <main className="auth">
      <div className="auth-top"><Link href="/" className="brand" aria-label="DashPad home"><Logo size={30} /></Link></div>
      <div className="auth-card">
        <div className="steps-dots" aria-label="Step 1 of 2"><span className="on" /><span /></div>
        <div>
          <h1>Create your planner account</h1>
          <p className="hint" style={{ marginTop: 8 }}>Takes a minute. Next, you’ll add the bank account where your earnings are paid.</p>
        </div>
        <SignupForm />
        <p className="hint">Already have an account? <Link href="/login">Log in</Link></p>
      </div>
    </main>
  );
}
