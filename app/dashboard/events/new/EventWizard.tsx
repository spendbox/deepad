'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BankAccountFields, { type BankAccount } from '@/components/BankAccountFields';
import PayoutNote from '@/components/PayoutNote';
import PhotoPicker from '@/components/PhotoPicker';
import SlugField from '@/components/SlugField';
import { slugify, slugProblem } from '@/lib/slug';
import { EVENT_TYPES, MAX_EVENT_HOURS, RECIPIENT_CHOICES } from '@/lib/event-info';
import { naira, PLATFORM_FEE_BPS, splitTransfer } from '@/lib/money';
import { THEMES } from '@/lib/themes';
import type { EventType } from '@/lib/types';
import { createSprayEvent } from '../../../actions';

const DRAFT_KEY = 'dashpad:event-draft';
const STEP_NAMES = ['Celebration', 'Date & time', 'Theme', 'Photos', 'Payout', 'Your cut', 'Review'];
// Step numbers, so the checks below stay readable.
const S = { what: 0, when: 1, theme: 2, photos: 3, payout: 4, cut: 5, review: 6 };

type Draft = {
  eventType: EventType;
  celebrantName: string;
  title: string;
  titleEdited: boolean;
  slug: string;
  slugEdited: boolean;
  photos: string[];
  recipientLabel: string;
  startsAt: string; // datetime-local value, in the phone's time zone
  endsAt: string;
  theme: string;
  payout: BankAccount;
  plannerFeePercent: number;
};

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDraft(): Draft {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 6 * 3600_000);
  return {
    eventType: 'wedding',
    celebrantName: '',
    title: '',
    titleEdited: false,
    slug: '',
    slugEdited: false,
    photos: [],
    recipientLabel: 'the couple',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    theme: 'owambe',
    payout: { bankCode: '', bankName: '', accountNumber: '', accountName: '' },
    plannerFeePercent: 10,
  };
}

