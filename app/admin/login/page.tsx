import Logo from '@/components/Logo';
import AdminLoginForm from './AdminLoginForm';

export const metadata = { title: 'Admin · DashPad' };

export default function AdminLoginPage() {
  return (
    <main className="auth">
      <div className="auth-top"><span className="brand"><Logo size={30} /></span></div>
      <div className="auth-card">
        <h1>Admin login</h1>
        <AdminLoginForm />
      </div>
    </main>
  );
}
