import { emailConfigured } from '@/lib/email';
import { relayConfigured } from '@/lib/camera';
import { cutoutStatus } from '@/lib/cutouts';
import { paystackConfigured, paystackIsLive } from '@/lib/paystack';
import { siteUrl } from '@/lib/site';
import { getStore } from '@/lib/store';
import type { PaymentLog } from '@/lib/types';

type Check = { ok: boolean; title: string; detail: string };

/** A plain-English list of what is and isn't set up correctly. */
export default async function SetupCheck({ logs }: { logs: PaymentLog[] }) {
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
    },
    {
      ok: true, // optional: the live camera works on most networks without it
      title: 'Live camera relay (Cloudflare)',
      detail: relayConfigured()
        ? 'Set up. Phone cameras can reach the big screen even on strict venue Wi-Fi.'
        : 'Optional, not set up. Phone cameras work on most networks; for venues whose Wi-Fi blocks them, add CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_KEY_API_TOKEN (free Cloudflare account).',
    },
    {
      ok: !!process.env.CRON_SECRET,
      title: 'Daily clean-up job',
      detail: process.env.CRON_SECRET ? 'CRON_SECRET is set.' : 'CRON_SECRET is missing in Vercel.',
    },
  ];

  return (
    <section className="card" aria-label="Setup check">
      <h2>Setup check</h2>
      <ul className="checks">
        {checks.map((c) => (
          <li key={c.title} className={c.ok ? 'ok' : 'bad'}>
            <span aria-hidden="true" className="check-icon">{c.ok ? '✓' : '!'}</span>
            <div>
              <strong>{c.title}</strong>
              <div className="hint" style={{ overflowWrap: 'anywhere' }}>{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
