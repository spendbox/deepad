# DashPad

Digital money spraying for Nigerian parties. Event planners create a spray event, put its
link on the big screen, and guests transfer to the event's own account number. Every
confirmed transfer pops up on screen as "₦X sent to the couple" with the sender's transfer
description. Senders stay anonymous on screen.

## Who uses what

| Page | Address | Who |
|---|---|---|
| Landing page | `/` | Everyone |
| Sign up / log in | `/signup`, `/login` | Event planners and MCs |
| Planner dashboard | `/dashboard` | Planners: create and run events |
| Event big screen | `/e/<unique-code>` | The venue TV or projector |
| Admin | `/admin` | DashPad staff (password protected) |
| Paystack webhook | `/api/webhooks/paystack` | Paystack |
| Daily clean-up | `/api/cron/close-events` | Vercel (see `vercel.json`) |

## How money works

- Each event gets its own account number from Paystack.
- Every transfer is split automatically by Paystack: **5% to DashPad**, the planner's cut
  (**0–45%**, chosen per event) to the planner's bank account, and the rest to the account
  the planner entered for the celebrant. DashPad never holds the money.
- Transfers only count between the event's start and end time. At the end the account
  is switched off and the planner is emailed a report of who sprayed.
- Only transfers confirmed by Paystack's signed webhook ever reach the screen.

## Setting it up

1. **Supabase:** SQL Editor → New query → paste all of `supabase/schema.sql` → Run.
2. **Vercel:** add every setting in `.env.example`, then redeploy.
3. **Paystack:** set the webhook URL to `https://<your-site>/api/webhooks/paystack`.
   Paystack must have *Dedicated Virtual Accounts* enabled on your business.
4. **Resend:** create an account, verify your domain, and add `RESEND_API_KEY` and `EMAIL_FROM`.

## For developers

```bash
npm install
npm run dev        # http://localhost:3000 (uses a throwaway in-memory store)
npm test
npm run typecheck
```
