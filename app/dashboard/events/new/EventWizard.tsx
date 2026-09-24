'use client';

import Logo from '@/components/Logo';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import BankAccountFields, { type BankAccount } from '@/components/BankAccountFields';
import BankCard from '@/components/BankCard';
import PayoutNote from '@/components/PayoutNote';
import ThemePicker, { ScreenPreview } from '@/components/ThemePicker';
import PhotoPicker from '@/components/PhotoPicker';
import SlugField from '@/components/SlugField';
import { slugify, slugProblem } from '@/lib/slug';
import { EVENT_TYPES, MAX_EVENT_HOURS, RECIPIENT_CHOICES } from '@/lib/event-info';
import { naira, PLATFORM_FEE_BPS, splitTransfer } from '@/lib/money';
import { resolveTheme, THEMES, type ThemeColors } from '@/lib/themes';
import type { EventType } from '@/lib/types';
import { createSprayEvent } from '../../../actions';

const DRAFT_KEY = 'dashpad:event-draft';
const STEP_NAMES = ['Celebration', 'Date & time', 'Screen colours', 'Photos', 'Payout account', 'Your cut', 'Review'];
const STEP_INTROS = [
  'Tell us who the party is for. This sets up your event link.',
  'Guests can only spray between these times. After the end, the account closes and we email you the report.',
  'Pick the colours of your big screen. Use a ready-made theme or your own colours: we keep the text easy to read.',
  'Optional. Up to 6 photos. They show on the big screen between sprays.',
  'Sprays are paid straight into this account. Usually the celebrant’s.',
  'Choose what you earn from every spray, from 0% to 45%. It’s paid into your own account.',
  'Check everything. You can change most things later.',
];
const DURATIONS = [3, 4, 6, 8, 12];
const QUICK_CUTS = [0, 5, 10, 15, 20];
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
  themeColors: ThemeColors | null;
  payout: BankAccount;
  payoutConfirmed: boolean;
  plannerFeePercent: number;
  /** Furthest step reached, so the step list can jump back and forth. */
  reached: number;
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
    themeColors: null,
    payout: { bankCode: '', bankName: '', accountNumber: '', accountName: '' },
    payoutConfirmed: false,
    plannerFeePercent: 10,
    reached: 0,
  };
}

