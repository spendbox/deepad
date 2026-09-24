import type { PaymentLog } from '@/lib/types';

const LABEL: Record<PaymentLog['outcome'], string> = {
  recorded: 'Shown ✓',
  duplicate: 'Already had it',
  ignored: 'Ignored',
  unmatched: 'No matching event',
  bad_signature: 'Rejected: bad signature',
  error: 'Error',
};

export default function PaymentLogTable({ logs, title = 'Payment notifications' }: { logs: PaymentLog[]; title?: string }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <span className="hint">Every notification from Paystack, newest first. “Check” rows come from the backup check.</span>
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>From</th><th>Result</th><th>Reference</th><th>Details</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="num">{new Date(l.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}</td>
                <td>{l.source === 'webhook' ? 'Webhook' : 'Check'}</td>
                <td>
                  <span className={`pill ${l.outcome === 'recorded' ? 'live' : l.outcome === 'error' || l.outcome === 'bad_signature' || l.outcome === 'unmatched' ? 'failed' : ''}`}>
                    {LABEL[l.outcome]}
                  </span>
                </td>
                <td className="num">{l.reference ?? '—'}</td>
                <td style={{ minWidth: 260 }}>{l.detail ?? ''}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5}>Nothing received yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
