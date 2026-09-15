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
