-- ─────────────────────────────────────────────────────────────────────────────
-- Chat Report MVP — Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL → New query).
--
-- Privacy by design (docs/02): there is NO raw-transcript column, table, or
-- long-lived bucket object. We persist only the finished report + metadata.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reports (
  id                uuid primary key,
  token             text unique not null,
  status            text not null default 'queued'
                      check (status in ('queued','processing','done','failed')),
  language          text not null,
  relationship_type text not null,
  freeform_context  text,
  platform          text not null,
  email             text not null,
  report_markdown   text,
  message_count     integer,
  chat_title        text,
  cover_image_url   text,
  created_at        timestamptz not null default now(),
  error             text,
  -- Paywall (Stripe, one-time payment per report — see docs on the paywall).
  paid                      boolean not null default false,
  paid_at                   timestamptz,
  stripe_session_id         text,
  stripe_payment_intent_id  text
);

create index if not exists reports_token_idx on public.reports (token);

-- The server uses the SERVICE ROLE key (which bypasses RLS), so no policies are
-- required for the app to work. RLS is enabled with no public policies so that
-- the anon/public key cannot read rows even if it leaks.
alter table public.reports enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets
-- Create these in Storage → New bucket (or via SQL below).
--   uploads : PRIVATE. Holds the raw .zip TEMPORARILY during generation. The
--             Inngest job deletes each object immediately after writing the
--             report. Nothing here is meant to outlive a job.
--   covers  : PUBLIC. Optional group cover photos (NOT the chat).
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;
-- Spend guard for /api/generate (lib/rateLimit.ts).
--
-- /api/generate is unauthenticated and every accepted call enqueues a job
-- that calls Claude over a whole transcript — money spent before anyone has
-- paid, since reports are generated in full ahead of the paywall. This table
-- is the counter behind the per-IP / per-email daily caps.
--
-- Safe to run more than once. A fresh supabase/schema.sql already includes it.
create table if not exists rate_limit_hits (
  id bigserial primary key,
  -- "ip:<hash>" or "email:<hash>" — a salted SHA-256, never the raw value.
  -- An IP is personal data and we only need "same actor as before?", which a
  -- keyed hash answers without retaining the identifier.
  bucket text not null,
  created_at timestamptz not null default now()
);

-- Every read is "count rows for this bucket since <timestamp>", so the index
-- matches that shape exactly.
create index if not exists rate_limit_hits_bucket_time
  on rate_limit_hits (bucket, created_at desc);

-- Rows older than the window are pruned opportunistically by the app; this
-- index keeps that delete cheap.
create index if not exists rate_limit_hits_created_at
  on rate_limit_hits (created_at);

alter table rate_limit_hits enable row level security;
-- No policies: the app reaches this only with the service role key, which
-- bypasses RLS. Enabling it with zero policies means anon/authenticated
-- clients can read nothing, which is what we want for a table of hashes.
