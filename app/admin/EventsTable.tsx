import Link from 'next/link';
import { eventPhase, formatWhen } from '@/lib/event-info';
import { naira, percent } from '@/lib/money';
import PhasePill from '../dashboard/PhasePill';
import type { EventsWithTotals } from './data';

/** Events, newest first, with how much each received. */
export default function EventsTable({ data, limit }: { data: EventsWithTotals; limit?: number }) {
  const rows = limit ? data.events.slice(0, limit) : data.events;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>Planner</th><th>When</th><th>Status</th><th>Sprayed</th><th>Planner cut</th><th>Account</th></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td><Link href={`/admin/events/${e.id}`}>{e.title}</Link></td>
              <td>{data.plannerName.get(e.plannerId) ?? '—'}</td>
              <td className="num">{formatWhen(e.startsAt)}</td>
              <td>{e.deletedAt ? <span className="pill ended">Deleted by planner</span> : <PhasePill phase={eventPhase(e)} />}</td>
              <td className="num"><strong>{naira(data.sums.get(e.id)?.totalKobo ?? 0)}</strong></td>
              <td className="num">{percent(e.plannerFeeBps)}</td>
              <td>{e.setupStatus === 'ready' ? e.accountNumber : <span className={`pill ${e.setupStatus === 'failed' ? 'failed' : ''}`}>{e.setupStatus}</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7}>No events yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
