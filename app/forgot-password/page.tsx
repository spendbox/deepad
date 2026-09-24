import Logo from '@/components/Logo';
import Link from 'next/link';
import ForgotForm from './ForgotForm';

export const metadata = { title: 'Forgot password · DashPad' };

export default function ForgotPasswordPage() {
  return (
    <main className="auth">
      <div className="auth-top"><Link href="/" className="brand" aria-label="DashPad home"><Logo size={30} /></Link></div>
      <div className="auth-card">
        <div>
          <h1>Forgot your password?</h1>
          <p className="hint" style={{ marginTop: 8 }}>Enter your email and we’ll send you a link to choose a new one.</p>
        </div>
        <ForgotForm />
        <p className="hint"><Link href="/login">Back to log in</Link></p>
      </div>
    </main>
  );
}
