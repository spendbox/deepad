import LoginForm from './LoginForm';

export const metadata = { title: 'Admin login · DashPad' };

export default function LoginPage() {
  return (
    <main className="landing">
      <div className="landing-inner" style={{ width: '100%', maxWidth: 420 }}>
        <div className="brand">DashPad</div>
        <h1 style={{ fontSize: 36 }}>Admin portal</h1>
        <LoginForm />
      </div>
    </main>
  );
}
