-- DashPad database. Paste this whole file into Supabase:
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run more than once. (If you ran an older version, the old tables
-- "events", "sprays" and "spray_intents" are no longer used; you can delete them.)

create extension if not exists pgcrypto;

-- Event planners / MCs who create spray events.
create table if not exists planners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text not null default '',
  password_hash text not null,
  bank_code text,
  bank_name text,
  account_number text,
  account_name text,
  paystack_subaccount text,
  created_at timestamptz not null default now()
);

create table if not exists spray_events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  planner_id uuid not null references planners (id) on delete cascade,
  event_type text not null default 'other',
  title text not null,
  celebrant_name text not null,
  recipient_label text not null,
  theme text not null default 'owambe',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  planner_fee_bps integer not null default 0 check (planner_fee_bps between 0 and 4500),
  platform_fee_bps integer not null default 500,
  big_spray_kobo bigint not null default 10000000,
  paused boolean not null default false,
  payout_bank_code text not null,
  payout_bank_name text not null,
  payout_account_number text not null,
  payout_account_name text not null,
  account_number text,
  account_bank text,
  account_name text,
  paystack_customer_code text,
  paystack_dva_id text,
  paystack_split_code text,
  paystack_payout_subaccount text,
  setup_status text not null default 'pending' check (setup_status in ('pending', 'ready', 'failed')),
  setup_error text,
  closed_at timestamptz,
  report_sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists spray_events_planner_idx on spray_events (planner_id, created_at desc);
create index if not exists spray_events_account_idx on spray_events (account_number);
create index if not exists spray_events_customer_idx on spray_events (paystack_customer_code);

-- Confirmed transfers only. Added by the server after Paystack's signed webhook.
create table if not exists transfers (
  id bigserial primary key,
  event_id uuid not null references spray_events (id) on delete cascade,
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  sender_name text,
  sender_bank text,
  message text,
  platform_fee_kobo bigint not null default 0,
  planner_fee_kobo bigint not null default 0,
  celebrant_kobo bigint not null default 0,
  outside_window boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists transfers_event_idx on transfers (event_id, id desc);

-- Added later: celebrant photos, Paystack's fee per transfer.
alter table spray_events add column if not exists photos jsonb not null default '[]'::jsonb;
alter table transfers add column if not exists processing_fee_kobo bigint not null default 0;

-- "Forgot password" links. Only a hash of each link's secret is stored.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  planner_id uuid not null references planners (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_planner_idx on password_resets (planner_id, created_at desc);

-- Added later: planners can delete events. Events that already received money
-- are kept (marked deleted) so DashPad's records stay complete.
alter table spray_events add column if not exists deleted_at timestamptz;

-- Added later: the exact description the bank sent, for checking what guests typed.
alter table transfers add column if not exists raw_narration text;

-- Every payment notification from Paystack, so problems can be seen and fixed.
create table if not exists payment_logs (
  id bigserial primary key,
  source text not null default 'webhook',
  paystack_event text,
  reference text,
  outcome text not null,
  detail text,
  event_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists payment_logs_created_idx on payment_logs (id desc);
-- Added later: the full notification, to see exactly where the bank put the description.
alter table payment_logs add column if not exists raw jsonb;

-- Public storage folder for celebrant photos (shown on the big screen).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('celebrant-photos', 'celebrant-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Lock everything down: only our server (with the secret service-role key)
-- can read or write. Browsers never talk to the database directly.
alter table planners enable row level security;
alter table spray_events enable row level security;
alter table transfers enable row level security;
alter table password_resets enable row level security;
alter table payment_logs enable row level security;
