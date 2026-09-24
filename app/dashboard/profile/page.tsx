import { requirePlanner } from '@/lib/session';
import DashShell from '../DashShell';
import ProfileForm from './ProfileForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile · DashPad' };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const planner = await requirePlanner();
  const welcome = (await searchParams).welcome === '1';
  return (
    <DashShell>
      {welcome && <div className="steps-dots" aria-label="Step 2 of 2"><span className="on" /><span className="on" /></div>}
      <div>
        <h1>{welcome ? 'Where should we pay you?' : 'Your profile'}</h1>
        <p className="hint" style={{ marginTop: 8 }}>
          Your cut from every event is paid into this account automatically.
        </p>
      </div>
      <ProfileForm
        welcome={welcome}
        planner={{
          name: planner.name,
          email: planner.email,
          phone: planner.phone,
          bankCode: planner.bankCode ?? '',
          bankName: planner.bankName ?? '',
          accountNumber: planner.accountNumber ?? '',
          accountName: planner.accountName ?? '',
        }}
      />
    </DashShell>
  );
}
