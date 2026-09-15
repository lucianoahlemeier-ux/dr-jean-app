# Chat Report MVP

A web app where someone drops in a WhatsApp chat export, an AI persona reads the
whole thing and writes a funny, sharp, warm **report** about the people in the
chat, and they get a **private link** to share back into the chat.

Modelled on *What Brandon Thinks* — but with your **own** persona + brand.

> **Persona is a placeholder.** The voice is the actual product. See
> [`lib/persona.ts`](lib/persona.ts) — fill in `{{PERSONA_NAME}}` and one absurd
> humanizing detail before you launch. Everything (wordmark, byline, prompt,
> emails, accent colour) reads from that one file.

---

## How it works (the architecture, and why)

Report generation calls Claude over a whole transcript and takes **minutes**.
Vercel Hobby serverless functions **die at 10 seconds**. So generation **cannot**
run in the upload request. The flow is intentionally split:

```
[browser]  wizard collects answers + the .zip
     │
     ▼
[/api/generate]  validate + stash raw file in temp storage
                 + create report row (status=queued) + enqueue Inngest event
                 → returns a token in <1s (safely under 10s)
     │
     ▼
[Inngest job]  download the file → parse to transcript (in memory)
               → call Claude (persona prompt) → save report (status=done)
               → DELETE the raw file → email the private link
     │
     ▼
[/r/{token}]   report page reads the saved report
```

**Privacy promise (non-negotiable):** the raw chat is **never persisted**. It
lives in temp storage only during the job and is deleted immediately after
generating. Only the finished report + metadata are stored. See
[`app/privacy`](app/privacy/page.tsx).

**It's a prompt, not an agent** — one Claude call. No agent framework.

---

## Stack — all free-tier (except the model)

| Concern | Tool |
|---|---|
| Frontend + report pages + API routes | **Next.js (App Router) + Tailwind** → Vercel Hobby |
| Long report generation job | **Inngest** |
| Report records + share tokens + temp upload | **Supabase** (Postgres + Storage) |
| Email the report link | **Resend** (optional) |
| The AI that writes the report | **Anthropic API** — the one paid piece |

---

## Local setup

You need four accounts (Anthropic is the only paid one; the rest are free tiers).

### 1. Install & configure

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
```

### 2. Anthropic

- Create a key at <https://console.anthropic.com/> → put it in `ANTHROPIC_API_KEY`.
- Model defaults to `claude-sonnet-5` (the docs spec names Sonnet). Override with
  `ANTHROPIC_MODEL` — cheaper `claude-haiku-4-5`, sharper `claude-opus-4-8`.

### 3. Supabase

- Create a project at <https://supabase.com/>.
- **Project Settings → API**: copy the **Project URL** → `SUPABASE_URL`, and the
  **`service_role`** key → `SUPABASE_SERVICE_ROLE_KEY` (server-side only — never
  expose it to the browser).
- **SQL Editor → New query**: paste and run [`supabase/schema.sql`](supabase/schema.sql).
  It creates the `reports` table and the `uploads` (private, temp) + `covers`
  (public) storage buckets.

### 4. Inngest

- Local dev: no keys needed — run the Inngest Dev Server (below). It discovers
  the app at `http://localhost:3000/api/inngest`.