function when(local: string) {
  const d = new Date(local);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function EventWizard({ plannerHasBank }: { plannerHasBank: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(defaultDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slugOk, setSlugOk] = useState(true);

  // Keep a draft on this phone, so a dropped connection doesn't lose their work.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setD({ ...defaultDraft(), ...JSON.parse(saved) });
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {}
  }, [d, loaded]);

  const typeInfo = EVENT_TYPES.find((t) => t.id === d.eventType)!;
  const title = d.titleEdited ? d.title : d.celebrantName.trim() ? typeInfo.titleFor(d.celebrantName.trim()) : '';
  // The link follows the celebrant's name until the planner edits it.
  const slug = d.slugEdited ? d.slug : slugify(d.celebrantName);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const startMs = new Date(d.startsAt).getTime();
  const endMs = new Date(d.endsAt).getTime();
  const hours = (endMs - startMs) / 3600_000;

  function problem(s: number): string | null {
    if (s === S.what) {
      if (d.celebrantName.trim().length < 2) return 'Enter who is being celebrated.';
      const sp = slugProblem(slug);
      if (sp) return sp;
      if (!slugOk) return 'That event link is taken. Please choose another.';
    }
    if (s === S.when) {
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'Choose a start and end time.';
      if (endMs <= startMs) return 'The end time must be after the start time.';
      if (endMs < Date.now()) return 'The end time has already passed.';
      if (hours > MAX_EVENT_HOURS) return `An event can run for at most ${MAX_EVENT_HOURS} hours.`;
    }
    if (s === S.payout) {
      if (d.payout.accountNumber.length !== 10) return 'Enter the 10-digit account number.';
      if (!d.payout.bankName) return 'Choose the bank.';
      if (!d.payout.accountName) return 'We need the name on the account.';
    }
    if (s === S.cut && d.plannerFeePercent > 0 && !plannerHasBank) return 'Add your own bank account in your profile first, or set your cut to 0%.';
    return null;
  }

  function next() {
    const p = problem(step);
    if (p) return setError(p);
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_NAMES.length - 1));
    window.scrollTo({ top: 0 });
  }

  function back() {
    setError(null);
    if (step === 0) router.push('/dashboard');
    else setStep((s) => s - 1);
  }

  async function create() {
    for (let s = 0; s < S.review; s++) {
      const p = problem(s);
      if (p) {
        setStep(s);
        return setError(p);
      }
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createSprayEvent({
        slug,
        photos: d.photos,
        eventType: d.eventType,
        celebrantName: d.celebrantName,
        title,
        recipientLabel: d.recipientLabel,
        startsAt: new Date(d.startsAt).toISOString(),
        endsAt: new Date(d.endsAt).toISOString(),
        theme: d.theme,
        payoutBankCode: d.payout.bankCode,
        payoutBankName: d.payout.bankName,
        payoutAccountNumber: d.payout.accountNumber,
        payoutAccountName: d.payout.accountName,
        plannerFeePercent: d.plannerFeePercent,
      });
      if ('error' in res) {
        setError(res.error);
        setBusy(false);
        return;
      }
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      router.push(`/dashboard/events/${res.id}?created=1`);
    } catch {
      setError('Something went wrong. Check your internet and try again.');
      setBusy(false);
    }
  }

  const example = splitTransfer(10_000_00, Math.round(d.plannerFeePercent * 100));
  const last = step === STEP_NAMES.length - 1;

  return (
    <div className="wizard">
      <header className="wizard-head">
        <div className="row-between">
          <Link href="/dashboard" className="brand" style={{ fontSize: 18 }}>DashPad</Link>
          <span style={{ fontSize: 14, color: 'var(--lilac)' }}>
            Step {step + 1} of {STEP_NAMES.length}: {STEP_NAMES[step]}
          </span>
        </div>
        <div className="steps-dots" aria-hidden="true">
          {STEP_NAMES.map((n, i) => <span key={n} className={i <= step ? 'on' : ''} />)}
        </div>
      </header>

      <main className="wizard-body">
        {step === S.what && (
          <>
            <h1>What are we celebrating?</h1>
            <div className="type-grid" role="group" aria-label="Type of event">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="type-btn"
                  aria-pressed={d.eventType === t.id}
                  onClick={() => set({ eventType: t.id, recipientLabel: t.recipient })}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="w-celebrant">Who is being celebrated?</label>
              <input id="w-celebrant" className="input" placeholder={d.eventType === 'wedding' ? 'e.g. Tolu & Dayo' : 'e.g. Mama Kemi'} value={d.celebrantName} onChange={(e) => set({ celebrantName: e.target.value })} maxLength={40} />
            </div>
            <div className="field">
              <label htmlFor="w-title">Event title (shown on the big screen)</label>
              <input id="w-title" className="input" value={title} placeholder="Filled in for you" onChange={(e) => set({ title: e.target.value, titleEdited: true })} maxLength={40} />
            </div>
            {slug.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <SlugField value={slug} onChange={(v) => set({ slug: v, slugEdited: true })} onStatus={setSlugOk} />
                <span className="hint">This is the link you open on the big screen. You can change it.</span>
              </div>
            )}
            <div className="field">
              <span className="field-label" id="w-label">On screen, sprays are “sent to…”</span>
              <div className="chips" role="group" aria-labelledby="w-label">
                {RECIPIENT_CHOICES.map((c) => (
                  <button key={c} type="button" className="chip" aria-pressed={d.recipientLabel === c} onClick={() => set({ recipientLabel: c })}>
                    {c}
                  </button>
                ))}
              </div>
              <span className="hint">The screen will say: “₦20,000 sent to {d.recipientLabel}”.</span>
            </div>
          </>
        )}

        {step === S.when && (
          <>
            <h1>When is the party?</h1>
            <p className="hint" style={{ marginTop: -8 }}>
              Guests can only spray between these times. After the end time the account closes and we email you the report.
            </p>
            <div className="field">
              <label htmlFor="w-start">Spraying starts</label>
              <input id="w-start" type="datetime-local" className="input" value={d.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="w-end">Spraying ends</label>
              <input id="w-end" type="datetime-local" className="input" value={d.endsAt} min={d.startsAt} onChange={(e) => set({ endsAt: e.target.value })} />
            </div>
            {hours > 0 && Number.isFinite(hours) && (
              <p className="hint">That’s {hours % 1 === 0 ? hours : hours.toFixed(1)} hours of spraying. You can extend the end time later.</p>
            )}
          </>
        )}

        {step === S.theme && (
          <>
            <h1>Pick a theme</h1>
            <p className="hint" style={{ marginTop: -8 }}>These are the colours of your big screen. You can change it any time.</p>
            <div className="theme-grid" role="group" aria-label="Theme">
              {THEMES.map((t) => (
                <button key={t.id} type="button" className="theme-card" aria-pressed={d.theme === t.id} onClick={() => set({ theme: t.id })}>
                  <div className="theme-preview" style={{ background: t.bg, color: t.text }}>
                    <span style={{ fontSize: 12, color: t.muted }}>sent to {d.recipientLabel}</span>
                    <span className="amt" style={{ color: t.accent === t.bg ? t.text : t.accent }}>₦20,000</span>
                    <span className="bar" style={{ background: t.accent, color: t.onAccent }}>0123 456 789</span>
                  </div>
                  <span className="theme-name">
                    {t.name}
                    {d.theme === t.id && <span aria-hidden="true">✓</span>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === S.photos && (
          <>
            <h1>Add photos of {d.celebrantName.trim() || 'the celebrants'}</h1>
            <p className="hint" style={{ marginTop: -8 }}>
              Optional. Up to 6 photos. They show on the big screen between sprays. You can add them later too.
            </p>
            <PhotoPicker value={d.photos} onChange={(photos) => set({ photos })} />
          </>
        )}

        {step === S.payout && (
          <>
            <h1>Where should the money go?</h1>
            <p className="hint" style={{ marginTop: -8 }}>
              The account of {d.celebrantName.trim() || 'the celebrant'}. Sprays are paid into it automatically.
            </p>
            <BankAccountFields value={d.payout} onChange={(payout) => set({ payout })} label="Celebrant’s bank" />
            <PayoutNote />
          </>
        )}

        {step === S.cut && (
          <>
            <h1>Your cut</h1>
            <p className="hint" style={{ marginTop: -8 }}>Choose what you earn from every spray, from 0% to 45%. It’s paid to your own account.</p>
            <div className="card">
              <div className="fee-big tabular" aria-live="polite">{d.plannerFeePercent}%</div>
              <label htmlFor="w-fee" className="visually-hidden">Your cut in percent</label>
              <input id="w-fee" className="slider" type="range" min={0} max={45} step={1} value={d.plannerFeePercent} onChange={(e) => set({ plannerFeePercent: Number(e.target.value) })} />
              <div className="row-between hint"><span>0%</span><span>45%</span></div>
            </div>
            <div className="card">
              <strong>On a ₦10,000 spray</strong>
              <div className="split-table">
                <div className="r"><span>You earn</span><strong>{naira(example.plannerFeeKobo)}</strong></div>
                <div className="r"><span>DashPad fee ({PLATFORM_FEE_BPS / 100}%)</span><strong>{naira(example.platformFeeKobo)}</strong></div>
                <div className="r total"><span>{d.celebrantName.trim() || 'Celebrant'} gets</span><strong>{naira(example.celebrantKobo)}</strong></div>
              </div>
            </div>
            <PayoutNote>Your cut is paid to your own bank account within 2 business days of each spray.</PayoutNote>
            {!plannerHasBank && d.plannerFeePercent > 0 && (
              <div className="banner warn">
                To earn a cut, first <Link href="/dashboard/profile">add your bank account</Link>. Your answers here are saved.
              </div>
            )}
          </>
        )}

        {step === S.review && (
          <>
            <h1>Check and create</h1>
            <div className="card review">
              <dl>
                <dt>Event</dt><dd>{title}</dd>
                <dt>Link</dt><dd>{typeof window !== 'undefined' ? window.location.host : 'dashpad.ng'}/{slug}</dd>
                <dt>Photos</dt><dd>{d.photos.length ? `${d.photos.length} added` : 'None yet'}</dd>
                <dt>Screen says</dt><dd>“₦20,000 sent to {d.recipientLabel}”</dd>
                <dt>Starts</dt><dd>{when(d.startsAt)}</dd>
                <dt>Ends</dt><dd>{when(d.endsAt)}</dd>
                <dt>Theme</dt><dd>{THEMES.find((t) => t.id === d.theme)?.name}</dd>
                <dt>Money goes to</dt><dd>{d.payout.accountName}<br />{d.payout.bankName} · {d.payout.accountNumber}</dd>
                <dt>Your cut</dt><dd>{d.plannerFeePercent}%</dd>
                <dt>DashPad fee</dt><dd>{PLATFORM_FEE_BPS / 100}%</dd>
                <dt>Payouts</dt><dd>Within 2 business days</dd>
              </dl>
            </div>
            <p className="hint">
              After you create it, you’ll get your event link for the big screen and the account number guests transfer to.
            </p>
          </>
        )}

        {error && <p className="error-text" role="alert">{error}</p>}
      </main>

      <footer className="wizard-foot">
        <div className="wizard-foot-inner">
          <button type="button" className="btn" onClick={back} disabled={busy}>{step === 0 ? 'Cancel' : 'Back'}</button>
          {last ? (
            <button type="button" className="btn btn-dark" onClick={create} disabled={busy}>
              {busy ? 'Creating…' : 'Create event'}
            </button>
          ) : (
            <button type="button" className="btn btn-dark" onClick={next}>Next</button>
          )}
        </div>
      </footer>
    </div>
  );
}
