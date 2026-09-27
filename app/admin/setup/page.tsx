import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import AdminShell from '../AdminShell';
import SetupCheck from '../SetupCheck';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Setup · Admin · DashPad' };

export default async function AdminSetup() {
  await requireAdmin();
  const logs = await getStore().listPaymentLogs(40);
  return (
    <AdminShell tab="setup">
      <div className="adm-head">
        <div>
          <h1>Setup</h1>
          <p className="adm-sub">What DashPad needs to run, and what’s missing. Settings are added in Vercel, then redeploy.</p>
        </div>
      </div>
      <SetupCheck logs={logs} />
    </AdminShell>
  );
}
