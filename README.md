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
  and initials, throwing a **₦100 note onto the celebrant for every ₦100 sent**.
  Bigger sprays throw faster (`lib/spray-pace.ts`): ₦5,000 is a note every 2.5 s (about 2 minutes),
  ₦10,000 every 1.75 s (about 3 minutes), ₦100,000 about twice a second (10 minutes); never over 30 minutes.
  Everyone spraying keeps their full name tag; when the screen fills up, the one spraying longest carries on
  as a small bubble. The confetti falling over the whole screen is kept light, so the sprayers are the show.
- **Spray from your phone**: when the event link is opened on a phone during the party, a "Spray … from this
  phone" button appears. The guest picks an amount, the name to show and an optional comment, and gets their
  own account number for that spray (Paystack "Pay with Transfer", 30 minutes). When the money lands, a wad
  of notes appears on their phone (₦100/₦200/₦500/₦1,000): swipe up to throw one, tap for a flick, hold to
  make it rain. Each note flies from their name on the big screen; if they stop, their name fades away and
  comes back when they throw again. They can never throw more than they paid.
- Lines on the screen come only from the planner (dashboard) or guests (the shareable `/write` page).
  The write-a-line page has a "no cash needed" note under the form (planners can turn it off or reword it),
  and planners can download a QR code for the page (for invitations or table cards).
  Guests' lines wait for the planner's approval (one by one or in bulk); only approved lines show, one at
  a time in the top-left corner, and the screen cycles through them endlessly. A secret view-only page (`/lines/<token>`) shows every line
  live.
- **Transfer comments**: what a guest types as the description in their bank app shows under their name on
  the big screen. Rude comments are left out silently (never starred): a rude-word list always runs, and with
  `OPENAI_API_KEY` set, AI checks each comment first, fixes its spelling and grammar, and politely rewords
  ones that meant well. Names the guest typed stay in; only the name the bank adds on its own is removed. Planners can
  switch comments and the AI check off (Settings), or hide any single comment from the "Who sprayed" list.
- **Bank alert sound**: the big screen plays a "ka-ching" for every spray (a fuller chime for a big spray).
  Planners can switch it off in Settings. Browsers only allow sound after one click or tap on the screen.
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
- **Live camera**: the planner sends a private camera link to whoever is filming; they tap **Go live** on
  their phone and the big screen switches to the live video, with lines and sprayers floating over it.
  A camera plugged into the big-screen computer works too (the **Camera** button on the screen). The video
  goes straight from the phone to the screen (WebRTC); only the short handshake passes through DashPad.
  Optional free relay for strict networks: `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_KEY_API_TOKEN`.
- The admin page has a **Setup check** and a **Payment notifications** log for fixing problems.
- Planners can delete events. Events that received money are hidden, not erased, so records stay complete.

## Setting it up

1. **Supabase:** SQL Editor → New query → paste all of `supabase/schema.sql` → Run.
   (Run it again after updates; it is safe to repeat. It also creates the `celebrant-photos` storage folder.)
2. **Vercel:** add every setting in `.env.example`, then redeploy.
3. **Paystack:** set the webhook URL to `https://<your-site>/api/webhooks/paystack`.
   Paystack must have *Dedicated Virtual Accounts* enabled on your business. Event account numbers
   come from Paystack-Titan (set `PAYSTACK_DVA_BANK=wema-bank` to use Wema Bank instead).
4. **Resend:** create an account, verify your domain, and add `RESEND_API_KEY` and `EMAIL_FROM`.

## For developers

```bash
npm install
npm run dev        # http://localhost:3000 (uses a throwaway in-memory store)
npm test
npm run typecheck
```