- Production: create an app in the [Inngest dashboard](https://app.inngest.com/),
  copy the **Event Key** → `INNGEST_EVENT_KEY` and **Signing Key** →
  `INNGEST_SIGNING_KEY`.

### 5. Stripe (the paywall)

- Create an account at <https://dashboard.stripe.com/>.
- **Developers → API keys**: copy the **Secret key** → `STRIPE_SECRET_KEY`.
- **Developers → Webhooks → Add endpoint**: URL `{your app url}/api/stripe/webhook`,
  listening for `checkout.session.completed`. Copy the endpoint's **Signing
  secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`. For local dev, use the
  [Stripe CLI](https://stripe.com/docs/stripe-cli) instead:
  `stripe listen --forward-to localhost:3000/api/stripe/webhook` (it prints a
  `whsec_...` to use locally).
  > **Register the endpoint in the same environment you're testing in.** A
  > sandbox/test payment does not deliver to an endpoint registered in live
  > mode, and the failure is silent — checkout succeeds and the report just
  > never unlocks. (The reconcile in `lib/checkoutStatus.ts` covers for this,
  > so the symptom is "unlocks only after a page load" rather than "never
  > unlocks" — easy to miss.)
- **API version:** Managed Payments is enabled by default on new accounts and
  needs API version `2025-03-31.basil` or later, so `lib/stripe.ts` pins
  `2025-08-27.basil` explicitly. It also requires a `tax_code` on the product,
  which `app/api/checkout/[token]` sets. Don't drop either without testing a
  real checkout — both produce a 500 at session creation, surfaced as a raw
  Stripe error under the unlock button.
- `REPORT_PRICE_CENTS` (optional) — price to unlock one report, in cents.
  Defaults to `499` ($4.99).
- Existing database? Run [`supabase/migrations/0002_rate_limit.sql`](supabase/migrations/0002_rate_limit.sql)
  too — it creates the counter table behind the spend guards below. A fresh
  `supabase/schema.sql` already includes it.
- If you already have a live Supabase database (created before the paywall
  shipped), run [`supabase/migrations/0001_add_paywall.sql`](supabase/migrations/0001_add_paywall.sql)
  once in the SQL editor — it's just `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  safe to run more than once. A fresh `supabase/schema.sql` already includes
  these columns.

### 6. Resend (optional)

- The private link is the real deliverable, so email is optional — without a key
  the job just logs the link to the server console.
- To enable: create a key at <https://resend.com/> → `RESEND_API_KEY`, and set a
  verified sender in `RESEND_FROM`.

### 7. Run it

Two terminals:

```bash
# terminal 1 — the app
npm run dev

# terminal 2 — the Inngest Dev Server (runs the generation job locally)
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open <http://localhost:3000>, click **Get the Report**, and walk the wizard. For
the upload step, use a WhatsApp export of your own (**Export chat → Without
media**) — either the `.zip` or the `.txt` inside it, both are accepted. Drop it
at `sample/_chat.txt` if you want it handy for repeat runs; `.gitignore` covers
`_chat.txt` so a real conversation can't be committed to this public repo by
accident. Nothing is bundled — a sample export would be somebody's actual
private chat.

You'll land on a status screen; once the Inngest job finishes, it redirects to
your report at `/r/{token}`.

> Tip: watch the Inngest Dev Server UI (it prints a local URL) to see the job run
> step-by-step: mark-processing → parse-and-generate → save-report →
> delete-raw-upload → send-email.

---

## Fill in your persona (do this before launch)

Edit [`lib/persona.ts`](lib/persona.ts):

- `name` — your persona's name (replaces `{{PERSONA_NAME}}` everywhere).
- `absurdDetail` — one absurd humanizing detail (the reference used "an
  unexplained fondness for lasagna" — invent your own).
- `voice`, `tagline`, `byline`, `accent` — tune the vibe.

The report structure and craft rules live in [`lib/prompt.ts`](lib/prompt.ts).

---

## Scope (v1)

WhatsApp-only, Classic Report only, email-only delivery. Shown but **not built**
(marked "coming soon"): iMessage, the Deep Report / Mirror tiers, accounts.
These are intentional TODOs, not omissions.

**The paywall:** every report is generated in full. An unpaid visitor at
`/r/{token}` gets the "star review" headline stats (dimension names + star
ratings) and **one** section of prose — "the roles you THINK you play vs the
roles you ACTUALLY play", the sharpest hook in the report — in a card whose
lower half dissolves into a progressive blur with the unlock card on top.
The page ends there: no sign-off, no share bar, no "get another report"
pitch competing with the CTA. Paying via Stripe Checkout (one-time, no
account) sets a `paid` flag on that report's row, and the token URL then
always shows the full report.

Only the teaser section is sent to an unpaid browser — the locked prose
isn't in the page source, blurred or otherwise. See
[`components/ReportBody.tsx`](components/ReportBody.tsx) and
[`lib/reportPreview.ts`](lib/reportPreview.ts).

**Two paths set `paid`, and both ask Stripe:**

1. The [`checkout.session.completed` webhook](app/api/stripe/webhook/route.ts)
   — the primary path, and the only one that works if the buyer closes the
   tab the instant they've paid.
2. [`lib/checkoutStatus.ts`](lib/checkoutStatus.ts) — when the report page
   renders a report that's unpaid but has a checkout session against it, it
   retrieves that session from Stripe and writes the flag if it was paid.

The second exists because the first used to be the only one, and the first
real payment through this flow didn't unlock: money taken, report still
locked, no way out. A webhook that doesn't land (wrong environment, stale
signing secret, transient DB error) must not be able to strand a paying
customer. Neither path trusts the `?checkout=success` query param — anyone
can type that — only Stripe's own answer, server-side.

---

## Spend guards (read before opening this to the public)

`/api/generate` takes no authentication, and every call it accepts enqueues a
job that calls Claude over an entire transcript. Because reports are generated
**in full before the paywall**, that money is spent whether or not anyone ever
pays — so an open endpoint is an open tab on your Anthropic bill. Three limits
bound it, all tunable in `.env`:

| Guard | Where | Default |
|---|---|---|
| Upload size | `app/api/generate` | 4MB (Vercel caps the body near this anyway) |
| Reports per day, per IP / per email | [`lib/rateLimit.ts`](lib/rateLimit.ts) | 10 / 5 |
| Transcript size worth paying to read | [`lib/chunking.ts`](lib/chunking.ts) | 2,000,000 est. tokens |

The rate limiter counts in Postgres rather than memory on purpose: serverless
spreads requests across instances that share none, so an in-memory counter
bounds one warm instance and nothing else — protection that tests fine and
isn't there when it matters. It stores salted hashes, never raw IPs or emails,
and **fails open** if its own table misbehaves (a limiter that takes the
product down has caused a worse outage than the abuse it was guarding against
— watch the logs for `[ratelimit]`).

`MAX_TRANSCRIPT_TOKENS` is a business number, not a technical one. Measure
what a report at that size actually costs against what you charge, and set it
from that.

---

## Project layout

```
app/
  page.tsx                 landing (hero, reaction strip, tiers, FAQ)
  get-report/page.tsx      the 11-step onboarding wizard
  status/[token]/page.tsx  "reading your chat…" status poller
  r/[token]/page.tsx       the report page (private link)
  privacy/page.tsx         privacy policy / how it works
  api/parse                in-memory parse → message count + participants
  api/generate             validate + stash + enqueue (fast)
  api/report/[token]       status/report JSON (polled by the status page)
  api/inngest              Inngest serve endpoint
  api/checkout/[token]     creates a Stripe Checkout session to unlock a report
  api/stripe/webhook       marks a report paid on checkout.session.completed
components/
  ReportBody.tsx           the report as cards: all of them if paid, else the
                           one teaser section fading into the unlock card
  CheckoutSyncing.tsx      brief "unlocking…" poll right after Stripe redirects back
lib/
  persona.ts               ← the brand. fill this in.
  prompt.ts                the Classic Report scaffold + persona system prompt
  whatsapp.ts              defensive WhatsApp export parser
  generate.ts              the single Claude call
  inngest/                 client + the generation job
  reportPreview.ts         splits the report into sections + picks/clamps the
                           free teaser (headline stats + the "roles" section)
  checkoutStatus.ts        asks Stripe whether a session was paid, when the
                           webhook hasn't marked the report
  rateLimit.ts             per-IP / per-email daily caps on /api/generate
  pricing.ts, stripe.ts    paywall price + server-only Stripe client
  supabase.ts, email.ts, types.ts
supabase/schema.sql        DB + buckets
supabase/migrations/       one-off ALTERs for databases created before a feature shipped
sample/_chat.txt           your own export to test against (gitignored, not bundled)
```

---

## Deploy

Push to GitHub → import into Vercel → add the same env vars → set
`NEXT_PUBLIC_APP_URL` to your deployed URL. Register the app with Inngest Cloud
(point it at `https://your-app.vercel.app/api/inngest`). Register the Stripe
webhook (point it at `https://your-app.vercel.app/api/stripe/webhook`,
`checkout.session.completed`) and set `STRIPE_WEBHOOK_SECRET` to its signing
secret. Done.
