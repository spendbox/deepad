import AdminLoginForm from './AdminLoginForm';

export const metadata = { title: 'Admin · DashPad' };

export default function AdminLoginPage() {
  return (
    <main className="auth">
      <div className="auth-top"><span className="brand">DashPad admin</span></div>
      <div className="auth-card">
        <h1>Admin login</h1>
        <AdminLoginForm />
      </div>
    </main>
  );
}
