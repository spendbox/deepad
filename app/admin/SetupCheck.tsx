import { emailConfigured } from '@/lib/email';
import { relayConfigured } from '@/lib/camera';
import { cutoutStatus } from '@/lib/cutouts';
import { paystackConfigured, paystackIsLive } from '@/lib/paystack';
import { aiFilterConfigured } from '@/lib/moderation';
import { siteUrl } from '@/lib/site';
import { getStore } from '@/lib/store';
import type { PaymentLog } from '@/lib/types';

/** `optional`: not needed to run DashPad; shown grey (not red) while it isn't set up. */
export type Check = { ok: boolean; title: string; detail: string; optional?: boolean };

/** Everything DashPad needs, and whether each is set up. */
export async function getSetupChecks(logs: PaymentLog[]): Promise<Check[]> {
  const store = getStore();
  const schema = await store.schemaProblems();
  const webhookUrl = `${await siteUrl()}/api/webhooks/paystack`;
  const webhooks = logs.filter((l) => l.source === 'webhook');
  const lastWebhook = webhooks[0];
  const badSig = webhooks.find((l) => l.outcome === 'bad_signature');

  const checks: Check[] = [
    {
      ok: schema.length === 0,
      title: 'Database is up to date',
      detail: schema.length
        ? `Run the latest supabase/schema.sql in Supabase (SQL Editor → New query → paste → Run). Problems: ${schema.join(' · ')}`
        : 'All tables and columns are in place.',
    },
    {
      ok: paystackConfigured(),
      title: 'Paystack key',
      detail: paystackConfigured()
        ? paystackIsLive()
          ? 'LIVE key in use: real money.'
          : 'TEST key in use: no real money moves. Test transfers only work from Paystack’s test tools, not a real bank app.'
        : 'PAYSTACK_SECRET_KEY is missing in Vercel.',
    },
    {
      ok: !!lastWebhook,
      title: 'Payment notifications (webhook)',
      detail: lastWebhook
        ? `Last one received ${new Date(lastWebhook.createdAt).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })}.`
        : `Paystack has never sent us a payment notification. In Paystack → Settings → API Keys & Webhooks, set the ${
            paystackIsLive() ? 'Live' : 'Test'
          } Webhook URL to ${webhookUrl} and save. (The big screen also checks Paystack directly as a backup.)`,
    },
    {
      ok: !badSig,
      title: 'Webhook signatures',
      detail: badSig
        ? 'Some notifications were rejected because the signature didn’t match. Make sure PAYSTACK_SECRET_KEY in Vercel is the secret key from the same mode (Test or Live) as the webhook, then redeploy.'
        : 'No rejected notifications.',
    },
    {
      ok: emailConfigured(),
      title: 'Email (Resend)',
      detail: emailConfigured() ? 'Set up.' : 'RESEND_API_KEY and EMAIL_FROM are missing: reports and password resets can’t be sent.',
    },
    {
      ...cutoutStatus(),
      title: 'Background removal for photos',
      optional: true,
    },
    {
      ok: relayConfigured(),
      optional: true, // the live camera works on most networks without it
      title: 'Live camera relay (Cloudflare)',
      detail: relayConfigured()
        ? 'Set up. Phone cameras can reach the big screen even on strict venue Wi-Fi.'
        : 'Optional, not set up. Phone cameras work on most networks; for venues whose Wi-Fi blocks them, add CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_KEY_API_TOKEN (free Cloudflare account).',
    },
    {
      ok: aiFilterConfigured(),
      optional: true,
      title: 'AI check for transfer comments (OpenAI)',
      detail: aiFilterConfigured()
        ? 'Set up. Comments are checked by AI before they show on the big screen: spelling and grammar are fixed, rude ones are dropped or politely reworded.'
        : 'Not set up: comments on the big screen are checked with the basic rude-word list only. Add OPENAI_API_KEY in Vercel (platform.openai.com → API keys) and redeploy.',
    },
    {
      ok: !!process.env.CRON_SECRET,
      title: 'Daily clean-up job',
      detail: process.env.CRON_SECRET ? 'CRON_SECRET is set.' : 'CRON_SECRET is missing in Vercel.',
    },
  ];
  return checks;
}

/** How many required things still need fixing (optional extras don't count). */
export const problemCount = (checks: Check[]) => checks.filter((c) => !c.ok && !c.optional).length;

/** A plain-English list of what is and isn't set up correctly. */
export default async function SetupCheck({ logs }: { logs: PaymentLog[] }) {
  const checks = await getSetupChecks(logs);
  const ready = checks.filter((c) => c.ok).length;
  const problems = problemCount(checks);
  return (
    <section className="card" aria-label="Setup check">
      <div className="row-between">
        <h2>Setup check</h2>
        <span className={`pill ${problems ? 'failed' : 'live'}`}>{problems ? `${problems} to fix` : 'All good'}</span>
      </div>
      <p className="adm-checks-sum">{ready} of {checks.length} set up{problems ? ` · ${problems} need fixing` : ''}. Grey ones are optional extras.</p>
      <ul className="checks">
        {checks.map((c) => {
          const state = c.ok ? 'ok' : c.optional ? 'optional' : 'bad';
          return (
            <li key={c.title} className={state}>
              <span aria-hidden="true" className="check-icon">{state === 'ok' ? '✓' : state === 'optional' ? '–' : '!'}</span>
              <div>
                <strong>{c.title}</strong>
                {state === 'optional' && <span className="check-tag">Optional</span>}
                <div className="hint" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
