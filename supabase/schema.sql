-- DashPad database. Paste this whole file into Supabase:
-- Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  celebrants text not null,
  mc_name text not null default '',
  status text not null default 'draft' check (status in ('draft', 'live', 'ended')),
  paused boolean not null default false,
  next_up text,
  big_spray_kobo bigint not null default 10000000,
  platform_fee_bps integer not null default 500 check (platform_fee_bps between 0 and 5000),
  mc_fee_bps integer not null default 0 check (mc_fee_bps between 0 and 5000),
  account_number text,
  account_bank text,
  account_name text,
  celebrant_bank text,
  celebrant_account_number text,
  celebrant_account_name text,
  mc_bank text,
  mc_account_number text,
  mc_account_name text,
  paystack_split_code text,
  created_at timestamptz not null default now()
);

create index if not exists events_account_number_idx on events (account_number);

-- One row per "Pay" tap on the guest page (one-time account number).
create table if not exists spray_intents (
  reference text primary key,
  event_id uuid not null references events (id) on delete cascade,
  guest_name text not null,
  message text,
  anonymous boolean not null default false,
  spray_kobo bigint not null check (spray_kobo > 0),
  fee_kobo bigint not null default 0,
  total_kobo bigint not null,
  account_number text not null,
  bank_name text not null,
  account_name text not null,
  expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired')),
  spray_id bigint,
  created_at timestamptz not null default now()
);

-- Confirmed payments only. Rows are added by the server after the payment
-- provider's signed webhook confirms the money arrived.
create table if not exists sprays (
  id bigserial primary key,
  event_id uuid not null references events (id) on delete cascade,
  reference text not null unique,
  source text not null check (source in ('qr', 'direct')),
  guest_name text not null,
  display_name text not null,
  message text,
  anonymous boolean not null default false,
  amount_kobo bigint not null check (amount_kobo > 0),
  platform_fee_kobo bigint not null default 0,
  mc_fee_kobo bigint not null default 0,
  celebrant_kobo bigint not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sprays_event_idx on sprays (event_id, id desc);

-- Lock everything down. Only our server (using the secret service role key)
-- can read or write. Browsers never talk to the database directly, which keeps
-- anonymous guests' real names private.
alter table events enable row level security;
alter table spray_intents enable row level security;
alter table sprays enable row level security;

-- A sample event so you can try things straight away. Delete it any time.
insert into events (slug, title, celebrants, mc_name, status, next_up, platform_fee_bps, mc_fee_bps,
                    account_number, account_bank, account_name)
values ('tolu-dayo', 'Tolu & Dayo’s wedding', 'Tolu & Dayo', 'MC Kunle', 'live',
        'Couple trivia starts after this song', 500, 200,
        '0123456789', 'Test Bank (demo)', 'DashPad / Tolu & Dayo')
on conflict (slug) do nothing;
