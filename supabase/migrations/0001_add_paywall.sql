-- ─────────────────────────────────────────────────────────────────────────────
-- Paywall migration — run this once in Supabase SQL editor (Project → SQL →
-- New query) against an EXISTING database that was created before the
-- paywall shipped. Idempotent: safe to run more than once.
--
-- Adds Stripe one-time-payment tracking to `reports`. No new tables — the
-- existing token IS the access key, same as the rest of the app.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.reports
  add column if not exists paid boolean not null default false,
  add column if not exists paid_at timestamptz,
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text;