function when(local: string) {
  const d = new Date(local);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function clock(local: string) {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
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
      if (saved) setD({ ...defaultDraft(), ...JSON.parse(saved), payoutConfirmed: false });
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

  function go(to: number) {
    setError(null);
    setStep(to);
    setD((prev) => ({ ...prev, reached: Math.max(prev.reached, to) }));
    window.scrollTo({ top: 0 });
  }

  function next() {
    const p = problem(step);
    if (p) return setError(p);
    if (step === S.payout) set({ payoutConfirmed: true });
    go(Math.min(step + 1, STEP_NAMES.length - 1));
  }

  function back() {
    if (step === 0) router.push('/dashboard');
    else go(step - 1);
  }

  /** Jump from the step list: forwards only as far as every step before is valid. */
  function jump(to: number) {
    if (to <= step) return go(to);
    for (let s = step; s < to; s++) {
      const p = problem(s);
      if (p) {
        setStep(s);
        return setError(p);
      }
    }
    go(to);
  }

  const setStart = (startsAt: string) => {
    // Keep the same length of party when the start moves.
    const len = endMs - startMs;
    const start = new Date(startsAt).getTime();
    if (Number.isFinite(start) && len > 0) set({ startsAt, endsAt: toLocalInput(new Date(start + len)) });
    else set({ startsAt });
  };

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
        themeColors: d.theme === 'custom' ? d.themeColors : null,
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
  const screenTheme = resolveTheme(d.theme, d.themeColors);
  const themeName = d.theme === 'custom' ? 'Your own colours' : THEMES.find((t) => t.id === d.theme)?.name;
  const payoutReady = d.payout.accountNumber.length === 10 && !!d.payout.bankName && !!d.payout.accountName;
  const host = typeof window !== 'undefined' ? window.location.host : 'dashpad.ng';
  const progress = ((step + 1) / STEP_NAMES.length) * 100;

  // One-line summaries for the step list on big screens.
  const summaries = [
    title || null,
    Number.isFinite(hours) && hours > 0 ? `${when(d.startsAt)} · ${hours % 1 === 0 ? hours : hours.toFixed(1)} hrs` : null,
    themeName ?? null,
    d.photos.length ? `${d.photos.length} photo${d.photos.length === 1 ? '' : 's'}` : 'Optional',
    payoutReady ? `${d.payout.bankName} · ${d.payout.accountNumber}` : null,
    `${d.plannerFeePercent}%`,
    null,
  ];

  const editLink = (to: number) => (
    <button type="button" className="link-btn review-edit" onClick={() => go(to)}>Edit</button>
  );

  return (
    <div className="wz">
      {/* Big screens: the list of steps */}
      <aside className="wz-side" aria-label="Steps">
        <Link href="/dashboard" className="brand" aria-label="Back to dashboard"><Logo size={28} /></Link>
        <div className="wz-side-title">New spray event</div>
        <ol className="wz-steps">
          {STEP_NAMES.map((n, i) => {
            const state = i === step ? 'current' : i < step || i <= d.reached ? 'done' : 'todo';
            return (
              <li key={n}>
                <button
                  type="button"
                  className={`wz-step ${state}`}
                  aria-current={i === step ? 'step' : undefined}
                  disabled={i > d.reached + 1 && i > step}
                  onClick={() => jump(i)}
                >
                  <span className="wz-num">{state === 'done' && i !== step ? <Check /> : i + 1}</span>
                  <span className="wz-step-text">
                    <span className="wz-step-name">{n}</span>
                    {summaries[i] && i !== step && state === 'done' && <span className="wz-step-sum">{summaries[i]}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="wz-side-note">Your answers are saved on this device as you go.</p>
      </aside>

      {/* Phones: compact header with a progress bar */}
      <header className="wz-top">
        <div className="wz-top-row">
          <button type="button" className="wz-icon-btn" onClick={back} aria-label={step === 0 ? 'Cancel' : 'Back'} disabled={busy}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div className="wz-top-text">
            <span className="wz-top-step">Step {step + 1} of {STEP_NAMES.length}</span>
            <span className="wz-top-name">{STEP_NAMES[step]}</span>
          </div>
          <Link href="/dashboard" className="wz-icon-btn" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Link>
        </div>
        <div className="wz-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEP_NAMES.length} aria-valuenow={step + 1} aria-label="Progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      </header>

      <main className="wz-main">
        <div className="wz-content">
          <div className="wz-step-body" key={step}>
            <div className="wz-head">
              <span className="wz-eyebrow">Step {step + 1} of {STEP_NAMES.length}</span>
              <h1>
                {step === S.what && 'What are we celebrating?'}
                {step === S.when && 'When is the party?'}
                {step === S.theme && 'Pick your screen colours'}
                {step === S.photos && `Add photos of ${d.celebrantName.trim() || 'the celebrants'}`}
                {step === S.payout && 'Where should the money go?'}
                {step === S.cut && 'Your cut'}
                {step === S.review && 'Check and create'}
              </h1>
              <p className="wz-intro">{STEP_INTROS[step]}</p>
            </div>

            {step === S.what && (
              <>
                <div className="field">
                  <span className="field-label" id="w-type">Type of event</span>
                  <div className="type-grid" role="group" aria-labelledby="w-type">
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
                </div>
                <div className="wz-panel">
                  <div className="field">
                    <label htmlFor="w-celebrant">Who is being celebrated?</label>
                    <input id="w-celebrant" className="input" placeholder={d.eventType === 'wedding' ? 'e.g. Tolu & Dayo' : 'e.g. Mama Kemi'} value={d.celebrantName} onChange={(e) => set({ celebrantName: e.target.value })} maxLength={40} autoFocus />
                  </div>
                  <div className="field">
                    <label htmlFor="w-title">Event title</label>
                    <input id="w-title" className="input" value={title} placeholder="Filled in for you" onChange={(e) => set({ title: e.target.value, titleEdited: true })} maxLength={40} />
                    <span className="hint">Shown at the top of the big screen.</span>
                  </div>
                  {slug.length > 0 && (
                    <div className="stack" style={{ gap: 6 }}>
                      <SlugField value={slug} onChange={(v) => set({ slug: v, slugEdited: true })} onStatus={setSlugOk} />
                      <span className="hint">The link you open on the big screen. You can change it.</span>
                    </div>
                  )}
                </div>
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
                <div className="wz-panel wz-times">
                  <div className="field">
                    <label htmlFor="w-start">Spraying starts</label>
                    <input id="w-start" type="datetime-local" className="input" value={d.startsAt} onChange={(e) => setStart(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="w-end">Spraying ends</label>
                    <input id="w-end" type="datetime-local" className="input" value={d.endsAt} min={d.startsAt} onChange={(e) => set({ endsAt: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <span className="field-label" id="w-dur">Quick length</span>
                  <div className="chips" role="group" aria-labelledby="w-dur">
                    {DURATIONS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className="chip"
                        aria-pressed={Math.abs(hours - h) < 0.01}
                        onClick={() => Number.isFinite(startMs) && set({ endsAt: toLocalInput(new Date(startMs + h * 3600_000)) })}
                      >
                        {h} hours
                      </button>
                    ))}
                  </div>
                </div>
                {hours > 0 && Number.isFinite(hours) && (
                  <div className="wz-timeline" aria-live="polite">
                    <div><span className="hint">Opens</span><strong>{when(d.startsAt)}</strong></div>
                    <div className="wz-timeline-line"><span>{hours % 1 === 0 ? hours : hours.toFixed(1)} hours</span></div>
                    <div style={{ textAlign: 'right' }}><span className="hint">Closes</span><strong>{clock(d.endsAt)}</strong></div>
                  </div>
                )}
                <p className="hint">You can extend the end time later if the party runs long.</p>
              </>
            )}

            {step === S.theme && (
              <ThemePicker
                value={{ theme: d.theme, colors: d.themeColors }}
                onChange={(v) => set({ theme: v.theme, themeColors: v.colors })}
                recipientLabel={d.recipientLabel}
              />
            )}

            {step === S.photos && <PhotoPicker value={d.photos} onChange={(photos) => set({ photos })} />}

            {step === S.payout && (
              <>
                {d.payoutConfirmed && payoutReady ? (
                  <BankCard
                    label={`${d.celebrantName.trim() || 'Celebrant'}’s account`}
                    bankName={d.payout.bankName}
                    accountNumber={d.payout.accountNumber}
                    accountName={d.payout.accountName}
                    onEdit={() => set({ payoutConfirmed: false })}
                  />
                ) : (
                  <div className="wz-panel">
                    <BankAccountFields value={d.payout} onChange={(payout) => set({ payout })} label={`${d.celebrantName.trim() || 'Celebrant'}’s bank`} />
                    {payoutReady && (
                      <button type="button" className="btn btn-dark" onClick={() => set({ payoutConfirmed: true })}>Save account</button>
                    )}
                  </div>
                )}
                <PayoutNote />
              </>
            )}

            {step === S.cut && (
              <>
                <div className="wz-panel wz-cut">
                  <div className="fee-big tabular" aria-live="polite">{d.plannerFeePercent}%</div>
                  <label htmlFor="w-fee" className="visually-hidden">Your cut in percent</label>
                  <input id="w-fee" className="slider" type="range" min={0} max={45} step={1} value={d.plannerFeePercent} onChange={(e) => set({ plannerFeePercent: Number(e.target.value) })} />
                  <div className="row-between hint"><span>0%</span><span>45%</span></div>
                  <div className="chips" role="group" aria-label="Quick choices" style={{ justifyContent: 'center' }}>
                    {QUICK_CUTS.map((c) => (
                      <button key={c} type="button" className="chip" aria-pressed={d.plannerFeePercent === c} onClick={() => set({ plannerFeePercent: c })}>{c}%</button>
                    ))}
                  </div>
                </div>
                <div className="wz-panel">
                  <strong>On a ₦10,000 spray</strong>
                  <div className="split-bar" aria-hidden="true">
                    <span style={{ width: `${example.celebrantKobo / 100}%`, background: 'var(--green)' }} />
                    <span style={{ width: `${example.plannerFeeKobo / 100}%`, background: 'var(--gold)' }} />
                    <span style={{ width: `${example.platformFeeKobo / 100}%`, background: 'var(--plum-soft)' }} />
                  </div>
                  <div className="split-table">
                    <div className="r"><span><i className="dot" style={{ background: 'var(--green)' }} />{d.celebrantName.trim() || 'Celebrant'} gets</span><strong>{naira(example.celebrantKobo)}</strong></div>
                    <div className="r"><span><i className="dot" style={{ background: 'var(--gold)' }} />You earn</span><strong>{naira(example.plannerFeeKobo)}</strong></div>
                    <div className="r"><span><i className="dot" style={{ background: 'var(--plum-soft)' }} />DashPad fee ({PLATFORM_FEE_BPS / 100}%)</span><strong>{naira(example.platformFeeKobo)}</strong></div>
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
              <div className="review-groups">
                <section className="wz-panel review">
                  <div className="row-between"><h2>Celebration</h2>{editLink(S.what)}</div>
                  <dl>
                    <dt>Event</dt><dd>{title}</dd>
                    <dt>Link</dt><dd>{host}/{slug}</dd>
                    <dt>Screen says</dt><dd>“₦20,000 sent to {d.recipientLabel}”</dd>
                  </dl>
                </section>
                <section className="wz-panel review">
                  <div className="row-between"><h2>Date & time</h2>{editLink(S.when)}</div>
                  <dl>
                    <dt>Starts</dt><dd>{when(d.startsAt)}</dd>
                    <dt>Ends</dt><dd>{when(d.endsAt)}</dd>
                  </dl>
                </section>
                <section className="wz-panel review">
                  <div className="row-between"><h2>Screen</h2>{editLink(S.theme)}</div>
                  <dl>
                    <dt>Colours</dt><dd>{themeName}</dd>
                    <dt>Photos</dt><dd>{d.photos.length ? `${d.photos.length} added` : 'None yet'}</dd>
                  </dl>
                </section>
                <section className="wz-panel review">
                  <div className="row-between"><h2>Money</h2>{editLink(S.payout)}</div>
                  <dl>
                    <dt>Paid into</dt><dd>{d.payout.accountName}<br />{d.payout.bankName} · {d.payout.accountNumber}</dd>
                    <dt>Your cut</dt><dd>{d.plannerFeePercent}%</dd>
                    <dt>DashPad fee</dt><dd>{PLATFORM_FEE_BPS / 100}%</dd>
                    <dt>Payouts</dt><dd>Within 2 business days</dd>
                  </dl>
                </section>
                <p className="hint">After you create it, you’ll get your event link and the account number guests transfer to.</p>
              </div>
            )}

          </div>

          {error && <p className="error-text" role="alert">{error}</p>}

          <div className="wz-actions">
            <button type="button" className="btn" onClick={back} disabled={busy}>{step === 0 ? 'Cancel' : 'Back'}</button>
            {last ? (
              <button type="button" className="btn btn-dark btn-grow" onClick={create} disabled={busy}>
                {busy ? 'Creating…' : 'Create event'}
              </button>
            ) : (
              <button type="button" className="btn btn-dark btn-grow" onClick={next}>
                <span className="wz-next-long">Next: {STEP_NAMES[step + 1]}</span>
                <span className="wz-next-short">Next</span>
                <span aria-hidden="true"> →</span>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Wide screens: how the big screen will look */}
      <aside className="wz-preview" aria-label="Big screen preview">
        <span className="wz-preview-label">Big screen preview</span>
        <div className="wz-preview-title" style={{ background: screenTheme.bg, color: screenTheme.text }}>
          {title || 'Your event title'}
        </div>
        <ScreenPreview theme={screenTheme} label={d.recipientLabel} />
        <p className="hint">Every spray pops up like this. The account number always stays on screen.</p>
      </aside>
    </div>
  );
}
