import Logo from '@/components/Logo';
import Link from 'next/link';
import SprayScene from './SprayScene';
import './landing.css';

// Static: built once and served instantly from the edge. Logged-in planners who
// tap Log in or Sign up are sent straight to their dashboard.

const STEPS = [
  {
    title: 'Create your event',
    body: 'Sign up, then set up the party in six quick steps on your phone: who’s celebrating, when, the look, and where the money goes.',
  },
  {
    title: 'Put your link on the big screen',
    body: 'You get a unique link and an account number just for the event. Open the link on the venue TV or projector. That’s it.',
  },
  {
    title: 'Guests spray by transfer',
    body: 'Guests send money to the account from their usual bank app. Every transfer pops up on screen with the note they typed.',
  },
];

const FEATURES = [
  { title: 'No cash, all the show', body: 'Keep the owambe energy without handling naira notes on the dance floor.' },
  { title: 'Only real money shows', body: 'Nothing appears on screen until the bank transfer is confirmed. No fake alerts.' },
  { title: 'Guests stay anonymous', body: 'The screen shows the amount and the message, never who sent it.' },
  { title: 'Earn from every spray', body: 'Set your cut from 0% to 45% of every transfer. It’s paid to your account automatically.' },
  { title: 'Paid within 2 business days', body: 'Every transfer is split automatically and paid to the celebrant and to you within 2 business days. DashPad never holds the funds.' },
  { title: 'Full report by email', body: 'When the party ends, the account closes and you get a list of everyone who sprayed.' },
];

const FAQ = [
  {
    q: 'What does DashPad cost?',
    a: 'DashPad takes 5% of each transfer, and that covers the payment processing fee too. Nothing to pay upfront, no monthly fee.',
  },
  {
    q: 'How much can I earn as the planner or MC?',
    a: 'You choose, from 0% to 45% of every transfer. For example, at 10%, a ₦10,000 spray pays you ₦1,000.',
  },
  {
    q: 'When do the celebrant and I get paid?',
    a: 'Payouts reach both bank accounts within 2 business days of each spray. DashPad covers the payment processing fee, so nothing else is taken.',
  },
  {
    q: 'Do guests need to download an app?',
    a: 'No. They transfer from the bank app they already use, to the account number shown on the big screen.',
  },
  {
    q: 'What happens after the party?',
    a: 'At the end time you chose, the account stops taking money and we email you the full list of who sprayed.',
  },
  {
    q: 'What if the venue internet goes off?',
    a: 'The account number stays on screen and guests can still pay from their phones. When the connection returns, the screen catches up on every spray.',
  },
];

export default function Home() {

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link href="/" className="brand" aria-label="DashPad home"><Logo size={34} /></Link>
        <nav>
          <Link href="/login" className="lp-navlink">Log in</Link>
          <Link href="/signup" className="btn btn-gold btn-sm">Sign up</Link>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-text">
          <p className="lp-kicker">For event planners and MCs</p>
          <h1>Spray without cash. Keep the show going.</h1>
          <p className="lp-lead">
            Guests transfer straight to your event account, and every spray flashes live on the big screen in real time.
            Give your crowd instant spotlight while you earn a cut of every naira.
          </p>
          <div className="actions">
            <Link href="/signup" className="btn btn-gold btn-lg">Create your spray event</Link>
            <Link href="/login" className="btn btn-ghost lp-ghost btn-lg">Log in</Link>
          </div>
          <p className="lp-small">Free to set up. DashPad takes 5% per transfer.</p>
        </div>

        <div className="lp-mock">
          <SprayScene />
          <div className="lp-mock-screen" aria-hidden="true">
            <div className="lp-mock-top">
              <span>Beatrice &amp; Lola’s wedding</span>
              <span className="lp-mock-live">● Live</span>
            </div>
            <div className="lp-mock-pop">
              <span className="lp-mock-amt">₦50,000</span>
              <span className="lp-mock-to">sent to the couple</span>
              <span className="lp-mock-msg">“Congratulations, my children!”</span>
            </div>
            <div className="lp-mock-bar">
              <span className="lp-mock-label">Transfer to spray</span>
              <span className="lp-mock-acct">0123 456 789</span>
              <span className="lp-mock-bank">Wema Bank · DashPad/Beatrice &amp; Lola</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section">
        <h2>How it works</h2>
        <ol className="lp-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="lp-step-n">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section lp-light">
        <h2>Why planners use DashPad</h2>
        <div className="lp-features">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-light">
        <h2>Simple pricing</h2>
        <div className="lp-price">
          <div className="lp-price-card">
            <div className="lp-price-big">5%</div>
            <p>DashPad’s fee on each transfer. It includes the payment processing fee. No setup fee, no monthly fee.</p>
          </div>
          <div className="lp-price-card lp-price-you">
            <div className="lp-price-big">0–45%</div>
            <p>Your cut, which you choose for each event. Paid to your bank account within 2 business days.</p>
          </div>
        </div>
      </section>

      <section className="lp-section lp-light">
        <h2>Questions</h2>
        <div className="lp-faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-cta">
        <h2>Your next party, sprayed right.</h2>
        <Link href="/signup" className="btn btn-gold btn-lg">Create your spray event</Link>
      </section>

      <footer className="lp-foot">
        <Logo size={26} />
        <span>© {new Date().getFullYear()} DashPad. Made for Nigerian celebrations.</span>
      </footer>
    </div>
  );
}
