import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import Logo from '@/components/Logo';
import { eventPhase } from '@/lib/event-info';
import { isCutout } from '@/lib/photos';
import { getStore } from '@/lib/store';
import { resolveTheme, themeVars } from '@/lib/themes';
import { submitGuestLine } from '../../actions';
import WriteLine from './WriteLine';
import './write.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

const getEvent = cache((slug: string) => getStore().getEventBySlug(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEvent((await params).slug);
  return {
    title: event ? `Write a line for ${event.celebrantName} · DashPad` : 'DashPad',
    description: event ? `Your line shows on the big screen at ${event.title}.` : undefined,
    robots: { index: false },
  };
}

// The page guests open from the planner's shared link: write a line (with
// your name and, if you like, a photo) and it shows on the big screen.
export default async function WriteLinePage({ params }: Props) {
  const { slug } = await params;
  const event = await getEvent(slug);
  if (!event || event.deletedAt) notFound();
  const theme = resolveTheme(event.theme, event.themeColors);
  const photo = event.photos.find(isCutout) ?? event.photos[0] ?? null;
  const ended = eventPhase(event) === 'ended';

  return (
    <div className="wl" style={themeVars(theme) as React.CSSProperties}>
      <header className="wl-top">
        <Logo size={26} tone={theme.light ? 'light' : 'dark'} />
        <span className="wl-event">{event.title}</span>
      </header>

      <section className="wl-hero">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={`Photo of ${event.celebrantName}`} className={`wl-photo${isCutout(photo) ? ' cutout' : ''}`} />
        )}
        <div className="wl-hero-text">
          <h1>Write a line for {event.celebrantName}</h1>
          <p>Your line shows on the big screen at the party, with your name and photo if you add one.</p>
        </div>
      </section>

      <main className="wl-card">
        {ended ? (
          <div className="wl-done">
            <h2>This party has ended</h2>
            <p className="hint">Thank you for celebrating {event.celebrantName}!</p>
          </div>
        ) : (
          <WriteLine action={submitGuestLine.bind(null, slug)} celebrantName={event.celebrantName} />
        )}
      </main>

      <footer className="wl-foot">Made with DashPad: digital money spraying for Nigerian parties.</footer>
    </div>
  );
}
