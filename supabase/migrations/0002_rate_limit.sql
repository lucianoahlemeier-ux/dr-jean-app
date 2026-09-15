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
