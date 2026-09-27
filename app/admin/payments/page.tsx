import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import AdminShell from '../AdminShell';
import PaymentLogTable from '../PaymentLogTable';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payments · Admin · DashPad' };

export default async function AdminPayments() {
  await requireAdmin();
  const logs = await getStore().listPaymentLogs(200);
  return (
    <AdminShell tab="payments">
      <div className="adm-head">
        <div>
          <h1>Payments</h1>
          <p className="adm-sub">Every payment notification from Paystack (the latest 200), for checking and fixing problems.</p>
        </div>
      </div>
      <PaymentLogTable logs={logs} title="Payment notifications" />
    </AdminShell>
  );
}
