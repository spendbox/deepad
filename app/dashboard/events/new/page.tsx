import { requirePlanner } from '@/lib/session';
import EventWizard from './EventWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New event · DashPad' };

export default async function NewEventPage() {
  const planner = await requirePlanner();
  return <EventWizard plannerHasBank={!!planner.accountNumber} />;
}
