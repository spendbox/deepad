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
| Earnings | `/dashboard/earnings` | Planners: earnings over time, with time filters |
| Event big screen | `/<event-link>` e.g. `/tolu-and-dayo` | The venue TV or projector (works on phones too) |
| Write a line | `/<event-link>/write` | Guests: a wish for the celebrant, with their name and optional photo |
| Lines (view only) | `/lines/<secret>` | Anyone the planner shares it with: every line, live |
| Forgot password | `/forgot-password` | Planners |
| Admin | `/admin` | DashPad staff (password protected) |
| Paystack webhook | `/api/webhooks/paystack` | Paystack |
| Daily clean-up | `/api/cron/close-events` | Vercel (see `vercel.json`) |

## How money works

- Each event gets its own account number from Paystack.
- Every transfer is split automatically by Paystack: **5% to DashPad**, the planner's cut
  (**0–45%**, chosen per event) to the planner's bank account, and the rest to the account
  the planner entered for the celebrant. DashPad never holds the money.
- DashPad pays Paystack's processing fee out of its 5%. The admin page shows earnings after fees.
- Payouts reach the bank accounts within 2 business days.
- Transfers only count between the event's start and end time. At the end the account
  is switched off and the planner is emailed a report of who sprayed.
- The big screen never shows amounts. Each sprayer appears around the celebrant as their first name
  and initials, throwing confetti (one or two pieces a second) for a while, so many people can spray at once.
- Lines on the screen come only from the planner (dashboard) or guests (the shareable `/write` page).
  Guests' lines wait for the planner's approval (one by one or in bulk); only approved lines show, and
  the screen cycles through them endlessly. A secret view-only page (`/lines/<token>`) shows every line
  live. Bank transfer descriptions are only shown to the planner.
- Only transfers confirmed by Paystack ever reach the screen: either its signed webhook, or (as a
  backup while the screen is open) by asking Paystack's API directly for the event's payments.
- After the event, the planner is emailed a short summary with a branded **PDF report** attached
  (also downloadable from the event page).
- Planners pick a ready-made screen theme or their **own two colours**; DashPad automatically adjusts
  them so all text on the big screen stays readable (WCAG contrast).
- With FAPIhub set up (`FAPIHUB_API_KEY`, 100 free photos a month; or Photoroom via `PHOTOROOM_API_KEY`),
  celebrant photos get their background removed on upload.
  The cut-out celebrant then stands on the big screen, and every spray throws **confetti**
  onto them (more confetti for bigger sprays).
- The admin page has a **Setup check** and a **Payment notifications** log for fixing problems.
- Planners can delete events. Events that received money are hidden, not erased, so records stay complete.

## Setting it up

1. **Supabase:** SQL Editor → New query → paste all of `supabase/schema.sql` → Run.
   (Run it again after updates; it is safe to repeat. It also creates the `celebrant-photos` storage folder.)
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
