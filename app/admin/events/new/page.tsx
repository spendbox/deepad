import { createEvent } from '../../actions';
import AdminShell from '../../AdminShell';
import EventForm from '../../EventForm';

export const metadata = { title: 'New event · DashPad admin' };

export default function NewEventPage() {
  return (
    <AdminShell>
      <h1>New event</h1>
      <EventForm action={createEvent} submitLabel="Create event" />
    </AdminShell>
  );
}
