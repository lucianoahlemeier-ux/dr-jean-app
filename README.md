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

### 5. Resend (optional)

- The private link is the real deliverable, so email is optional — without a key
  the job just logs the link to the server console.
- To enable: create a key at <https://resend.com/> → `RESEND_API_KEY`, and set a
  verified sender in `RESEND_FROM`.

### 6. Run it

Two terminals:

```bash
# terminal 1 — the app
npm run dev

# terminal 2 — the Inngest Dev Server (runs the generation job locally)
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open <http://localhost:3000>, click **Get the Report**, and walk the wizard. For
the upload step, use a real WhatsApp export (**Export chat → Without media**),
or the bundled sample [`sample/_chat.txt`](sample/_chat.txt) (zip it first, or
upload the `.txt` directly — both are accepted).

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
(marked "coming soon"): iMessage, the Deep Report / Mirror tiers, payments,
accounts. These are intentional TODOs, not omissions.

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
lib/
  persona.ts               ← the brand. fill this in.
  prompt.ts                the Classic Report scaffold + persona system prompt
  whatsapp.ts              defensive WhatsApp export parser
  generate.ts              the single Claude call
  inngest/                 client + the generation job
  supabase.ts, email.ts, types.ts
supabase/schema.sql        DB + buckets
sample/_chat.txt           a sample export to test against
```

---

## Deploy

Push to GitHub → import into Vercel → add the same env vars → set
`NEXT_PUBLIC_APP_URL` to your deployed URL. Register the app with Inngest Cloud
(point it at `https://your-app.vercel.app/api/inngest`). Done.
