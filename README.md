# DashPad

Digital money spraying for Nigerian parties. Guests scan a QR code or transfer to the
event's account number; every **confirmed** payment pops up on the big screen with their
name, amount and message.

## The parts

| Page | Web address | Who uses it |
|---|---|---|
| Big screen | `/screen/<event>` | The MC's laptop, on the venue TV or projector |
| Guest spray page | `/s/<event>` | Guests' phones (from the QR code) |
| One-time account page | `/s/<event>/pay/<ref>` | Guests' phones, after tapping Pay |
| Admin portal | `/admin` | You (password protected) |
| Paystack webhook | `/api/webhooks/paystack` | Paystack, to confirm payments |

A sample event called `tolu-dayo` is included so you can try everything straight away.

## How money works

- **QR way:** the guest pays spray + fee. Default fee is **5% DashPad + the MC's share**
  (set per event in the admin portal). The celebrant gets the full spray amount.
- **Direct transfer to the event account:** the screen shows the full amount sent, and
  the fee comes out of it before it reaches the celebrant.
- Anything the sender types as the transfer description in their bank app is shown
  on screen as their message (bank codes are stripped and rude words are masked).
- DashPad never holds money. Paystack splits each payment between the celebrant, the
  MC and DashPad using the event's **Paystack split code**.
- Only payments confirmed by Paystack's signed webhook ever reach the screen.

## Setting it up (step by step)

1. **Supabase:** create a project at supabase.com → SQL Editor → New query → paste all of
   `supabase/schema.sql` → Run.
2. **Vercel:** import this GitHub repo at vercel.com → before deploying, add the settings
   listed in `.env.example` (at minimum `ADMIN_PASSWORD`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`) → Deploy.
3. **Paystack (test mode first):** add your `sk_test_…` key as `PAYSTACK_SECRET_KEY`, and
   in Paystack set the webhook URL to `https://<your-site>/api/webhooks/paystack`.

## For developers

```bash
npm install
npm run dev        # http://localhost:3000, admin password "demo"
npm test           # money, names, messages, webhook signature
npm run typecheck
```
